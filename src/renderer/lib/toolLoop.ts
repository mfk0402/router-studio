/**
 * Agent Tool Loop — orchestrates tool calling during a chat turn.
 *
 * When the model returns tool_calls, this loop:
 * 1. Executes each tool (approval handled by main process)
 * 2. Appends tool results to messages
 * 3. Calls the model again
 * 4. Repeats until model responds with content only (no tool_calls)
 */

import type {
  ChatMessage,
  ToolCall,
  ToolDefinition,
  StreamChunk,
  ProductMode,
  CompletionUsageSnapshot,
} from '../../shared/types';
import { stopReason } from './stopConditions';
import { recordCompletionBudgetUsage } from './usageBudget';
import { streamingCompletionAttempts } from './openrouterClient';

export interface ToolLoopOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: ChatMessage[];
  userContent: ChatMessage['content'];
  temperature: number;
  maxTokens: number;
  tools: ToolDefinition[];
  maxToolHops: number;
  onStreamChunk: (chunk: StreamChunk) => void;
  onToolCallStart: (toolCall: { id: string; name: string; args: string }) => void;
  onToolCallEnd: (toolCall: { id: string; name: string; args: Record<string, unknown>; result: string; success: boolean }) => void;
  onLog: (message: string) => void;
  /** Called after each model turn with full messages so far */
  onMessagesUpdate: (messages: ChatMessage[]) => void;
  /** Signal to abort the loop */
  abortSignal?: AbortSignal;
  /** Saved task id when running inside Agent Mode (for spawn_agent, etc.). */
  activeTaskId?: string | null;
  /** Product mode for tool allow/deny (must match definitions loaded for this loop). */
  productMode?: ProductMode;
  /** After tool results, use this model for deeper hops (smart routing). */
  reasoningModel?: string;
  /** Local OpenAI-compatible API (`…/v1`), same semantics as ChatCompletionRequest.openAiBaseUrl. */
  openAiBaseUrl?: string;
  /** Dropdown fallback — tried after primary model for this hop fails (with Settings chain extras). */
  fallbackModel?: string;
  completionFallbackModels?: string[];
}

export interface ToolLoopResult {
  /** Final assistant content */
  content: string;
  /** Model that generated the response */
  modelUsed: string;
  /** Total tool calls made */
  toolCallCount: number;
  /** Was the loop aborted? */
  aborted: boolean;
  /** Final message list (includes tool messages) */
  messages: ChatMessage[];
}

/** Maximum number of retry attempts for transient errors. */
const MAX_RETRIES = 2;

/** Base delay in ms for exponential backoff. */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyCredentialOrAccountError(message: string): boolean {
  return /\(401\)|\(402\)|Invalid or missing API key|Payment required for this model/i.test(message);
}

async function retryTransientStreamingCall(
  invoke: () => Promise<ModelCallResult>,
  onLog: (message: string) => void,
  abortSignal?: AbortSignal,
): Promise<ModelCallResult> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await invoke();
    } catch (err) {
      lastError = err as Error;
      if (abortSignal?.aborted || lastError.message === 'Aborted') {
        throw lastError;
      }
      const retryable = isRetryableError(lastError);
      if (!retryable || attempt >= MAX_RETRIES) {
        throw lastError;
      }
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      onLog(
        `Transient API error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError.message}. Retrying in ${delay}ms...`,
      );
      await sleep(delay);
    }
  }
  throw lastError ?? new Error('Unknown transient stream error.');
}

async function invokeWithStreamingFallback(opts: {
  apiKey: string;
  candidates: string[];
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  tools: ToolDefinition[] | undefined;
  onStreamChunk: (chunk: StreamChunk) => void;
  abortSignal?: AbortSignal;
  openAiBaseUrl?: string;
  onLog: (message: string) => void;
}): Promise<ModelCallResult> {
  let lastErr: Error | undefined;
  for (let ci = 0; ci < opts.candidates.length; ci++) {
    const m = opts.candidates[ci];
    try {
      return await retryTransientStreamingCall(
        () =>
          callModelWithTools({
            apiKey: opts.apiKey,
            model: m,
            messages: opts.messages,
            temperature: opts.temperature,
            maxTokens: opts.maxTokens,
            tools: opts.tools,
            onStreamChunk: opts.onStreamChunk,
            abortSignal: opts.abortSignal,
            openAiBaseUrl: opts.openAiBaseUrl,
          }),
        opts.onLog,
        opts.abortSignal,
      );
    } catch (e) {
      lastErr = e as Error;
      if (opts.abortSignal?.aborted || lastErr.message === 'Aborted') {
        throw lastErr;
      }
      if (isLikelyCredentialOrAccountError(lastErr.message)) {
        throw lastErr;
      }
      if (ci < opts.candidates.length - 1) {
        opts.onLog(`✗ Model ${m} failed: ${lastErr.message}; trying next in fallback chain…`);
      }
    }
  }
  throw lastErr ?? new Error('All completion fallback attempts failed.');
}

/**
 * Run the agent tool loop.
 */
export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const {
    apiKey,
    model,
    systemPrompt,
    history,
    userContent,
    temperature,
    maxTokens,
    tools,
    maxToolHops,
    onStreamChunk,
    onToolCallStart,
    onToolCallEnd,
    onLog,
    onMessagesUpdate,
    abortSignal,
    activeTaskId,
    reasoningModel,
    openAiBaseUrl,
    productMode,
    fallbackModel,
    completionFallbackModels,
  } = opts;

  // Build initial messages
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ];

  let hops = 0;
  let finalContent = '';
  let modelUsed = model;
  let totalToolCalls = 0;

  while (hops < maxToolHops) {
    if (abortSignal?.aborted) {
      return {
        content: finalContent,
        modelUsed,
        toolCallCount: totalToolCalls,
        aborted: true,
        messages,
      };
    }

    const modelThisRound = hops === 0 ? model : reasoningModel || model;

    let result: ModelCallResult;
    try {
      const attempts = streamingCompletionAttempts(
        modelThisRound,
        fallbackModel,
        completionFallbackModels,
      );
      result = await invokeWithStreamingFallback({
        apiKey,
        candidates: attempts,
        messages,
        temperature,
        maxTokens,
        tools: tools.length > 0 ? tools : undefined,
        onStreamChunk,
        abortSignal,
        openAiBaseUrl,
        onLog,
      });
    } catch (err) {
      if (abortSignal?.aborted) {
        return {
          content: finalContent,
          modelUsed,
          toolCallCount: totalToolCalls,
          aborted: true,
          messages,
        };
      }
      throw err;
    }

    recordCompletionBudgetUsage(result.usage);

    modelUsed = result.model;

    // If model returned content, add it
    if (result.content) {
      finalContent = result.content;
    }

    // If no tool calls, we're done
    if (!result.toolCalls || result.toolCalls.length === 0) {
      // Add final assistant message
      messages.push({
        role: 'assistant',
        content: result.content,
      });
      onMessagesUpdate(messages);
      break;
    }

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls,
    });
    onMessagesUpdate(messages);

    totalToolCalls += result.toolCalls.length;

    const toolMessages = await Promise.all(
      result.toolCalls.map(async (tc): Promise<ChatMessage> => {
        onToolCallStart({
          id: tc.id,
          name: tc.function.name,
          args: tc.function.arguments ?? '',
        });

        if (abortSignal?.aborted) {
          const errText = 'Error: aborted before execution.';
          onToolCallEnd({
            id: tc.id,
            name: tc.function.name,
            args: {},
            result: errText,
            success: false,
          });
          return {
            role: 'tool',
            tool_call_id: tc.id,
            content: errText,
          };
        }

        const rawArgs = tc.function.arguments?.trim() ?? '';
        let args: Record<string, unknown>;
        try {
          args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
        } catch {
          const preview = rawArgs.slice(0, 800);
          onLog(`Tool ${tc.function.name}: invalid JSON arguments (preview ${preview.length} chars)`);
          const errText = `Error: malformed tool arguments — invalid JSON. Preview: ${preview}${rawArgs.length > 800 ? '…' : ''}`;
          onToolCallEnd({
            id: tc.id,
            name: tc.function.name,
            args: {},
            result: errText,
            success: false,
          });
          return {
            role: 'tool',
            tool_call_id: tc.id,
            content: errText,
          };
        }

        onLog(`Tool: ${tc.function.name}(${truncateArgs(args)})`);

        const toolResult = await window.api.tools.execute(tc.function.name, args, {
          taskId: activeTaskId ?? undefined,
          productMode,
        });

        const resultStr = toolResult.success
          ? JSON.stringify(toolResult.result)
          : `Error: ${toolResult.error}`;

        onToolCallEnd({
          id: tc.id,
          name: tc.function.name,
          args,
          result: resultStr,
          success: toolResult.success,
        });

        return {
          role: 'tool',
          tool_call_id: tc.id,
          content: resultStr,
        };
      }),
    );

    messages.push(...toolMessages);

    const guardStop = stopReason({
      toolCallsTotal: totalToolCalls,
      maxToolHops,
    });
    if (guardStop) {
      onLog(guardStop);
      const note = `[Agent stopped] ${guardStop}`;
      messages.push({
        role: 'assistant',
        content: note,
      });
      onMessagesUpdate(messages);
      finalContent = note;
      break;
    }

    onMessagesUpdate(messages);
    hops++;

    if (hops >= maxToolHops) {
      onLog(`Tool hop limit reached (${maxToolHops}). Forcing final response.`);
      const modelFinal = reasoningModel || model;
      const finalAttempts = streamingCompletionAttempts(
        modelFinal,
        fallbackModel,
        completionFallbackModels,
      );
      let final: ModelCallResult;
      try {
        final = await invokeWithStreamingFallback({
          apiKey,
          candidates: finalAttempts,
          messages,
          temperature,
          maxTokens,
          tools: undefined,
          onStreamChunk,
          abortSignal,
          openAiBaseUrl,
          onLog,
        });
      } catch (finalErrRaw) {
        const finalErr = finalErrRaw as Error;
        if (abortSignal?.aborted) {
          return {
            content: finalContent,
            modelUsed,
            toolCallCount: totalToolCalls,
            aborted: true,
            messages,
          };
        }
        throw finalErr;
      }
      recordCompletionBudgetUsage(final.usage);
      finalContent = final.content;
      modelUsed = final.model;
      messages.push({
        role: 'assistant',
        content: final.content,
      });
      onMessagesUpdate(messages);
      break;
    }
  }

  return {
    content: finalContent,
    modelUsed,
    toolCallCount: totalToolCalls,
    aborted: abortSignal?.aborted ?? false,
    messages,
  };
}

/**
 * Check if an error from the API is transient and worth retrying.
 */
function isRetryableError(err: Error): boolean {
  const msg = err.message || '';
  const lower = msg.toLowerCase();
  if (/\(429\)/.test(msg) || /\(50[234]\)/.test(msg)) return true;
  if (
    /rate.?limit/i.test(msg) ||
    /server error/i.test(msg) ||
    /overloaded|temporarily unavailable|try again|timeout|timed out/.test(lower)
  ) {
    return true;
  }
  if (/econnreset|etimedout|enotfound|econnrefused|socket hang up|fetch failed/i.test(msg)) {
    return true;
  }
  return false;
}

interface ModelCallResult {
  content: string;
  model: string;
  toolCalls?: ToolCall[];
  usage?: CompletionUsageSnapshot;
}

async function callModelWithTools(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  tools?: ToolDefinition[];
  onStreamChunk: (chunk: StreamChunk) => void;
  abortSignal?: AbortSignal;
  openAiBaseUrl?: string;
}): Promise<ModelCallResult> {
  const { apiKey, model, messages, temperature, maxTokens, tools, onStreamChunk, abortSignal, openAiBaseUrl } =
    opts;

  // Start streaming request
  const requestId = await window.api.openrouter.chatStreamStart({
    apiKey,
    model,
    messages,
    temperature,
    maxTokens,
    stream: true,
    tools,
    tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
    openAiBaseUrl,
  });

  return new Promise((resolve, reject) => {
    let content = '';
    let modelUsed = model;
    const toolCalls: ToolCall[] = [];
    let lastUsage: CompletionUsageSnapshot | undefined;
    const toolCallAccumulators = new Map<number, {
      id: string;
      name: string;
      arguments: string;
    }>();

    const handleAbort = () => {
      void window.api.openrouter.chatStreamCancel(requestId);
      reject(new Error('Aborted'));
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', handleAbort);
    }

    const unsub = window.api.events.onChatStream((chunk) => {
      if (chunk.requestId !== requestId) return;

      switch (chunk.type) {
        case 'delta':
          if (chunk.content) {
            content += chunk.content;
            onStreamChunk(chunk);
          }
          break;

        case 'tool_call_start':
          if (chunk.toolCallIndex != null && chunk.toolCallId && chunk.toolName) {
            toolCallAccumulators.set(chunk.toolCallIndex, {
              id: chunk.toolCallId,
              name: chunk.toolName,
              arguments: '',
            });
          }
          break;

        case 'tool_call_delta':
          if (chunk.toolCallIndex != null && chunk.toolArgsDelta) {
            const acc = toolCallAccumulators.get(chunk.toolCallIndex);
            if (acc) {
              acc.arguments += chunk.toolArgsDelta;
            }
          }
          break;

        case 'tool_call_end':
          // Tool call complete, already accumulated
          break;

        case 'done':
          if (chunk.model) modelUsed = chunk.model;
          if (chunk.usage) lastUsage = chunk.usage;
          unsub();
          if (abortSignal) {
            abortSignal.removeEventListener('abort', handleAbort);
          }

          // Convert accumulators to tool calls
          for (const [, acc] of toolCallAccumulators) {
            if (acc.id && acc.name) {
              toolCalls.push({
                id: acc.id,
                type: 'function',
                function: {
                  name: acc.name,
                  arguments: acc.arguments,
                },
              });
            }
          }

          resolve({
            content,
            model: modelUsed,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: lastUsage,
          });
          break;

        case 'error':
          unsub();
          if (abortSignal) {
            abortSignal.removeEventListener('abort', handleAbort);
          }
          reject(new Error(chunk.error ?? 'Streaming error'));
          break;
      }
    });
  });
}

function truncateArgs(args: Record<string, unknown>): string {
  const str = JSON.stringify(args);
  if (str.length <= 60) return str;
  return str.slice(0, 57) + '...';
}
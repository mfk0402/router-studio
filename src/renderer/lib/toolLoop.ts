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
} from '../../shared/types';

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
  /** After tool results, use this model for deeper hops (smart routing). */
  reasoningModel?: string;
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

    // Call the model
    const result = await callModelWithTools({
      apiKey,
      model: modelThisRound,
      messages,
      temperature,
      maxTokens,
      tools: tools.length > 0 ? tools : undefined,
      onStreamChunk,
      abortSignal,
    });

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

    // Execute each tool call
    for (const tc of result.toolCalls) {
      if (abortSignal?.aborted) break;

      totalToolCalls++;
      let args: Record<string, unknown> = {};

      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = { _raw: tc.function.arguments };
      }

      onToolCallStart({
        id: tc.id,
        name: tc.function.name,
        args: tc.function.arguments,
      });

      onLog(`Tool: ${tc.function.name}(${truncateArgs(args)})`);

      // Execute the tool
      const toolResult = await window.api.tools.execute(tc.function.name, args, {
        taskId: activeTaskId ?? undefined,
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

      // Add tool result message
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultStr,
      });
    }

    onMessagesUpdate(messages);
    hops++;

    if (hops >= maxToolHops) {
      onLog(`Tool hop limit reached (${maxToolHops}). Forcing final response.`);
      const modelFinal = reasoningModel || model;
      // One more call with tool_choice: none to get final response
      const final = await callModelWithTools({
        apiKey,
        model: modelFinal,
        messages,
        temperature,
        maxTokens,
        tools: undefined,
        onStreamChunk,
        abortSignal,
      });
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

interface ModelCallResult {
  content: string;
  model: string;
  toolCalls?: ToolCall[];
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
}): Promise<ModelCallResult> {
  const { apiKey, model, messages, temperature, maxTokens, tools, onStreamChunk, abortSignal } = opts;

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
  });

  return new Promise((resolve, reject) => {
    let content = '';
    let modelUsed = model;
    const toolCalls: ToolCall[] = [];
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

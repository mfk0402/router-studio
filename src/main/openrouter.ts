import type { BrowserWindow } from 'electron';
import type {
  ChatCompletionRequest,
  CompletionUsageSnapshot,
  OpenRouterModelRaw,
  StreamChunk,
  ToolCall,
} from '../shared/types.js';
import { recordCompletion } from './localStats.js';

const API_BASE = 'https://openrouter.ai/api/v1';
const APP_REFERER = 'https://router-studio.local';
const APP_TITLE = 'Router Studio';

function normalizeUsageInput(raw: unknown): CompletionUsageSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const snap: CompletionUsageSnapshot = {};
  if (typeof o.prompt_tokens === 'number') snap.prompt_tokens = o.prompt_tokens;
  if (typeof o.completion_tokens === 'number') snap.completion_tokens = o.completion_tokens;
  if (typeof o.total_tokens === 'number') snap.total_tokens = o.total_tokens;
  const pd = o.prompt_tokens_details;
  if (pd && typeof pd === 'object') {
    const c = (pd as Record<string, unknown>).cached_tokens;
    if (typeof c === 'number') snap.cached_tokens = c;
  }
  return Object.keys(snap).length > 0 ? snap : undefined;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': APP_REFERER,
    'X-Title': APP_TITLE,
  };
}

export async function testApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!apiKey) return { ok: false, error: 'Missing API key' };
  try {
    const res = await fetch(`${API_BASE}/models`, { headers: authHeaders(apiKey) });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: 'Invalid API key (401).' };
    if (res.status === 429) return { ok: false, error: 'Rate limited (429). Try again later.' };
    return { ok: false, error: `OpenRouter responded with HTTP ${res.status}.` };
  } catch (e) {
    return { ok: false, error: `Network error: ${(e as Error).message}` };
  }
}

export async function listModels(apiKey: string): Promise<OpenRouterModelRaw[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': APP_REFERER,
    'X-Title': APP_TITLE,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${API_BASE}/models`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch models: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: OpenRouterModelRaw[] };
  return Array.isArray(json.data) ? json.data : [];
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
  usage?: CompletionUsageSnapshot;
}

export async function chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
  if (!req.apiKey) throw new Error('OpenRouter API key missing. Add it in Settings.');

  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map((m) => {
      // Convert to OpenAI format
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.tool_call_id,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        };
      }
      const msg: Record<string, unknown> = {
        role: m.role,
        content: m.content,
      };
      if (m.tool_calls && m.tool_calls.length > 0) {
        msg.tool_calls = m.tool_calls;
      }
      if (m.name) {
        msg.name = m.name;
      }
      return msg;
    }),
    temperature: req.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? 2048,
    stream: false,
  };

  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools;
  }
  if (req.tool_choice) {
    body.tool_choice = req.tool_choice;
  }

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(req.apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(mapHttpError(res.status, txt));
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: ToolCall[];
      };
      finish_reason?: string;
    }>;
    model?: string;
    usage?: unknown;
  };

  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? '';
  const toolCalls = choice?.message?.tool_calls;
  const finishReason = choice?.finish_reason;

  return {
    content,
    model: data.model ?? req.model,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    finishReason,
    usage: normalizeUsageInput(data.usage),
  };
}

const activeStreams = new Map<string, AbortController>();

export function cancelStream(requestId: string): void {
  const ctl = activeStreams.get(requestId);
  if (ctl) {
    ctl.abort();
    activeStreams.delete(requestId);
  }
}

/** Accumulator for streaming tool calls */
interface ToolCallAccumulator {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export async function startChatStream(
  req: ChatCompletionRequest,
  requestId: string,
  win: BrowserWindow | null,
): Promise<void> {
  if (!win) return;

  let streamUsage: CompletionUsageSnapshot | undefined;
  let streamOk = true;
  let skipStreamStats = false;

  const send = (chunk: StreamChunk) => {
    if (!win.isDestroyed()) {
      win.webContents.send('openrouter:stream', { ...chunk, requestId });
    }
  };

  try {
    if (!req.apiKey) {
      streamOk = false;
      send({ type: 'error', error: 'OpenRouter API key missing. Add it in Settings.' });
      send({ type: 'done' });
      return;
    }

    const controller = new AbortController();
    activeStreams.set(requestId, controller);

    const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.tool_call_id,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        };
      }
      const msg: Record<string, unknown> = {
        role: m.role,
        content: m.content,
      };
      if (m.tool_calls && m.tool_calls.length > 0) {
        msg.tool_calls = m.tool_calls;
      }
      if (m.name) {
        msg.name = m.name;
      }
      return msg;
    }),
    temperature: req.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? 2048,
    stream: true,
  };

  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools;
  }
  if (req.tool_choice) {
    body.tool_choice = req.tool_choice;
  }

  // Accumulate tool calls by index
  const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

  try {
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(req.apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      streamOk = false;
      const txt = await safeText(res);
      send({ type: 'error', error: mapHttpError(res.status, txt) });
      send({ type: 'done' });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let modelReported: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE: split by double newline to get each "data: ..." event.
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const lines = part.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const payload = trimmed.replace(/^data:\s?/, '');

          if (payload === '[DONE]') {
            // Finalize any pending tool calls
            for (const [index, tc] of toolCallAccumulators) {
              send({
                type: 'tool_call_end',
                toolCallId: tc.id,
                toolCallIndex: index,
                toolName: tc.function.name,
                toolArgsDelta: tc.function.arguments,
              });
            }
            send({ type: 'done', model: modelReported, usage: streamUsage });
            return;
          }

          try {
            const evt = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
                    index: number;
                    id?: string;
                    type?: 'function';
                    function?: {
                      name?: string;
                      arguments?: string;
                    };
                  }>;
                };
                finish_reason?: string;
              }>;
              model?: string;
              usage?: unknown;
            };

            if (evt.model) modelReported = evt.model;
            const u = normalizeUsageInput(evt.usage);
            if (u) streamUsage = u;

            const choice = evt.choices?.[0];
            const delta = choice?.delta;

            // Handle text content
            if (typeof delta?.content === 'string' && delta.content.length > 0) {
              send({ type: 'delta', content: delta.content });
            }

            // Handle tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;

                if (!toolCallAccumulators.has(index)) {
                  // New tool call starting
                  toolCallAccumulators.set(index, {
                    id: tc.id ?? '',
                    type: 'function',
                    function: {
                      name: tc.function?.name ?? '',
                      arguments: '',
                    },
                  });

                  if (tc.id && tc.function?.name) {
                    send({
                      type: 'tool_call_start',
                      toolCallId: tc.id,
                      toolCallIndex: index,
                      toolName: tc.function.name,
                    });
                  }
                }

                const acc = toolCallAccumulators.get(index)!;

                // Update id if provided
                if (tc.id) acc.id = tc.id;

                // Update name if provided
                if (tc.function?.name) {
                  acc.function.name = tc.function.name;
                  send({
                    type: 'tool_call_start',
                    toolCallId: acc.id,
                    toolCallIndex: index,
                    toolName: acc.function.name,
                  });
                }

                // Accumulate arguments
                if (tc.function?.arguments) {
                  acc.function.arguments += tc.function.arguments;
                  send({
                    type: 'tool_call_delta',
                    toolCallId: acc.id,
                    toolCallIndex: index,
                    toolArgsDelta: tc.function.arguments,
                  });
                }
              }
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }
    }

    // Stream ended without [DONE], finalize tool calls
    for (const [index, tc] of toolCallAccumulators) {
      send({
        type: 'tool_call_end',
        toolCallId: tc.id,
        toolCallIndex: index,
        toolName: tc.function.name,
        toolArgsDelta: tc.function.arguments,
      });
    }
    send({ type: 'done', model: modelReported, usage: streamUsage });
    } catch (e) {
      const err = e as Error & { name?: string };
      if (err.name === 'AbortError') {
        skipStreamStats = true;
        send({ type: 'done' });
      } else {
        streamOk = false;
        send({ type: 'error', error: err.message || 'Streaming error.' });
        send({ type: 'done' });
      }
    }
  } finally {
    activeStreams.delete(requestId);
    if (!skipStreamStats) {
      void recordCompletion({
        ok: streamOk,
        usage: streamOk ? streamUsage : undefined,
      });
    }
  }
}

/** Get accumulated tool calls from a completed stream (used after stream finishes) */
export function getAccumulatedToolCalls(
  accumulators: Map<number, ToolCallAccumulator>,
): ToolCall[] {
  const result: ToolCall[] = [];
  for (const [, acc] of accumulators) {
    if (acc.id && acc.function.name) {
      result.push({
        id: acc.id,
        type: 'function',
        function: {
          name: acc.function.name,
          arguments: acc.function.arguments,
        },
      });
    }
  }
  return result;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function mapHttpError(status: number, body: string): string {
  let detail = '';
  try {
    const j = JSON.parse(body);
    if (j?.error?.message) detail = `: ${j.error.message}`;
  } catch {
    if (body) detail = `: ${body.slice(0, 200)}`;
  }
  if (status === 401) return `Invalid or missing API key (401)${detail}`;
  if (status === 402) return `Payment required for this model (402)${detail}`;
  if (status === 403) return `Access denied (403)${detail}`;
  if (status === 404) return `Model not found (404)${detail}`;
  if (status === 429) return `Rate limit reached (429)${detail}. Try again later or switch models.`;
  if (status >= 500) return `OpenRouter server error (${status})${detail}`;
  return `OpenRouter request failed (${status})${detail}`;
}

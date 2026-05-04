/**
 * Context Summarization System
 *
 * Automatically compresses older conversation turns when approaching context limits,
 * keeping the most recent context intact while preserving key information.
 */

import type { ChatMsg } from '../store/appStore';
import type { ChatMessage } from '../../shared/types';

// Token estimation (rough: 1 token ≈ 4 chars for English, 3 for code)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export interface SummarizationConfig {
  /** Max tokens before triggering auto-summarization */
  maxContextTokens: number;
  /** Target tokens after summarization */
  targetTokens: number;
  /** Minimum messages to keep unsummarized (most recent) */
  keepRecentMessages: number;
  /** Minimum messages needed before summarization is possible */
  minMessagesForSummary: number;
}

export const DEFAULT_SUMMARIZATION_CONFIG: SummarizationConfig = {
  maxContextTokens: 100000, // ~100K tokens trigger
  targetTokens: 50000,      // Compress to ~50K
  keepRecentMessages: 6,    // Keep last 6 messages intact
  minMessagesForSummary: 10, // Need at least 10 messages
};

export interface ContextAnalysis {
  totalTokens: number;
  messageCount: number;
  needsSummarization: boolean;
  messagesToSummarize: number;
  tokenSavings: number;
  percentUsed: number;
}

/**
 * Analyze the current context to determine if summarization is needed
 */
export function analyzeContext(
  messages: ChatMsg[],
  config: SummarizationConfig = DEFAULT_SUMMARIZATION_CONFIG,
): ContextAnalysis {
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const percentUsed = (totalTokens / config.maxContextTokens) * 100;

  const needsSummarization =
    totalTokens > config.maxContextTokens * 0.8 && // Over 80% capacity
    messages.length >= config.minMessagesForSummary;

  // Calculate how many messages we'd need to summarize
  let tokensToFree = totalTokens - config.targetTokens;
  let messagesToSummarize = 0;
  let tokenSavings = 0;

  if (needsSummarization) {
    // Count from oldest, excluding the most recent messages
    const summarizableMessages = messages.slice(0, -config.keepRecentMessages);
    for (const msg of summarizableMessages) {
      if (tokenSavings < tokensToFree) {
        tokenSavings += estimateTokens(msg.content);
        messagesToSummarize++;
      }
    }
  }

  return {
    totalTokens,
    messageCount: messages.length,
    needsSummarization,
    messagesToSummarize,
    tokenSavings,
    percentUsed: Math.round(percentUsed),
  };
}

/**
 * Build a prompt for the AI to summarize the conversation
 */
export function buildSummarizationPrompt(messagesToSummarize: ChatMsg[]): string {
  const conversationText = messagesToSummarize
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n---\n\n');

  return `Please provide a concise summary of the following conversation. Focus on:
1. Key decisions made
2. Important code changes or files modified
3. Outstanding issues or tasks
4. Critical context needed for continuing the conversation

Keep the summary under 500 words. Use bullet points for clarity.

CONVERSATION TO SUMMARIZE:
${conversationText}

SUMMARY:`;
}

/**
 * Create a summary message to replace old messages
 */
export function createSummaryMessage(summary: string, summarizedCount: number): ChatMsg {
  return {
    id: `summary-${Date.now()}`,
    role: 'system',
    content: `📋 **Conversation Summary** (${summarizedCount} messages compressed)\n\n${summary}\n\n---\n*The above is a summary of earlier messages. Recent context follows.*`,
    createdAt: Date.now(),
  };
}

/**
 * Perform the summarization by calling the AI
 */
export async function summarizeContext(
  messages: ChatMsg[],
  apiKey: string,
  model: string,
  config: SummarizationConfig = DEFAULT_SUMMARIZATION_CONFIG,
  openAiBaseUrl?: string,
): Promise<{ newMessages: ChatMsg[]; summary: string } | null> {
  const analysis = analyzeContext(messages, config);

  if (!analysis.needsSummarization || analysis.messagesToSummarize === 0) {
    return null;
  }

  // Split messages into those to summarize and those to keep
  const messagesToSummarize = messages.slice(0, analysis.messagesToSummarize);
  const messagesToKeep = messages.slice(analysis.messagesToSummarize);

  // Build the summarization prompt
  const prompt = buildSummarizationPrompt(messagesToSummarize);

  try {
    // Call the AI to generate a summary
    const response = await window.api.openrouter.chat({
      apiKey,
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1000,
      temperature: 0.3,
      stream: false,
      openAiBaseUrl,
    });

    if (!response.content) {
      console.error('[summarizer] No content in response');
      return null;
    }

    // Create the new message list with summary
    const summaryMessage = createSummaryMessage(response.content, messagesToSummarize.length);
    const newMessages = [summaryMessage, ...messagesToKeep];

    return {
      newMessages,
      summary: response.content,
    };
  } catch (e) {
    console.error('[summarizer] Failed to generate summary:', e);
    return null;
  }
}

/**
 * Quick local summarization (no AI call) - extracts key points heuristically
 */
export function quickLocalSummary(messages: ChatMsg[]): string {
  const topics: string[] = [];
  const files: Set<string> = new Set();
  const actions: string[] = [];
  let codeBlocks = 0;
  let toolCalls = 0;

  for (const msg of messages) {
    const content = msg.content;

    // Extract file paths
    const fileMatches = content.match(/`([^`]+\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|css|html|json|md|txt))`/gi);
    if (fileMatches) {
      fileMatches.forEach((f) => files.add(f.replace(/`/g, '')));
    }

    // Count code blocks
    const codeBlockMatches = content.match(/```[\s\S]*?```/g);
    if (codeBlockMatches) {
      codeBlocks += codeBlockMatches.length;
    }

    // Detect tool usage
    if (content.includes('tool_calls') || content.includes('[[TOOL:')) {
      toolCalls++;
    }

    // Extract action verbs from user messages
    if (msg.role === 'user') {
      const firstSentence = content.split(/[.!?\n]/)[0];
      if (firstSentence.length < 100) {
        topics.push(firstSentence.trim());
      }
    }

    // Look for completion markers
    if (content.includes('completed') || content.includes('finished') || content.includes('done')) {
      const match = content.match(/(completed|finished|done)[^.]*\./i);
      if (match) actions.push(match[0]);
    }
  }

  const parts: string[] = [];

  if (topics.length > 0) {
    parts.push(`**Topics discussed:** ${[...new Set(topics)].slice(0, 5).join('; ')}`);
  }

  if (files.size > 0) {
    parts.push(`**Files referenced:** ${[...files].slice(0, 10).join(', ')}`);
  }

  if (codeBlocks > 0) {
    parts.push(`**Code exchanges:** ${codeBlocks} code blocks shared`);
  }

  if (toolCalls > 0) {
    parts.push(`**Tool usage:** ${toolCalls} tool operations performed`);
  }

  if (actions.length > 0) {
    parts.push(`**Completed actions:** ${actions.slice(0, 5).join('; ')}`);
  }

  return parts.join('\n') || 'Conversation history (no specific details extracted)';
}

/**
 * Perform quick local compaction without AI call
 */
export function compactContextLocally(
  messages: ChatMsg[],
  config: SummarizationConfig = DEFAULT_SUMMARIZATION_CONFIG,
): { newMessages: ChatMsg[]; summary: string } | null {
  if (messages.length < config.minMessagesForSummary) {
    return null;
  }

  // Keep the most recent messages
  const messagesToKeep = messages.slice(-config.keepRecentMessages);
  const messagesToSummarize = messages.slice(0, -config.keepRecentMessages);

  if (messagesToSummarize.length === 0) {
    return null;
  }

  const summary = quickLocalSummary(messagesToSummarize);
  const summaryMessage = createSummaryMessage(summary, messagesToSummarize.length);

  return {
    newMessages: [summaryMessage, ...messagesToKeep],
    summary,
  };
}

/**
 * Format token count for display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

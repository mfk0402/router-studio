/**
 * Smart Context Packer
 *
 * Intelligently packs context into the model's context window by:
 * 1. Prioritizing different types of context
 * 2. Budget-aware token counting
 * 3. Auto-summarizing old conversation turns when approaching the limit
 */

import type { ChatMessage, Attachment, Rule } from '../../shared/types';
import type { ChatMsg } from '../store/appStore';

// Priority levels for different context types (higher = more important)
export const PRIORITY = {
  SYSTEM_PROMPT: 100,
  TOOL_DEFINITIONS: 95,
  ACTIVE_RULES: 90,
  SELECTED_CODE: 85,
  CURRENT_FILE: 80,
  ATTACHMENTS: 75,
  RECENT_MESSAGES: 70,
  OLDER_MESSAGES: 50,
  SUMMARY: 40,
} as const;

// Rough token estimation (1 token ≈ 4 characters for English text, 3 for code)
function estimateTokens(text: string, isCode = false): number {
  const ratio = isCode ? 3 : 4;
  return Math.ceil(text.length / ratio);
}

export interface ContextItem {
  type: 'system' | 'rules' | 'file' | 'selection' | 'attachment' | 'message' | 'summary' | 'tools';
  priority: number;
  content: string;
  tokens: number;
  metadata?: {
    path?: string;
    messageId?: string;
    role?: 'user' | 'assistant' | 'system';
    originalTokens?: number;
  };
}

export interface PackerOptions {
  maxTokens: number;
  reserveForResponse: number;
  systemPrompt: string;
  rules: Rule[];
  currentFile?: { path: string; content: string; language: string };
  selectedCode?: string;
  attachments: Attachment[];
  messages: ChatMsg[];
  toolDefinitions?: string;
}

export interface PackedContext {
  items: ContextItem[];
  totalTokens: number;
  budget: number;
  truncated: boolean;
  summarizedTurns: number;
}

/**
 * Simple summarization - extract first line or truncate
 */
function summarizeMessage(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  // Try to find a natural break point
  const firstParagraph = content.split('\n\n')[0];
  if (firstParagraph.length <= maxChars) {
    return firstParagraph + '...';
  }

  // Just truncate
  return content.slice(0, maxChars - 3) + '...';
}

/**
 * Create a summary of multiple old messages
 */
function createConversationSummary(messages: ChatMsg[]): string {
  if (messages.length === 0) return '';

  const topics: string[] = [];
  let codeBlocks = 0;
  let filesMentioned: string[] = [];

  for (const msg of messages) {
    // Extract file paths mentioned
    const pathMatches = msg.content.match(/`([^`]+\.(ts|js|py|go|rs|java|c|cpp|h|css|html|json|md|txt))`/gi);
    if (pathMatches) {
      filesMentioned.push(...pathMatches.map((p) => p.replace(/`/g, '')));
    }

    // Count code blocks
    const codeBlockMatches = msg.content.match(/```[\s\S]*?```/g);
    if (codeBlockMatches) {
      codeBlocks += codeBlockMatches.length;
    }

    // Extract key phrases (simple heuristic)
    if (msg.role === 'user') {
      const firstLine = msg.content.split('\n')[0];
      if (firstLine.length < 100) {
        topics.push(firstLine);
      }
    }
  }

  const uniqueFiles = [...new Set(filesMentioned)].slice(0, 5);
  const uniqueTopics = [...new Set(topics)].slice(0, 3);

  let summary = `[Previous conversation summary: ${messages.length} messages`;

  if (uniqueTopics.length > 0) {
    summary += `. Topics: ${uniqueTopics.join('; ')}`;
  }

  if (uniqueFiles.length > 0) {
    summary += `. Files discussed: ${uniqueFiles.join(', ')}`;
  }

  if (codeBlocks > 0) {
    summary += `. ${codeBlocks} code blocks exchanged`;
  }

  summary += ']';
  return summary;
}

/**
 * Pack context items into the available token budget
 */
export function packContext(options: PackerOptions): PackedContext {
  const {
    maxTokens,
    reserveForResponse,
    systemPrompt,
    rules,
    currentFile,
    selectedCode,
    attachments,
    messages,
    toolDefinitions,
  } = options;

  const budget = maxTokens - reserveForResponse;
  const items: ContextItem[] = [];
  let totalTokens = 0;

  // Helper to add item if it fits
  const addItem = (item: ContextItem): boolean => {
    if (totalTokens + item.tokens <= budget) {
      items.push(item);
      totalTokens += item.tokens;
      return true;
    }
    return false;
  };

  // 1. System prompt (always included, highest priority)
  if (systemPrompt) {
    const tokens = estimateTokens(systemPrompt);
    addItem({
      type: 'system',
      priority: PRIORITY.SYSTEM_PROMPT,
      content: systemPrompt,
      tokens,
    });
  }

  // 2. Tool definitions (very high priority for agent mode)
  if (toolDefinitions) {
    const tokens = estimateTokens(toolDefinitions, true);
    addItem({
      type: 'tools',
      priority: PRIORITY.TOOL_DEFINITIONS,
      content: toolDefinitions,
      tokens,
    });
  }

  // 3. Active rules
  const enabledRules = rules.filter((r) => r.enabled);
  if (enabledRules.length > 0) {
    const rulesContent = enabledRules.map((r) => `## ${r.name}\n${r.content}`).join('\n\n');
    const tokens = estimateTokens(rulesContent);
    addItem({
      type: 'rules',
      priority: PRIORITY.ACTIVE_RULES,
      content: rulesContent,
      tokens,
    });
  }

  // 4. Selected code (very high priority - user explicitly selected this)
  if (selectedCode) {
    const tokens = estimateTokens(selectedCode, true);
    addItem({
      type: 'selection',
      priority: PRIORITY.SELECTED_CODE,
      content: selectedCode,
      tokens,
    });
  }

  // 5. Current file content
  if (currentFile) {
    const tokens = estimateTokens(currentFile.content, true);
    const maxFileTokens = Math.min(tokens, Math.floor(budget * 0.3)); // Max 30% of budget for file

    if (tokens <= maxFileTokens) {
      addItem({
        type: 'file',
        priority: PRIORITY.CURRENT_FILE,
        content: currentFile.content,
        tokens,
        metadata: { path: currentFile.path },
      });
    } else {
      // Truncate file to fit
      const truncatedContent = currentFile.content.slice(0, maxFileTokens * 3);
      addItem({
        type: 'file',
        priority: PRIORITY.CURRENT_FILE,
        content: truncatedContent + '\n... [file truncated]',
        tokens: maxFileTokens,
        metadata: { path: currentFile.path, originalTokens: tokens },
      });
    }
  }

  // 6. Attachments (images, URLs, files)
  for (const att of attachments) {
    let content = '';
    let tokens = 0;

    switch (att.kind) {
      case 'image':
        // Images are handled separately in the API call
        content = `[Image attachment: ${att.label}]`;
        tokens = 10;
        break;
      case 'url':
        content = `--- Fetched URL: ${att.label} ---\n${att.text || ''}`;
        tokens = estimateTokens(content);
        break;
      case 'file':
        content = `--- Attached file: ${att.label} ---\n${att.text || ''}`;
        tokens = estimateTokens(content, true);
        break;
      case 'snippet':
        content = `--- Code snippet ---\n${att.text || ''}`;
        tokens = estimateTokens(content, true);
        break;
    }

    addItem({
      type: 'attachment',
      priority: PRIORITY.ATTACHMENTS,
      content,
      tokens,
    });
  }

  // 7. Messages (prioritize recent ones)
  const remainingBudget = budget - totalTokens;
  const messageItems: ContextItem[] = [];
  let messageTokens = 0;

  // Process messages from newest to oldest
  const sortedMessages = [...messages].reverse();
  const recentThreshold = Math.min(6, messages.length); // Last 6 messages are "recent"

  for (let i = 0; i < sortedMessages.length; i++) {
    const msg = sortedMessages[i];
    const isRecent = i < recentThreshold;
    const tokens = estimateTokens(msg.content);

    if (messageTokens + tokens <= remainingBudget) {
      messageItems.unshift({
        type: 'message',
        priority: isRecent ? PRIORITY.RECENT_MESSAGES : PRIORITY.OLDER_MESSAGES,
        content: msg.content,
        tokens,
        metadata: { messageId: msg.id, role: msg.role },
      });
      messageTokens += tokens;
    } else if (isRecent) {
      // Try to fit at least a summarized version of recent messages
      const summarized = summarizeMessage(msg.content, 200);
      const sumTokens = estimateTokens(summarized);

      if (messageTokens + sumTokens <= remainingBudget) {
        messageItems.unshift({
          type: 'message',
          priority: PRIORITY.RECENT_MESSAGES,
          content: summarized,
          tokens: sumTokens,
          metadata: { messageId: msg.id, role: msg.role, originalTokens: tokens },
        });
        messageTokens += sumTokens;
      }
    } else {
      // Old messages that don't fit - we'll summarize them
      break;
    }
  }

  // Add message items
  items.push(...messageItems);
  totalTokens += messageTokens;

  // 8. Create summary for messages that didn't fit
  const includedMessageIds = new Set(messageItems.map((m) => m.metadata?.messageId));
  const excludedMessages = messages.filter((m) => !includedMessageIds.has(m.id));

  let summarizedTurns = 0;
  if (excludedMessages.length > 0) {
    const summary = createConversationSummary(excludedMessages);
    const summaryTokens = estimateTokens(summary);

    if (totalTokens + summaryTokens <= budget) {
      items.unshift({
        type: 'summary',
        priority: PRIORITY.SUMMARY,
        content: summary,
        tokens: summaryTokens,
      });
      totalTokens += summaryTokens;
      summarizedTurns = excludedMessages.length;
    }
  }

  // Sort by priority (highest first) for debugging, but actual order is determined by type
  const sortedItems = [...items].sort((a, b) => b.priority - a.priority);

  return {
    items: sortedItems,
    totalTokens,
    budget,
    truncated: totalTokens >= budget * 0.95,
    summarizedTurns,
  };
}

/**
 * Convert packed context to API messages format
 */
export function packedContextToMessages(packed: PackedContext): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // Build system message from system prompt, rules, and tools
  const systemParts: string[] = [];
  const summaryParts: string[] = [];

  for (const item of packed.items) {
    switch (item.type) {
      case 'system':
        systemParts.unshift(item.content);
        break;
      case 'tools':
        // Tools are passed separately to the API
        break;
      case 'rules':
        systemParts.push(`\n## Active Rules\n${item.content}`);
        break;
      case 'summary':
        summaryParts.push(item.content);
        break;
      case 'file':
        systemParts.push(`\n## Current File: ${item.metadata?.path || 'unknown'}\n\`\`\`\n${item.content}\n\`\`\``);
        break;
      case 'selection':
        systemParts.push(`\n## Selected Code\n\`\`\`\n${item.content}\n\`\`\``);
        break;
      case 'attachment':
        systemParts.push(`\n${item.content}`);
        break;
    }
  }

  if (systemParts.length > 0) {
    messages.push({
      role: 'system',
      content: systemParts.join('\n'),
    });
  }

  // Add summary as a system message if present
  if (summaryParts.length > 0) {
    messages.push({
      role: 'system',
      content: summaryParts.join('\n'),
    });
  }

  // Add conversation messages in order
  const messageItems = packed.items
    .filter((item) => item.type === 'message')
    .sort((a, b) => {
      // Sort by original message order (using messageId as proxy)
      const aId = a.metadata?.messageId || '';
      const bId = b.metadata?.messageId || '';
      return aId.localeCompare(bId);
    });

  for (const item of messageItems) {
    messages.push({
      role: item.metadata?.role || 'user',
      content: item.content,
    });
  }

  return messages;
}

/**
 * Get token budget info for a model
 */
export function getModelBudget(contextLength: number): { maxTokens: number; reserveForResponse: number } {
  // Reserve 25% for response, or at least 4096 tokens
  const reserveForResponse = Math.max(4096, Math.floor(contextLength * 0.25));
  return {
    maxTokens: contextLength,
    reserveForResponse,
  };
}

/**
 * Display-friendly token count
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

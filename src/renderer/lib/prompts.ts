export const BASE_SYSTEM_PROMPT = `You are an expert coding assistant inside a code editor. Help the user write, debug, refactor, and understand code. Be precise, practical, and safe. When suggesting edits, prefer unified diffs or clearly separated replacement blocks. Do not delete unrelated code. Ask for clarification only if required. If enough context exists, make a best-effort solution.

When the user asks you to run a command, include it in a fenced code block tagged \`bash\`, \`sh\`, \`powershell\`, or \`cmd\`. The user will see a "Run" button on that block and must approve before anything executes — never assume a command has been run.`;

/** Backwards-compatible alias. */
export const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;

/** Protocol appended to the system prompt when Agent Mode is on. */
export const AGENT_TASK_PROTOCOL = `
# AGENT TASK PROTOCOL
You are running inside an autonomous task runner. Your response will be parsed
for a completion marker. You MUST end every response with exactly ONE of these,
on its own line, verbatim, with the double brackets:

- [[TASK_COMPLETE]]           — the user's request is fully done.
- [[CONTINUE]]                 — more work is needed; you want another turn.
- [[BLOCKED: <short reason>]]  — you need info/input you do not have.
- [[ERROR: <short reason>]]    — you hit an unrecoverable error.

Rules:
- Do not emit multiple markers. Do not emit a marker in the middle of the response.
- If you run out of room mid-step, end with [[CONTINUE]] so the runner resumes you.
- The runner will auto-send "Continue." after [[CONTINUE]]. Pick up exactly where you left off.
- Never ask "do you want me to continue?" — just emit [[CONTINUE]].
- Never emit [[TASK_COMPLETE]] if any acceptance criterion is unmet.
- On [[ERROR]] include the exact error text and the last successful step so state can be resumed.`;

/** Compose the full system prompt, including any enabled rules and (optionally) the agent protocol. */
export function buildSystemPrompt(rulesBlock: string, agentMode = false): string {
  const parts: string[] = [BASE_SYSTEM_PROMPT];
  if (rulesBlock.trim()) parts.push(rulesBlock);
  if (agentMode) parts.push(AGENT_TASK_PROTOCOL);
  return parts.join('\n\n');
}

import type { Attachment, MessageContent, MessageContentPart } from '../../shared/types';
import { formatAttachmentForPrompt } from './attachments';

export const ACTION_PROMPTS = {
  explain:
    'Explain what this code does in plain English. Point out any risks or confusing parts.',
  fix:
    'Find likely bugs in this code and propose a minimal safe fix. Return a unified diff if possible.',
  refactor:
    'Refactor this code for clarity, maintainability, and performance without changing behavior. Return a unified diff.',
  generate:
    'Generate the requested function or component. Include only necessary code and explain where it should go.',
  comment:
    'Add helpful comments to this code without over-commenting obvious lines. Return the modified code or a unified diff.',
  test:
    "Create unit tests for this file. Match the project's likely testing style. If no test framework is detected, recommend one.",
} as const;

export type ActionKey = keyof typeof ACTION_PROMPTS;

export interface BuildContextInput {
  userPrompt: string;
  currentFilePath?: string | null;
  currentFileContent?: string | null;
  selectedCode?: string | null;
  selectedLanguage?: string | null;
  projectTree?: string | null;
  includeFullFile: boolean;
  includeProjectTree: boolean;
  attachments?: Attachment[];
}

/**
 * Build a text-only user-message string (used for history where we never
 * include binary content).
 */
export function buildUserMessage(input: BuildContextInput): string {
  const blocks: string[] = [];

  if (input.includeProjectTree && input.projectTree) {
    blocks.push('Project file tree:\n' + truncate(input.projectTree, 6000));
  }

  if (input.currentFilePath) {
    blocks.push('Current file:\n' + input.currentFilePath);
  }

  if (input.selectedCode) {
    const lang = input.selectedLanguage ?? 'plaintext';
    blocks.push('Selected code:\n```' + lang + '\n' + input.selectedCode + '\n```');
  }

  if (input.includeFullFile && input.currentFileContent) {
    const lang = input.selectedLanguage ?? 'plaintext';
    blocks.push(
      'Full current file:\n```' + lang + '\n' + truncate(input.currentFileContent, 20000) + '\n```',
    );
  }

  // Include any text-based attachments (urls, files, snippets).
  if (input.attachments && input.attachments.length > 0) {
    for (const a of input.attachments) {
      const block = formatAttachmentForPrompt(a);
      if (block) blocks.push(block);
    }
  }

  blocks.push('User request:\n' + input.userPrompt);
  return blocks.join('\n\n');
}

/**
 * Build the full user message content — returns a string for text-only input,
 * or a multi-part array (OpenAI-compatible) when any image attachments are
 * present so vision models can actually see them.
 */
export function buildUserMessageContent(input: BuildContextInput): MessageContent {
  const text = buildUserMessage(input);
  const images = (input.attachments ?? []).filter((a) => a.kind === 'image' && a.imageUrl);
  if (images.length === 0) return text;
  const parts: MessageContentPart[] = [{ type: 'text', text }];
  for (const img of images) {
    parts.push({
      type: 'image_url',
      image_url: { url: img.imageUrl!, detail: 'auto' },
    });
  }
  return parts;
}

/** Convert an arbitrary historical message content to a plain-string form. */
export function messageContentToString(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .map((p) => {
      if (p.type === 'text') return p.text;
      if (p.type === 'image_url') return '[image attached]';
      return '';
    })
    .join('\n');
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n... [truncated ${str.length - max} chars]`;
}

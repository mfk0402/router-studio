/**
 * Slash Commands System
 *
 * Provides quick actions via /command syntax in the chat input.
 * Supports built-in commands and custom commands from .opencode/commands/*.md
 */

import type { ChatMsg } from '../store/appStore';

export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
  category: 'chat' | 'code' | 'files' | 'git' | 'tools' | 'custom';
  /** If true, the command's output replaces the input instead of being sent */
  transform?: boolean;
  /** Execute the command, return text to send or null to cancel */
  execute: (
    args: string,
    context: CommandContext,
  ) => Promise<SlashCommandOutcome | null> | SlashCommandOutcome | null;
}

/** String result, or structured actions handled in AiPanel */
export type SlashCommandOutcome =
  | string
  | null
  | { openRouterVideo: { prompt: string; aspect_ratio?: string } }
  | { openRouterTts: { text: string } }
  /** Show in chat without calling the completion API (e.g. /video with no prompt). */
  | { usageHint: string };

export interface CommandContext {
  currentFile?: string;
  selectedCode?: string;
  projectRoot?: string;
  chat: ChatMsg[];
}

// Built-in commands registry
const builtInCommands: SlashCommand[] = [
  // Chat commands
  {
    name: 'clear',
    description: 'Clear the conversation history',
    category: 'chat',
    execute: () => {
      // Return special marker that the caller handles
      return '[[CLEAR_CHAT]]';
    },
  },
  {
    name: 'compact',
    description: 'Summarize and compact the conversation history',
    category: 'chat',
    execute: () => '[[COMPACT_CHAT]]',
  },
  {
    name: 'new',
    description: 'Start a new conversation/task',
    category: 'chat',
    execute: () => '[[NEW_TASK]]',
  },
  {
    name: 'save',
    description: 'Save the current conversation as a task',
    category: 'chat',
    execute: () => '[[SAVE_TASK]]',
  },
  {
    name: 'video',
    description:
      'OpenRouter async video generation (uses a video model from the catalog; API key required)',
    usage: '/video your scene description…',
    category: 'chat',
    execute: (args) => {
      const p = args.trim();
      if (!p) {
        return {
          usageHint: [
            '**`/video`** needs a scene description on the same line.',
            '',
            '**Tip:** Attach a **screenshot image** in the composer before sending `/video` — it becomes **first-frame** (and optionally last-frame) conditioning for OpenRouter.',
            '',
            '**Silent cuts:** Settings → Models → Video generation → **Generated audio → Silent** sets `generate_audio=false` on `/video` jobs.',
            '',
            'Example: `/video slow dolly zoom on the editor while tooltips fade in`',
            '',
            'Requires an OpenRouter API key in Settings. Use **Generate video** in the AI header or **`/video`**. Configure defaults in **Settings → Models → Video generation**.',
          ].join('\n'),
        };
      }
      return { openRouterVideo: { prompt: p } };
    },
  },
  {
    name: 'tts',
    description:
      'OpenRouter text-to-speech (downloads an audio file; set TTS model & voice in Settings → Models)',
    usage: '/tts Your spoken text…',
    category: 'chat',
    execute: (args) => {
      const p = args.trim();
      if (!p) {
        return 'Usage: /tts your text — configure Text-to-speech model and voice in Settings → Models first.';
      }
      return { openRouterTts: { text: p } };
    },
  },

  // Code commands
  {
    name: 'explain',
    description: 'Explain the selected code',
    usage: '/explain [optional focus]',
    category: 'code',
    execute: (args, ctx) => {
      if (!ctx.selectedCode) {
        return 'Please select some code first, then use /explain';
      }
      const focus = args ? ` Focus on: ${args}` : '';
      return `Please explain this code:${focus}\n\n\`\`\`\n${ctx.selectedCode}\n\`\`\``;
    },
  },
  {
    name: 'refactor',
    description: 'Suggest refactoring for the selected code',
    usage: '/refactor [optional goal]',
    category: 'code',
    execute: (args, ctx) => {
      if (!ctx.selectedCode) {
        return 'Please select some code first, then use /refactor';
      }
      const goal = args ? ` Goal: ${args}` : '';
      return `Please refactor this code to be cleaner and more maintainable:${goal}\n\n\`\`\`\n${ctx.selectedCode}\n\`\`\``;
    },
  },
  {
    name: 'test',
    description: 'Generate tests for the selected code',
    usage: '/test [framework]',
    category: 'code',
    execute: (args, ctx) => {
      if (!ctx.selectedCode) {
        return 'Please select some code first, then use /test';
      }
      const framework = args ? ` using ${args}` : '';
      return `Please write comprehensive unit tests for this code${framework}:\n\n\`\`\`\n${ctx.selectedCode}\n\`\`\``;
    },
  },
  {
    name: 'fix',
    description: 'Fix bugs in the selected code',
    category: 'code',
    execute: (args, ctx) => {
      if (!ctx.selectedCode) {
        return 'Please select some code first, then use /fix';
      }
      const issue = args ? ` The issue is: ${args}` : '';
      return `Please identify and fix any bugs in this code:${issue}\n\n\`\`\`\n${ctx.selectedCode}\n\`\`\``;
    },
  },
  {
    name: 'comment',
    description: 'Add comments to the selected code',
    category: 'code',
    execute: (_, ctx) => {
      if (!ctx.selectedCode) {
        return 'Please select some code first, then use /comment';
      }
      return `Please add helpful comments to this code:\n\n\`\`\`\n${ctx.selectedCode}\n\`\`\``;
    },
  },
  {
    name: 'type',
    description: 'Add TypeScript types to the selected code',
    category: 'code',
    execute: (_, ctx) => {
      if (!ctx.selectedCode) {
        return 'Please select some code first, then use /type';
      }
      return `Please add proper TypeScript types to this code:\n\n\`\`\`\n${ctx.selectedCode}\n\`\`\``;
    },
  },

  // File commands
  {
    name: 'file',
    description: 'Ask about the current file',
    usage: '/file [question]',
    category: 'files',
    execute: (args, ctx) => {
      if (!ctx.currentFile) {
        return 'No file is currently open.';
      }
      const question = args || 'What does this file do?';
      return `About the current file (${ctx.currentFile}): ${question}`;
    },
  },
  {
    name: 'create',
    description: 'Create a new file',
    usage: '/create <filename> [description]',
    category: 'files',
    execute: (args) => {
      if (!args.trim()) {
        return 'Usage: /create <filename> [description]';
      }
      const [filename, ...rest] = args.split(' ');
      const description = rest.join(' ') || 'a new file with appropriate content';
      return `Please create a file named \`${filename}\` that contains ${description}.`;
    },
  },

  // Git commands
  {
    name: 'commit',
    description: 'Generate a commit message',
    usage: '/commit [context]',
    category: 'git',
    execute: (args) => {
      const context = args ? ` Context: ${args}` : '';
      return `Please generate a good commit message for the current changes.${context} Use conventional commit format if appropriate.`;
    },
  },
  {
    name: 'diff',
    description: 'Explain the current git diff',
    category: 'git',
    execute: () => {
      return 'Please run `git diff` and explain what changes have been made.';
    },
  },
  {
    name: 'pr',
    description: 'Help write a pull request description',
    usage: '/pr [title]',
    category: 'git',
    execute: (args) => {
      const title = args ? ` Title: ${args}` : '';
      return `Please help me write a pull request description for the current changes.${title} Include a summary, key changes, and testing notes.`;
    },
  },

  // Tool commands
  {
    name: 'search',
    description: 'Search the codebase',
    usage: '/search <query>',
    category: 'tools',
    execute: (args) => {
      if (!args.trim()) {
        return 'Usage: /search <query>';
      }
      return `Please search the codebase for: ${args}`;
    },
  },
  {
    name: 'run',
    description: 'Run a shell command',
    usage: '/run <command>',
    category: 'tools',
    execute: (args) => {
      if (!args.trim()) {
        return 'Usage: /run <command>';
      }
      return `Please run this command: \`${args}\``;
    },
  },
  {
    name: 'build',
    description: 'Run the build command',
    category: 'tools',
    execute: () => 'Please run the build command for this project and report any errors.',
  },
  {
    name: 'lint',
    description: 'Run linting and fix issues',
    category: 'tools',
    execute: () => 'Please run the linter and help fix any issues found.',
  },
  {
    name: 'visual-fix',
    description: 'Visual debug loop: dev server + Playwright screenshots until [[VISUAL_OK]]',
    usage: '/visual-fix [url]',
    category: 'tools',
    execute: (args) => {
      const url = args.trim() || 'http://localhost:5173/';
      return [
        'Run a **visual-fix** loop:',
        '',
        `1) Start or reuse the dev server (e.g. \`run_npm_script\` with the dev script when appropriate).`,
        `2) \`browser_open\` → ${url}`,
        '3) `browser_screenshot` and treat the image as the baseline.',
        '4) Propose minimal CSS/layout fixes with `edit_file`.',
        '5) Wait for HMR reload, screenshot again, compare — repeat until acceptable.',
        '',
        'Emit `[[VISUAL_OK]]` when the UI matches intent; otherwise explain remaining gaps.',
      ].join('\n');
    },
  },

  // Utility commands
  {
    name: 'help',
    description: 'Show available commands',
    aliases: ['?', 'commands'],
    category: 'chat',
    transform: true,
    execute: () => {
      return '[[SHOW_HELP]]';
    },
  },
  {
    name: 'model',
    description: 'Open the model picker',
    category: 'chat',
    execute: () => '[[OPEN_MODEL_PICKER]]',
  },
  {
    name: 'settings',
    description: 'Open settings',
    category: 'chat',
    execute: () => '[[OPEN_SETTINGS]]',
  },
];

// Custom commands loaded from .opencode/commands/
let customCommands: SlashCommand[] = [];

/**
 * Load custom commands from .opencode/commands/*.md files
 */
export async function loadCustomCommands(): Promise<void> {
  try {
    // Try to list files in .opencode/commands/
    const root = await window.api.fs.getRoot();
    if (!root) return;

    // This would need a listDir implementation for a specific path
    // For now, we'll just provide the infrastructure
    customCommands = [];
  } catch {
    // No custom commands directory
    customCommands = [];
  }
}

/**
 * Parse a custom command file (markdown format)
 */
export function parseCustomCommand(content: string, filename: string): SlashCommand | null {
  // Expected format:
  // # Command Name
  // Description goes here
  // ## Usage
  // /commandname [args]
  // ## Prompt
  // The actual prompt template with {{args}} placeholder

  const lines = content.split('\n');
  const name = filename.replace(/\.md$/i, '').toLowerCase();

  let description = '';
  let usage = '';
  let promptTemplate = '';
  let section = '';

  for (const line of lines) {
    if (line.startsWith('# ')) {
      // Title - could use for display name
      continue;
    } else if (line.startsWith('## ')) {
      section = line.slice(3).toLowerCase().trim();
    } else if (section === 'usage') {
      usage += line + '\n';
    } else if (section === 'prompt') {
      promptTemplate += line + '\n';
    } else if (!section && line.trim()) {
      description += line + ' ';
    }
  }

  if (!promptTemplate.trim()) return null;

  return {
    name,
    description: description.trim() || `Custom command: ${name}`,
    usage: usage.trim() || undefined,
    category: 'custom',
    execute: (args) => {
      return promptTemplate.trim().replace(/\{\{args\}\}/g, args);
    },
  };
}

/**
 * Get all available commands
 */
export function getAllCommands(): SlashCommand[] {
  return [...builtInCommands, ...customCommands];
}

/**
 * Find commands matching a prefix
 */
export function findMatchingCommands(prefix: string): SlashCommand[] {
  const lowerPrefix = prefix.toLowerCase();
  return getAllCommands().filter(
    (cmd) =>
      cmd.name.startsWith(lowerPrefix) ||
      cmd.aliases?.some((a) => a.startsWith(lowerPrefix)),
  );
}

/**
 * Get a command by name or alias
 */
export function getCommand(name: string): SlashCommand | undefined {
  const lowerName = name.toLowerCase();
  return getAllCommands().find(
    (cmd) => cmd.name === lowerName || cmd.aliases?.includes(lowerName),
  );
}

/**
 * Parse input to extract command and arguments
 */
export function parseCommandInput(input: string): { command: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const match = trimmed.match(/^\/(\w+)\s*(.*)/);
  if (!match) return null;

  return {
    command: match[1].toLowerCase(),
    args: match[2].trim(),
  };
}

/**
 * Execute a slash command
 */
export async function executeCommand(
  input: string,
  context: CommandContext,
): Promise<{
  result: string | null;
  special?: string;
  openRouterVideo?: { prompt: string; aspect_ratio?: string };
  openRouterTts?: { text: string };
  usageHint?: string;
}> {
  const parsed = parseCommandInput(input);
  if (!parsed) {
    return { result: input }; // Not a command, return as-is
  }

  const cmd = getCommand(parsed.command);
  if (!cmd) {
    return { result: `Unknown command: /${parsed.command}. Type /help to see available commands.` };
  }

  const raw = await cmd.execute(parsed.args, context);

  if (raw && typeof raw === 'object' && 'usageHint' in raw) {
    const payload = raw as { usageHint: string };
    return {
      result: null,
      special: '[[USAGE_HINT]]',
      usageHint: payload.usageHint,
    };
  }

  if (raw && typeof raw === 'object' && 'openRouterTts' in raw) {
    const payload = raw as { openRouterTts: { text: string } };
    return { result: null, special: '[[OPENROUTER_TTS]]', openRouterTts: payload.openRouterTts };
  }

  if (raw && typeof raw === 'object' && 'openRouterVideo' in raw) {
    const payload = raw as { openRouterVideo: { prompt: string; aspect_ratio?: string } };
    return { result: null, special: '[[OPENROUTER_VIDEO]]', openRouterVideo: payload.openRouterVideo };
  }

  const result = typeof raw === 'string' || raw === null ? raw : null;

  // Check for special markers
  if (
    result === '[[CLEAR_CHAT]]' ||
    result === '[[COMPACT_CHAT]]' ||
    result === '[[NEW_TASK]]' ||
    result === '[[SAVE_TASK]]' ||
    result === '[[SHOW_HELP]]' ||
    result === '[[OPEN_MODEL_PICKER]]' ||
    result === '[[OPEN_SETTINGS]]'
  ) {
    return { result: null, special: result };
  }

  return { result };
}

/**
 * Generate help text for all commands
 */
export function generateHelpText(): string {
  const commands = getAllCommands();
  const byCategory: Record<string, SlashCommand[]> = {};

  for (const cmd of commands) {
    if (!byCategory[cmd.category]) {
      byCategory[cmd.category] = [];
    }
    byCategory[cmd.category].push(cmd);
  }

  const categoryNames: Record<string, string> = {
    chat: 'Chat',
    code: 'Code',
    files: 'Files',
    git: 'Git',
    tools: 'Tools',
    custom: 'Custom',
  };

  let help = '## Available Slash Commands\n\n';

  for (const [category, cmds] of Object.entries(byCategory)) {
    help += `### ${categoryNames[category] || category}\n\n`;
    for (const cmd of cmds) {
      const aliases = cmd.aliases ? ` (aliases: ${cmd.aliases.map((a) => `/${a}`).join(', ')})` : '';
      help += `**/${cmd.name}**${aliases} - ${cmd.description}\n`;
      if (cmd.usage) {
        help += `  Usage: \`${cmd.usage}\`\n`;
      }
      help += '\n';
    }
  }

  return help;
}

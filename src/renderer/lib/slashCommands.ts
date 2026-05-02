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
  execute: (args: string, context: CommandContext) => Promise<string | null> | string | null;
}

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
): Promise<{ result: string | null; special?: string }> {
  const parsed = parseCommandInput(input);
  if (!parsed) {
    return { result: input }; // Not a command, return as-is
  }

  const cmd = getCommand(parsed.command);
  if (!cmd) {
    return { result: `Unknown command: /${parsed.command}. Type /help to see available commands.` };
  }

  const result = await cmd.execute(parsed.args, context);

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

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

const MEMORY_FILE = '.opencode/memory.json';

interface MemoryStore {
  [key: string]: {
    value: string;
    createdAt: number;
    updatedAt: number;
  };
}

async function getMemoryPath(projectRoot: string): Promise<string> {
  const dir = path.join(projectRoot, '.opencode');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, 'memory.json');
}

async function loadMemory(projectRoot: string): Promise<MemoryStore> {
  const memPath = await getMemoryPath(projectRoot);
  try {
    const content = await fs.readFile(memPath, 'utf8');
    return JSON.parse(content) as MemoryStore;
  } catch {
    return {};
  }
}

async function saveMemory(projectRoot: string, memory: MemoryStore): Promise<void> {
  const memPath = await getMemoryPath(projectRoot);
  await fs.writeFile(memPath, JSON.stringify(memory, null, 2), 'utf8');
}

export const memorySetTool: RegisteredTool = {
  name: 'memory_set',
  description:
    'Store a key-value pair in the project memory. Use this to remember important information ' +
    'across sessions, like user preferences, project decisions, or discovered patterns.',
  category: 'memory',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'The key to store the value under. Use descriptive, namespaced keys (e.g., "user_prefs/theme", "project/architecture_decisions").',
      },
      value: {
        type: 'string',
        description: 'The value to store. Can be any string, including JSON.',
      },
    },
    required: ['key', 'value'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const key = String(args.key ?? '');
    const value = String(args.value ?? '');

    if (!key) {
      return { success: false, error: 'Key is required.' };
    }

    try {
      const memory = await loadMemory(ctx.projectRoot);
      const now = Date.now();
      const isNew = !memory[key];

      memory[key] = {
        value,
        createdAt: memory[key]?.createdAt ?? now,
        updatedAt: now,
      };

      await saveMemory(ctx.projectRoot, memory);

      return {
        success: true,
        result: {
          key,
          action: isNew ? 'created' : 'updated',
          valueLength: value.length,
        },
      };
    } catch (e) {
      return { success: false, error: `Memory set failed: ${(e as Error).message}` };
    }
  },
};

export const memoryGetTool: RegisteredTool = {
  name: 'memory_get',
  description:
    'Retrieve a value from the project memory by key. Returns null if the key does not exist.',
  category: 'memory',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'The key to retrieve.',
      },
    },
    required: ['key'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const key = String(args.key ?? '');

    if (!key) {
      return { success: false, error: 'Key is required.' };
    }

    try {
      const memory = await loadMemory(ctx.projectRoot);
      const entry = memory[key];

      if (!entry) {
        return {
          success: true,
          result: {
            key,
            found: false,
            value: null,
          },
        };
      }

      return {
        success: true,
        result: {
          key,
          found: true,
          value: entry.value,
          createdAt: new Date(entry.createdAt).toISOString(),
          updatedAt: new Date(entry.updatedAt).toISOString(),
        },
      };
    } catch (e) {
      return { success: false, error: `Memory get failed: ${(e as Error).message}` };
    }
  },
};

export const memoryListTool: RegisteredTool = {
  name: 'memory_list',
  description:
    'List all keys stored in the project memory, optionally filtered by prefix.',
  category: 'memory',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      prefix: {
        type: 'string',
        description: 'Optional prefix to filter keys (e.g., "user_prefs/" to list all user preferences).',
      },
    },
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const prefix = args.prefix ? String(args.prefix) : '';

    try {
      const memory = await loadMemory(ctx.projectRoot);
      let keys = Object.keys(memory);

      if (prefix) {
        keys = keys.filter((k) => k.startsWith(prefix));
      }

      const entries = keys.map((k) => ({
        key: k,
        valueLength: memory[k].value.length,
        updatedAt: new Date(memory[k].updatedAt).toISOString(),
      }));

      return {
        success: true,
        result: {
          prefix: prefix || '(all)',
          count: entries.length,
          entries,
        },
      };
    } catch (e) {
      return { success: false, error: `Memory list failed: ${(e as Error).message}` };
    }
  },
};

export const memoryForgetTool: RegisteredTool = {
  name: 'memory_forget',
  description:
    'Delete a key from the project memory. Use to clean up outdated or incorrect information.',
  category: 'memory',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'The key to delete.',
      },
    },
    required: ['key'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const key = String(args.key ?? '');

    if (!key) {
      return { success: false, error: 'Key is required.' };
    }

    try {
      const memory = await loadMemory(ctx.projectRoot);

      if (!memory[key]) {
        return {
          success: true,
          result: {
            key,
            deleted: false,
            reason: 'Key not found',
          },
        };
      }

      delete memory[key];
      await saveMemory(ctx.projectRoot, memory);

      return {
        success: true,
        result: {
          key,
          deleted: true,
        },
      };
    } catch (e) {
      return { success: false, error: `Memory forget failed: ${(e as Error).message}` };
    }
  },
};

import { randomUUID } from 'node:crypto';
import type { AgentTask, RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import * as tasks from '../../tasks.js';
import { getSettings } from '../../secureStore.js';

function newTaskId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}

function deriveTitle(text: string, fallback: string): string {
  const t = text.trim().split('\n')[0]?.slice(0, 80) ?? '';
  return t.length > 0 ? t : fallback;
}

export const spawnAgentTool: RegisteredTool = {
  name: 'spawn_agent',
  description:
    'Start a new saved child agent task with its own goal and initial message. ' +
    'Use for parallel workstreams or delegating a sub-problem. The user can resume the child from Tasks. ' +
    'If your UI session has an active parent task, the child is linked for the task tree.',
  category: 'agent',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short label for the Tasks list (e.g. "Fix login bug").',
      },
      goal: {
        type: 'string',
        description: 'What the sub-agent should achieve (kept in task metadata).',
      },
      instructions: {
        type: 'string',
        description: 'First user message the sub-agent should start from (concrete instructions).',
      },
      model: {
        type: 'string',
        description: 'Optional model id; defaults to the same as the parent task if unknown.',
      },
    },
    required: ['goal', 'instructions'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const goal = String(args.goal ?? '').trim();
    const instructions = String(args.instructions ?? '').trim();
    const titleIn = String(args.title ?? '').trim();
    const modelHint = args.model != null ? String(args.model).trim() : '';

    if (!goal || !instructions) {
      return { success: false, error: 'goal and instructions are required.' };
    }

    const title = deriveTitle(titleIn || goal, 'Sub-agent task');
    const id = newTaskId();
    const now = Date.now();
    const parentTaskId = ctx.activeTaskId ?? null;
    const settings = await getSettings();

    const task: AgentTask = {
      id,
      parentTaskId,
      title,
      goal,
      status: 'paused',
      iterations: 0,
      maxIterations: settings.maxAgentIterations,
      modelUsed: modelHint || settings.defaultModel || 'openrouter/auto',
      projectRoot: ctx.projectRoot,
      messages: [{ role: 'user', content: instructions }],
      lastMarker: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await tasks.saveTask(task);
      return {
        success: true,
        result: {
          child_task_id: id,
          title,
          parent_task_id: parentTaskId,
          note:
            'Child task saved as paused. Open Tasks (toolbar) and click Resume on the child to run it in the UI.',
        },
      };
    } catch (e) {
      return { success: false, error: `spawn_agent failed: ${(e as Error).message}` };
    }
  },
};

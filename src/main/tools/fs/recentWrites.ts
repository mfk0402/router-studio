import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { getWriteUndoPathTrail, writeUndoDepth } from '../../writeUndoStack.js';

export const tool: RegisteredTool = {
  name: 'list_recent_writes',
  description:
    'Lists paths touched by agent write_file / edit_file / create_file calls recorded for undo (rolling buffer), newest last.',
  category: 'filesystem',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {},
  },
  handler: async (_args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const paths = getWriteUndoPathTrail();
    const depth = writeUndoDepth();

    return {
      success: true,
      result: {
        depth,
        paths,
        note:
          paths.length === 0
            ? 'No agent writes recorded yet this session.'
            : 'Paths are ordered oldest-first within the rolling buffer (same path may appear multiple times).',
      },
    };
  },
};

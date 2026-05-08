import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { getErrorMessage } from '../../../shared/errorUtils.js';
import { undoAllWriteSnapshots, writeUndoDepth } from '../../writeUndoStack.js';

export const tool: RegisteredTool = {
  name: 'undo_agent_writes',
  description:
    'Revert recent agent-driven file writes tracked in this session (write_file, edit_file, create_file). ' +
    'Restores are applied in reverse order. Does not undo delete_file, rename_file, or shell-driven changes.',
  category: 'filesystem',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {},
  },
  handler: async (_args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const n = writeUndoDepth();
    if (n === 0) {
      return { success: true, result: { restored: [], deleted: [], errors: [], note: 'Nothing to undo.' } };
    }

    try {
      const { restored, deleted, errors } = await undoAllWriteSnapshots(ctx.projectRoot);
      return {
        success: errors.length === 0,
        result: { restored, deleted, errors, snapshots_applied: restored.length + deleted.length },
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };
    } catch (e) {
      return { success: false, error: `undo_agent_writes failed: ${getErrorMessage(e)}` };
    }
  },
};

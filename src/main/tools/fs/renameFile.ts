import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { getSettings } from '../../secureStore.js';
import { assertWriteAllowed } from '../../writePolicy.js';

function isProtectedRelativePath(relativePath: string): boolean {
  const patterns = [
    /^\.git(?:\/|$)/,
    /^node_modules(?:\/|$)/,
    /^\.env/,
    /package\.json$/,
    /package-lock\.json$/,
    /tsconfig\.json$/,
  ];
  return patterns.some((p) => p.test(relativePath));
}

export const tool: RegisteredTool = {
  name: 'rename_file',
  description:
    'Rename or move a file within the project root (change its relative path). ' +
    'Creates parent directories for the destination when needed. ' +
    'Fails if the destination path already exists. ' +
    'When this succeeds, an open editor tab for the old path is retargeted to the new path and the sidebar file tree refreshes.',
  category: 'filesystem',
  riskLevel: 'high',
  schema: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Current relative path from the project root.',
      },
      to: {
        type: 'string',
        description: 'New relative path from the project root.',
      },
    },
    required: ['from', 'to'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const fromRel = String(args.from ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    const toRel = String(args.to ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!fromRel || !toRel) {
      return { success: false, error: 'Both from and to paths are required.' };
    }

    if (fromRel === toRel) {
      return { success: false, error: 'Source and destination must differ.' };
    }

    const rootResolved = path.resolve(ctx.projectRoot);
    const rootWithSep = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
    const absFrom = path.resolve(rootResolved, fromRel);
    const absTo = path.resolve(rootResolved, toRel);

    if (
      (absFrom !== rootResolved && !absFrom.startsWith(rootWithSep)) ||
      (absTo !== rootResolved && !absTo.startsWith(rootWithSep))
    ) {
      return { success: false, error: 'Paths must stay within the project root.' };
    }

    const settings = await getSettings();
    const srcPolicy = assertWriteAllowed(settings, fromRel);
    if (!srcPolicy.ok) {
      return { success: false, error: srcPolicy.error };
    }
    const dstPolicy = assertWriteAllowed(settings, toRel);
    if (!dstPolicy.ok) {
      return { success: false, error: dstPolicy.error };
    }

    if (isProtectedRelativePath(fromRel) || isProtectedRelativePath(toRel)) {
      return {
        success: false,
        error: `Rename blocked for protected path(s): ${fromRel} → ${toRel}`,
      };
    }

    try {
      let statFrom;
      try {
        statFrom = await fs.stat(absFrom);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
          return { success: false, error: `Source not found: ${fromRel}` };
        }
        throw e;
      }

      if (statFrom.isDirectory()) {
        return {
          success: false,
          error: `Source is a directory, not a file: ${fromRel}. Use shell or dedicated folder tools.`,
        };
      }

      try {
        await fs.stat(absTo);
        return {
          success: false,
          error: `Destination already exists: ${toRel}`,
        };
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code !== 'ENOENT') throw e;
      }

      await fs.mkdir(path.dirname(absTo), { recursive: true });
      await fs.rename(absFrom, absTo);

      return {
        success: true,
        result: { from: fromRel, to: toRel },
        preview: `Renamed ${fromRel} → ${toRel}`,
      };
    } catch (e) {
      return { success: false, error: `Failed to rename file: ${(e as Error).message}` };
    }
  },
};

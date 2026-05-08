import path from 'node:path';
import type { DiagnosticsByFile } from '../../../shared/diagnostics.js';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import * as diagnosticsApi from '../../diagnostics.js';

/** Maximum files included when returning full-project diagnostics (avoid huge payloads). */
const MAX_FILES_IN_FULL_RESULT = 40;

export const tool: RegisteredTool = {
  name: 'read_diagnostics',
  description:
    'Read linter and type-checker results from the same pipeline as the Problems panel: ' +
    'TypeScript, ESLint, and Python linters. ' +
    'When Editor → TypeScript LS is enabled, publishDiagnostics from the language server are merged into TypeScript/JavaScript files. ' +
    'Pass path for a single file (relative to project root), or omit path for a project summary.',
  category: 'diagnostic',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Optional relative file path (e.g. src/App.tsx). If omitted, returns a capped multi-file summary.',
      },
    },
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }
    const relRaw = args.path != null ? String(args.path).trim() : '';
    if (relRaw) {
      const abs = path.resolve(ctx.projectRoot, relRaw);
      if (!abs.startsWith(ctx.projectRoot)) {
        return { success: false, error: 'Path must stay within the project root.' };
      }
      const norm = relRaw.replace(/\\/g, '/');
      const list = await diagnosticsApi.runDiagnosticsForFile(norm);
      list.sort((a, b) => a.range.start.line - b.range.start.line);
      return {
        success: true,
        result: {
          path: norm,
          count: list.length,
          diagnostics: list,
        },
      };
    }

    const byFile = await diagnosticsApi.runAllDiagnostics();
    const fileKeys = Object.keys(byFile).sort();
    const total = fileKeys.reduce((n, f) => n + byFile[f]!.length, 0);
    const truncatedFiles = fileKeys.length > MAX_FILES_IN_FULL_RESULT;
    const keys = truncatedFiles ? fileKeys.slice(0, MAX_FILES_IN_FULL_RESULT) : fileKeys;
    const byFileCapped: DiagnosticsByFile = {};
    for (const k of keys) {
      byFileCapped[k] = byFile[k]!;
    }
    return {
      success: true,
      result: {
        total_diagnostics: total,
        files_with_issues: fileKeys.length,
        truncated: truncatedFiles,
        truncated_note: truncatedFiles
          ? `Showing first ${MAX_FILES_IN_FULL_RESULT} of ${fileKeys.length} files with issues. Narrow with path= for one file.`
          : undefined,
        by_file: byFileCapped,
      },
    };
  },
};

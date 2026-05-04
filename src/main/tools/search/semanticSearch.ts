import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import * as codeIndex from '../../codeIndex.js';

export const semanticSearchTool: RegisteredTool = {
  name: 'semantic_search',
  description:
    'Lexical codebase search (BM25 over overlapping source chunks; not embedding-based). ' +
    'Finds the most relevant file regions for a natural-language or keyword query. ' +
    'The in-memory index is invalidated automatically after agent writes and when files change on disk; ' +
    'the next search rebuilds lazily. Call reindex_codebase after huge refactors if you want an immediate full rebuild.',
  category: 'search',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to find (keywords, symbol names, or a short natural phrase).',
      },
      limit: {
        type: 'integer',
        description: 'Max hits to return (default 12, max 25).',
      },
    },
    required: ['query'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const query = String(args.query ?? '');
    const limit = Math.min(Math.max(1, Number(args.limit) || 12), 25);

    if (!query.trim()) {
      return { success: false, error: 'query is required.' };
    }

    try {
      await codeIndex.ensureCodeIndex(ctx.projectRoot, ctx.sendProgress);
      const hits = codeIndex.searchChunks(query, limit);
      return {
        success: true,
        result: {
          index: codeIndex.getIndexMeta(),
          query,
          hits,
          count: hits.length,
        },
      };
    } catch (e) {
      return { success: false, error: `semantic_search failed: ${(e as Error).message}` };
    }
  },
};

export const reindexCodebaseTool: RegisteredTool = {
  name: 'reindex_codebase',
  description:
    'Rebuild the in-memory BM25 code index for the open project. Use after cloning, major file moves, ' +
    'or when semantic_search returns empty or clearly stale results.',
  category: 'search',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {},
  },
  handler: async (_args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    try {
      const meta = await codeIndex.buildCodeIndex(ctx.projectRoot, ctx.sendProgress);
      return {
        success: true,
        result: {
          rebuilt: true,
          ...meta,
        },
      };
    } catch (e) {
      return { success: false, error: `reindex_codebase failed: ${(e as Error).message}` };
    }
  },
};

export const findSimilarTool: RegisteredTool = {
  name: 'find_similar',
  description:
    'Given a file path and a 1-based line number, find other code regions similar to that chunk ' +
    '(same BM25 lexical model as semantic_search). Excludes the exact source chunk.',
  category: 'search',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Project-relative file path.',
      },
      line: {
        type: 'integer',
        description: '1-based line number inside the file.',
      },
      chunk_id: {
        type: 'integer',
        description: 'Optional: internal chunk id from a prior semantic_search hit if exposed.',
      },
      limit: {
        type: 'integer',
        description: 'Max hits (default 10, max 20).',
      },
    },
    required: [],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const limit = Math.min(Math.max(1, Number(args.limit) || 10), 20);

    try {
      await codeIndex.ensureCodeIndex(ctx.projectRoot, ctx.sendProgress);

      let chunk = null as ReturnType<typeof codeIndex.getChunkById> | null;

      if (args.chunk_id != null && args.chunk_id !== '') {
        const id = Number(args.chunk_id);
        if (!Number.isNaN(id)) chunk = codeIndex.getChunkById(id);
      }

      if (!chunk) {
        const rel = String(args.path ?? '').trim();
        const line = Number(args.line);
        if (!rel || !Number.isFinite(line) || line < 1) {
          return {
            success: false,
            error: 'Provide path + line (1-based), or chunk_id from the index.',
          };
        }
        const safe = rel.replace(/\\/g, '/').replace(/^\/+/, '');
        const abs = path.resolve(ctx.projectRoot, safe);
        if (!abs.startsWith(path.resolve(ctx.projectRoot))) {
          return { success: false, error: 'Path must stay within the project root.' };
        }
        chunk = codeIndex.findChunkByLocation(safe, line);
      }

      if (!chunk) {
        return {
          success: false,
          error: 'No indexed chunk found for that location. Try reindex_codebase.',
        };
      }

      const hits = codeIndex.searchSimilarToChunk(chunk, limit);
      return {
        success: true,
        result: {
          source: {
            path: chunk.path,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            chunk_id: chunk.id,
          },
          hits,
          count: hits.length,
        },
      };
    } catch (e) {
      return { success: false, error: `find_similar failed: ${(e as Error).message}` };
    }
  },
};

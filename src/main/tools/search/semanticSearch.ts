import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import * as codeIndex from '../../codeIndex.js';
import { resolveWithinRoot } from '../../security/pathValidation.js';
import { getErrorMessage } from '../../../shared/errorUtils.js';
import { getSettings } from '../../secureStore.js';
import * as embedding from '../../embeddingClient.js';

const MAX_BM25_RECALL_FOR_RERANK = 48;
const MAX_EMB_BATCH = 48;

async function rerankBm25HitsWithEmbeddings(opts: {
  embedTexts: (texts: string[]) => Promise<number[][]>;
  query: string;
  hits: ReturnType<typeof codeIndex.searchChunks>;
  limit: number;
  sendProgress?: (m: string) => void;
}): Promise<{ hits: ReturnType<typeof codeIndex.searchChunks>; note?: string }> {
  const { embedTexts, query, hits, limit } = opts;
  if (hits.length === 0) return { hits };
  opts.sendProgress?.('semantic_search: embedding rerank…');
  const q = query.trim();
  try {
    const [qVec] = await embedTexts([q.slice(0, 8000)]);
    const previews = hits.map(
      (h) => `${h.path}:${h.startLine}-${h.endLine}\n${h.preview}`.slice(0, 6000),
    );
    let offset = 0;
    const vecsDoc: number[][] = [];
    while (offset < previews.length) {
      const slice = previews.slice(offset, offset + MAX_EMB_BATCH);
      const chunk = await embedTexts(slice);
      vecsDoc.push(...chunk);
      offset += slice.length;
    }
    if (vecsDoc.length !== hits.length) {
      return { hits, note: 'embedding rerank skipped: mismatched embedding count' };
    }
    const ranked = [...hits].map((h, i) => ({
      hit: h,
      sim: embedding.cosineSimilarity(qVec, vecsDoc[i] ?? []),
    }));
    ranked.sort((a, b) => b.sim - a.sim);
    return {
      hits: ranked.slice(0, limit).map((r) => ({
        ...r.hit,
        score: Math.round((r.hit.score + r.sim * 50) * 1000) / 1000,
      })),
    };
  } catch (e) {
    return {
      hits,
      note: `embedding rerank failed: ${getErrorMessage(e)}`,
    };
  }
}

export const semanticSearchTool: RegisteredTool = {
  name: 'semantic_search',
  description:
    'Hybrid codebase discovery: overlapping BM25 chunks with optional embedding reranking ' +
    '(OpenRouter embeddings, or local OpenAI-compatible `/v1/embeddings` when completion provider is Local LLM). ' +
    'Enable reranking in Settings or pass use_embedding_rerank.',
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
      use_embedding_rerank: {
        type: 'boolean',
        description:
          'When true, reranks BM25 recall with embeddings (needs embedding model + OpenRouter key, or Local LLM base URL). ' +
          'Overrides the global default when set.',
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
      const settings = await getSettings();
      const argRerank =
        typeof args.use_embedding_rerank === 'boolean'
          ? args.use_embedding_rerank
          : undefined;
      const wantsRerank = argRerank ?? Boolean(settings.semanticSearchEmbedRerank);

      await codeIndex.ensureCodeIndex(ctx.projectRoot, ctx.sendProgress);
      const recall = wantsRerank ? Math.min(MAX_BM25_RECALL_FOR_RERANK, Math.max(limit * 4, 24)) : limit;
      let hits = codeIndex.searchChunks(query, recall);
      const notes: string[] = [];

      const embedModel = (settings.embeddingOpenRouterModel ?? '').trim();

      if (wantsRerank && settings.aiCompletionProvider === 'openrouter') {
        const key = (settings.apiKey ?? '').trim();
        if (!key || !embedModel) {
          notes.push(
            key
              ? 'embedding rerank skipped: set embedding model in Settings'
              : 'embedding rerank skipped: missing OpenRouter API key',
          );
        } else {
          const { hits: reranked, note } = await rerankBm25HitsWithEmbeddings({
            embedTexts: (texts) => embedding.embedTextsOpenRouter(key, embedModel, texts),
            query,
            hits,
            limit,
            sendProgress: ctx.sendProgress,
          });
          hits = reranked;
          if (note) notes.push(note);
        }
      } else if (wantsRerank && settings.aiCompletionProvider === 'local_openai') {
        const base = (settings.localOpenAiBaseUrl ?? '').trim();
        if (!base || !embedModel) {
          notes.push(
            !base
              ? 'embedding rerank skipped: set Local LLM base URL in Settings'
              : 'embedding rerank skipped: set embedding model id in Settings (e.g. nomic-embed-text for Ollama)',
          );
        } else {
          const { hits: reranked, note } = await rerankBm25HitsWithEmbeddings({
            embedTexts: (texts) =>
              embedding.embedTextsOpenAiCompatible(base, undefined, embedModel, texts),
            query,
            hits,
            limit,
            sendProgress: ctx.sendProgress,
          });
          hits = reranked;
          if (note) notes.push(note);
        }
      }

      hits = hits.slice(0, limit);

      const meta = codeIndex.getIndexMeta();
      return {
        success: true,
        result: {
          index: meta,
          query,
          hits,
          count: hits.length,
          ...(notes.length ? { notes } : {}),
          embedding_rerank_requested: wantsRerank,
        },
      };
    } catch (e) {
      return { success: false, error: `semantic_search failed: ${getErrorMessage(e)}` };
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
      return { success: false, error: `reindex_codebase failed: ${getErrorMessage(e)}` };
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
        const relRaw = String(args.path ?? '').trim();
        const line = Number(args.line);
        if (!relRaw || !Number.isFinite(line) || line < 1) {
          return {
            success: false,
            error: 'Provide path + line (1-based), or chunk_id from the index.',
          };
        }
        const resolvedLoc = resolveWithinRoot(ctx.projectRoot, relRaw);
        if (!resolvedLoc) {
          return { success: false, error: 'Path must stay within the project root.' };
        }
        chunk = codeIndex.findChunkByLocation(resolvedLoc.relativePath, line);
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
      return { success: false, error: `find_similar failed: ${getErrorMessage(e)}` };
    }
  },
};

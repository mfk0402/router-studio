/**
 * In-memory lexical codebase index (Okapi BM25 over overlapping line chunks).
 * No native deps — suitable for "semantic-style" code discovery without embeddings.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Dirent } from 'node:fs';

export interface CodeChunk {
  id: number;
  /** Relative path with forward slashes */
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

interface Posting {
  docId: number;
  tf: number;
}

export interface SearchHit {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  preview: string;
}

export interface IndexMeta {
  projectRoot: string;
  chunkCount: number;
  builtAt: number;
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'out',
  '.turbo',
  '.cache',
  '.vite',
  'release',
]);

const TEXT_EXT = new Set([
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'md',
  'mdx',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'vue',
  'svelte',
  'py',
  'pyi',
  'rs',
  'go',
  'java',
  'kt',
  'kts',
  'cs',
  'cpp',
  'cc',
  'cxx',
  'c',
  'h',
  'hpp',
  'rb',
  'php',
  'swift',
  'sql',
  'yaml',
  'yml',
  'toml',
  'xml',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'cmd',
  'dockerfile',
  'makefile',
  'graphql',
  'proto',
]);

const MAX_FILE_BYTES = 512_000;
const CHUNK_LINES = 48;
const CHUNK_STRIDE = 24;
const MAX_CHUNKS = 80_000;

/** English stopwords removed from similarity queries */
const STOP = new Set(
  'a an the and or but if in on at to for of as by with from is are was were be been being it this that these those not no so than then into over out up down do does did can could should would will just only also very more most some such same both each few other any all each both'.split(
    ' ',
  ),
);

const k1 = 1.5;
const b = 0.75;

let chunks: CodeChunk[] = [];
let docLengths: number[] = [];
let avgdl = 0;
let N = 0;
/** term -> postings sorted by docId */
let postings = new Map<string, Posting[]>();
let indexedRoot: string | null = null;
let builtAt = 0;

function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  return raw.filter((t) => t.length > 1);
}

function idf(df: number): number {
  return Math.log(1 + (N - df + 0.5) / (df + 0.5));
}

function scoreDoc(docId: number, termScores: Map<string, number>): number {
  const dl = docLengths[docId] ?? 0;
  let s = 0;
  for (const [term, tf] of termScores) {
    const list = postings.get(term);
    if (!list) continue;
    const df = list.length;
    const idfVal = idf(df);
    const denom = tf + k1 * (1 - b + (b * dl) / avgdl);
    s += (idfVal * tf * (k1 + 1)) / denom;
  }
  return s;
}

function addToPostings(docId: number, tfMap: Map<string, number>): void {
  for (const [term, tf] of tfMap) {
    let list = postings.get(term);
    if (!list) {
      list = [];
      postings.set(term, list);
    }
    list.push({ docId, tf });
  }
}

function finalizePostings(): void {
  for (const list of postings.values()) {
    list.sort((a, b) => a.docId - b.docId);
  }
}

function chunkLines(lines: string[], relPath: string, baseId: number): CodeChunk[] {
  const out: CodeChunk[] = [];
  if (lines.length === 0) return out;

  let start = 0;
  while (start < lines.length && out.length + baseId < MAX_CHUNKS) {
    const end = Math.min(start + CHUNK_LINES, lines.length);
    const slice = lines.slice(start, end);
    const text = slice.join('\n');
    out.push({
      id: baseId + out.length,
      path: relPath,
      startLine: start + 1,
      endLine: end,
      text,
    });
    if (end >= lines.length) break;
    start += CHUNK_STRIDE;
  }
  return out;
}

function extOf(filename: string): string {
  const base = filename.split('.');
  if (base.length < 2) return '';
  return base[base.length - 1]!.toLowerCase();
}

async function walkAndChunk(
  dir: string,
  projectRoot: string,
  sendProgress?: (m: string) => void,
): Promise<CodeChunk[]> {
  const collected: CodeChunk[] = [];

  async function walk(absDir: string): Promise<void> {
    if (collected.length >= MAX_CHUNKS) return;

    let entries: Dirent[];
    try {
      entries = (await fs.readdir(absDir, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      if (collected.length >= MAX_CHUNKS) return;

      const abs = path.join(absDir, entry.name);
      const rel = path.relative(projectRoot, abs).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(abs);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = extOf(entry.name);
      const nameLow = entry.name.toLowerCase();
      const isDockerfile = nameLow === 'dockerfile' || nameLow.startsWith('dockerfile.');
      const isMakefile = nameLow === 'makefile' || nameLow === 'gnumakefile';
      if (!TEXT_EXT.has(ext) && !isDockerfile && !isMakefile) continue;

      let st: { size: number };
      try {
        st = await fs.stat(abs);
      } catch {
        continue;
      }
      if (st.size > MAX_FILE_BYTES) continue;

      let raw: string;
      try {
        raw = await fs.readFile(abs, 'utf8');
      } catch {
        continue;
      }
      if (raw.includes('\0')) continue;

      const lines = raw.split(/\r?\n/);
      const baseId = collected.length;
      const fileChunks = chunkLines(lines, rel, baseId);
      collected.push(...fileChunks);

      if (collected.length % 500 === 0 && collected.length > 0) {
        sendProgress?.(`code index: ${collected.length} chunks…`);
      }
    }
  }

  await walk(dir);
  return collected;
}

function buildPostingsFromChunks(newChunks: CodeChunk[]): void {
  postings = new Map();
  docLengths = new Array(newChunks.length);
  N = newChunks.length;
  let lenSum = 0;

  for (let i = 0; i < newChunks.length; i++) {
    const ch = newChunks[i]!;
    const terms = tokenize(ch.text);
    const tf = new Map<string, number>();
    for (const t of terms) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    docLengths[i] = terms.length;
    lenSum += terms.length;
    addToPostings(i, tf);
  }

  avgdl = N > 0 ? lenSum / N : 0;
  finalizePostings();
}

/**
 * Replace the in-memory index for a project. Call from reindex tool or lazy ensure.
 */
export async function buildCodeIndex(
  projectRoot: string,
  sendProgress?: (m: string) => void,
): Promise<IndexMeta> {
  sendProgress?.('Indexing codebase (BM25 chunks)…');
  const next = await walkAndChunk(projectRoot, projectRoot, sendProgress);
  chunks = next;
  buildPostingsFromChunks(chunks);
  indexedRoot = path.resolve(projectRoot);
  builtAt = Date.now();
  sendProgress?.(`Code index ready: ${chunks.length} chunks.`);
  return { projectRoot: indexedRoot, chunkCount: chunks.length, builtAt };
}

export function getIndexMeta(): IndexMeta | null {
  if (!indexedRoot || chunks.length === 0) return null;
  return { projectRoot: indexedRoot, chunkCount: chunks.length, builtAt };
}

export function indexMatchesRoot(projectRoot: string): boolean {
  if (!indexedRoot || !projectRoot) return false;
  return path.resolve(projectRoot) === indexedRoot && chunks.length > 0;
}

export async function ensureCodeIndex(
  projectRoot: string,
  sendProgress?: (m: string) => void,
): Promise<IndexMeta> {
  if (indexMatchesRoot(projectRoot)) {
    return { projectRoot: indexedRoot!, chunkCount: chunks.length, builtAt };
  }
  return buildCodeIndex(projectRoot, sendProgress);
}

export function searchChunks(query: string, limit: number): SearchHit[] {
  const qTerms = tokenize(query);
  if (qTerms.length === 0 || N === 0) return [];

  const docAccum = new Map<number, Map<string, number>>();

  for (const term of qTerms) {
    const list = postings.get(term);
    if (!list) continue;
    for (const { docId, tf } of list) {
      let m = docAccum.get(docId);
      if (!m) {
        m = new Map();
        docAccum.set(docId, m);
      }
      m.set(term, (m.get(term) ?? 0) + tf);
    }
  }

  const scored: { docId: number; score: number }[] = [];
  for (const [docId, termScores] of docAccum) {
    scored.push({ docId, score: scoreDoc(docId, termScores) });
  }
  scored.sort((a, b) => b.score - a.score);

  const out: SearchHit[] = [];
  const cap = Math.min(Math.max(1, limit), 50);
  for (const { docId, score } of scored.slice(0, cap)) {
    const ch = chunks[docId];
    if (!ch) continue;
    const preview = ch.text.split('\n').slice(0, 6).join('\n').slice(0, 600);
    out.push({
      path: ch.path,
      startLine: ch.startLine,
      endLine: ch.endLine,
      score: Math.round(score * 1000) / 1000,
      preview,
    });
  }
  return out;
}

/** Top discriminating terms in a chunk (for similarity query). */
export function termsForSimilarity(chunkText: string, maxTerms: number): string[] {
  const tf = new Map<string, number>();
  for (const t of tokenize(chunkText)) {
    if (STOP.has(t)) continue;
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  const sorted = [...tf.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  return sorted.slice(0, maxTerms);
}

export function findChunkByLocation(
  relPath: string,
  line: number,
): CodeChunk | null {
  const norm = relPath.replace(/\\/g, '/');
  for (const ch of chunks) {
    if (ch.path !== norm) continue;
    if (line >= ch.startLine && line <= ch.endLine) return ch;
  }
  for (const ch of chunks) {
    if (ch.path === norm) return ch;
  }
  return null;
}

export function getChunkById(id: number): CodeChunk | null {
  return chunks[id] ?? null;
}

export function searchSimilarToChunk(
  chunk: CodeChunk,
  limit: number,
): SearchHit[] {
  const terms = termsForSimilarity(chunk.text, 18);
  const pseudoQuery = terms.join(' ');
  const hits = searchChunks(pseudoQuery, limit + 5);
  return hits.filter((h) => !(h.path === chunk.path && h.startLine === chunk.startLine)).slice(0, limit);
}

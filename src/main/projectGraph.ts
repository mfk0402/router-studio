import { app } from 'electron';
import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  ProjectContextRecommendation,
  ProjectGraphFileNode,
  ProjectGraphSnapshot,
} from '../shared/types.js';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'release',
  'dist',
  'build',
  'coverage',
  '.next',
  '.vite',
  '.cache',
  '.turbo',
]);

const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.css',
  '.scss',
  '.html',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.cs',
  '.php',
  '.rb',
  '.sql',
  '.yaml',
  '.yml',
]);

const MAX_FILES = 6000;
const MAX_FILE_BYTES = 750_000;

function graphDir(): string {
  return path.join(app.getPath('userData'), 'project-graphs');
}

function graphPath(projectRoot: string): string {
  const key = path.resolve(projectRoot).toLowerCase();
  const id = createHash('sha256').update(key).digest('hex').slice(0, 36);
  return path.join(graphDir(), `${id}.json`);
}

function languageFor(rel: string): string {
  const ext = path.extname(rel).toLowerCase();
  if (ext === '.tsx') return 'typescriptreact';
  if (ext === '.ts') return 'typescript';
  if (ext === '.jsx') return 'javascriptreact';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.py') return 'python';
  if (ext === '.rs') return 'rust';
  if (ext === '.go') return 'go';
  if (ext === '.json') return 'json';
  if (ext === '.md') return 'markdown';
  return ext.replace(/^\./, '') || 'text';
}

function normalizeRel(p: string): string {
  return p.replace(/\\/g, '/');
}

async function walkFiles(projectRoot: string): Promise<Array<{ rel: string; abs: string; size: number }>> {
  const out: Array<{ rel: string; abs: string; size: number }> = [];
  async function walk(absDir: string): Promise<void> {
    if (out.length >= MAX_FILES) return;
    let entries: Dirent[];
    try {
      entries = (await fs.readdir(absDir, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      const abs = path.join(absDir, entry.name);
      const rel = normalizeRel(path.relative(projectRoot, abs));
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXT.has(ext) && entry.name.toLowerCase() !== 'dockerfile') continue;
      try {
        const st = await fs.stat(abs);
        if (st.size > MAX_FILE_BYTES) continue;
        out.push({ rel, abs, size: st.size });
      } catch {
        continue;
      }
    }
  }
  await walk(projectRoot);
  return out;
}

function parseImports(source: string): string[] {
  const specs = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1]) specs.add(m[1]);
    }
  }
  return [...specs].slice(0, 120);
}

function parseExports(source: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/g,
    /\bmodule\.exports\.([A-Za-z_$][\w$]*)/g,
    /\bexports\.([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1]) names.add(m[1]);
    }
  }
  return [...names].slice(0, 120);
}

function parseSymbols(source: string, rel: string): Array<{ name: string; kind: string; line?: number }> {
  const out: Array<{ name: string; kind: string; line?: number }> = [];
  const lines = source.split(/\r?\n/);
  const re =
    /\b(async\s+)?(function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)|\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;
  for (let i = 0; i < lines.length && out.length < 160; i++) {
    const m = re.exec(lines[i] ?? '');
    if (!m) continue;
    const kind = (m[2] ?? m[4] ?? 'symbol').trim();
    const name = (m[3] ?? m[5] ?? '').trim();
    if (name) out.push({ name, kind: kind === 'const' ? 'function' : kind, line: i + 1 });
  }
  if (out.length === 0 && rel.endsWith('.py')) {
    const py = /^\s*(def|class)\s+([A-Za-z_][\w]*)/;
    for (let i = 0; i < lines.length && out.length < 160; i++) {
      const m = py.exec(lines[i] ?? '');
      if (m?.[2]) out.push({ name: m[2], kind: m[1] ?? 'symbol', line: i + 1 });
    }
  }
  return out;
}

function routeFromFile(rel: string): string[] {
  const clean = rel.replace(/\\/g, '/');
  const appMatch = clean.match(/(?:^|\/)(?:app|pages)\/(.+?)\/?(?:page|route|index)?\.(?:tsx|ts|jsx|js)$/);
  if (!appMatch?.[1]) return [];
  let route = '/' + appMatch[1]
    .replace(/\/(?:page|route|index)$/, '')
    .replace(/\[[^\]]+\]/g, ':param')
    .replace(/\/+/g, '/');
  route = route.replace(/\/$/, '') || '/';
  return [route];
}

function inferTestCommands(packageScripts: Record<string, string>): string[] {
  const preferred = ['test', 'typecheck', 'lint', 'verify', 'build'];
  return preferred
    .filter((name) => packageScripts[name])
    .map((name) => `npm run ${name}`);
}

async function readPackageScripts(projectRoot: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    return parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  } catch {
    return {};
  }
}

export async function buildProjectGraph(projectRoot: string): Promise<ProjectGraphSnapshot> {
  const root = path.resolve(projectRoot);
  const files = await walkFiles(root);
  const nodes: ProjectGraphFileNode[] = [];
  const symbols: ProjectGraphSnapshot['symbols'] = [];
  const imports: ProjectGraphSnapshot['imports'] = [];
  const exportsList: ProjectGraphSnapshot['exports'] = [];
  const routes: ProjectGraphSnapshot['routes'] = [];

  for (const f of files) {
    let source = '';
    try {
      source = await fs.readFile(f.abs, 'utf8');
      if (source.includes('\0')) continue;
    } catch {
      continue;
    }
    const nodeImports = parseImports(source);
    const nodeExports = parseExports(source);
    const nodeSymbols = parseSymbols(source, f.rel);
    const nodeRoutes = routeFromFile(f.rel);
    nodes.push({
      path: f.rel,
      language: languageFor(f.rel),
      imports: nodeImports,
      exports: nodeExports,
      symbols: nodeSymbols.map((s) => s.name),
      routes: nodeRoutes,
      sizeBytes: f.size,
    });
    for (const specifier of nodeImports) imports.push({ from: f.rel, to: specifier, specifier });
    for (const name of nodeExports) exportsList.push({ file: f.rel, name });
    for (const sym of nodeSymbols) symbols.push({ ...sym, file: f.rel });
    for (const route of nodeRoutes) routes.push({ route, file: f.rel });
  }

  const packageScripts = await readPackageScripts(root);
  const snapshot: ProjectGraphSnapshot = {
    id: createHash('sha256').update(`${root}:${Date.now()}`).digest('hex').slice(0, 16),
    projectRoot: root,
    builtAt: Date.now(),
    files: nodes,
    symbols,
    imports,
    exports: exportsList,
    routes,
    packageScripts,
    testCommands: inferTestCommands(packageScripts),
  };
  await fs.mkdir(graphDir(), { recursive: true });
  await fs.writeFile(graphPath(root), JSON.stringify(snapshot, null, 2), 'utf8');
  return snapshot;
}

export async function getProjectGraph(projectRoot: string): Promise<ProjectGraphSnapshot | null> {
  const root = path.resolve(projectRoot);
  try {
    const raw = await fs.readFile(graphPath(root), 'utf8');
    const parsed = JSON.parse(raw) as ProjectGraphSnapshot;
    if (parsed.projectRoot === root && Array.isArray(parsed.files)) return parsed;
  } catch {
    // cache miss
  }
  return buildProjectGraph(root);
}

export async function recommendProjectContext(
  projectRoot: string,
  query: string,
  limit = 12,
): Promise<ProjectContextRecommendation[]> {
  const graph = await getProjectGraph(projectRoot);
  if (!graph) return [];
  const terms = query.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [];
  if (terms.length === 0) return graph.files.slice(0, limit).map((f, i) => ({
    path: f.path,
    score: Math.max(1, limit - i),
    reason: 'Project graph file',
  }));

  const scored = graph.files.map((file) => {
    const hay = [
      file.path,
      file.language,
      file.imports.join(' '),
      file.exports.join(' '),
      file.symbols.join(' '),
      file.routes.join(' '),
    ].join(' ').toLowerCase();
    let score = 0;
    const reasons: string[] = [];
    for (const term of terms) {
      if (file.path.toLowerCase().includes(term)) {
        score += 8;
        reasons.push(`path:${term}`);
      }
      if (hay.includes(term)) score += 3;
    }
    if (file.symbols.some((s) => terms.some((t) => s.toLowerCase().includes(t)))) {
      score += 7;
      reasons.push('symbol match');
    }
    if (file.routes.length > 0) score += 1;
    return {
      path: file.path,
      score,
      reason: reasons.slice(0, 3).join(', ') || 'text match',
    };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, Math.max(1, Math.min(limit, 50)));
}

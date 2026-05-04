/**
 * Parse compiler/test-style file references in plain text for clickable UX.
 * Matches `path/file.ts:line`, `path/file.ts:line:col`, and `path/file.ts(line,col)`.
 */

export interface FileLocationLink {
  /** Raw substring from the source text */
  raw: string;
  /** Workspace-relative path (forward slashes, no leading `./`) */
  relativePath: string;
  line: number;
  column?: number;
}

const EXT =
  'tsx?|jsx?|mjs|cjs|vue|svelte|py|rs|go|java|kt|swift|rb|php|cs|fs|cpp|cc|cxx|c|h|hpp|md|json|ya?ml|toml|css|scss|less|html?';

/** Path segment: dotfiles + scoped npm segments (@scope/pkg) allowed */
const PATH_BODY = String.raw`(?:[\w@.-]+\/)*[\w@.-]+`;

const RE_COLON = new RegExp(
  String.raw`(?:^|[\s(<>'"\[(])((?:\.?\/)?${PATH_BODY}\.(?:${EXT})):(\d+)(?::(\d+))?`,
  'gi',
);

const RE_PAREN = new RegExp(
  String.raw`(?:^|[\s(<>'"\[(])((?:\.?\/)?${PATH_BODY}\.(?:${EXT}))\((\d+)(?:,\s*(\d+))?\)`,
  'gi',
);

export type OutputSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; link: FileLocationLink };

function linkFromMatch(m: RegExpExecArray, source: string): FileLocationLink | null {
  const pathRaw = m[1];
  const lineStr = m[2];
  const colStr = m[3];
  const path = normalizeRelativePath(stripNoise(pathRaw));
  if (!path || path.includes('..')) return null;
  const lc = safeLineCol(lineStr, colStr);
  if (!lc) return null;
  return {
    raw: source.slice(m.index, m.index + m[0].length),
    relativePath: path,
    line: lc.line,
    column: lc.column,
  };
}

/** Split plain text into alternating text / clickable file-location spans. */
export function segmentOutputWithFileLinks(text: string): OutputSegment[] {
  type Hit = { s: number; e: number; link: FileLocationLink };
  const hits: Hit[] = [];
  const run = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const link = linkFromMatch(m, text);
      if (link) hits.push({ s: m.index, e: m.index + m[0].length, link });
    }
  };
  run(RE_COLON);
  run(RE_PAREN);
  hits.sort((a, b) => a.s - b.s || b.e - a.e);

  const merged: Hit[] = [];
  for (const h of hits) {
    const prev = merged[merged.length - 1];
    if (!prev || h.s >= prev.e) {
      merged.push(h);
      continue;
    }
    if (h.e > prev.e) merged[merged.length - 1] = h;
  }

  const seg: OutputSegment[] = [];
  let pos = 0;
  for (const h of merged) {
    if (h.s > pos) seg.push({ type: 'text', text: text.slice(pos, h.s) });
    seg.push({ type: 'link', link: h.link });
    pos = h.e;
  }
  if (pos < text.length) seg.push({ type: 'text', text: text.slice(pos) });
  return seg;
}

function stripNoise(path: string): string {
  return path.replace(/[`'"),\];:]+$/g, '').replace(/^[`'"(\[]+/, '');
}

function normalizeRelativePath(raw: string): string {
  let p = raw.replace(/\\/g, '/').trim();
  if (p.startsWith('./')) p = p.slice(2);
  return p;
}

function safeLineCol(lineStr: string, colStr?: string): { line: number; column?: number } | null {
  const line = Number(lineStr);
  if (!Number.isFinite(line) || line < 1 || line > 2_000_000) return null;
  if (colStr === undefined) return { line };
  const column = Number(colStr);
  if (!Number.isFinite(column) || column < 1 || column > 50_000) return { line };
  return { line, column };
}

/** Strip absolute project prefix so links resolve as workspace-relative paths. */
export function stripProjectRoot(absOrRel: string, projectRoot: string | null): string {
  const norm = normalizeRelativePath(absOrRel);
  if (!projectRoot) return norm;
  const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const prefix = root + '/';
  if (norm.startsWith(prefix)) return norm.slice(prefix.length);
  return norm;
}

export function parseFileLocationLinks(text: string): FileLocationLink[] {
  const out: FileLocationLink[] = [];
  const seen = new Set<string>();

  const pushLink = (link: FileLocationLink) => {
    const key = `${link.relativePath}:${link.line}:${link.column ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(link);
  };

  const scan = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const link = linkFromMatch(m, text);
      if (link) pushLink(link);
    }
  };

  scan(RE_COLON);
  scan(RE_PAREN);

  return out;
}

/** Best single link inside a user selection (terminal copy, etc.). */
export function parseFirstFileLocationInText(text: string): FileLocationLink | null {
  const seg = segmentOutputWithFileLinks(text);
  const hit = seg.find((s): s is { type: 'link'; link: FileLocationLink } => s.type === 'link');
  return hit?.link ?? null;
}

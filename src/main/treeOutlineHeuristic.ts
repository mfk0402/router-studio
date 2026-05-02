/**
 * Regex-based structural outline (MVP). Full Tree-sitter WASM grammars can
 * replace this later without changing the tool contract.
 */
export interface OutlineEntry {
  name: string;
  kind: 'function' | 'class' | 'method' | 'variable' | 'interface' | 'other';
  line: number;
}

const LINE_RES: Array<{ re: RegExp; kind: OutlineEntry['kind'] }> = [
  { re: /^\s*export\s+(?:async\s+)?function\s+(\w+)/, kind: 'function' },
  { re: /^\s*(?:async\s+)?function\s+(\w+)/, kind: 'function' },
  { re: /^\s*export\s+class\s+(\w+)/, kind: 'class' },
  { re: /^\s*class\s+(\w+)/, kind: 'class' },
  { re: /^\s*export\s+interface\s+(\w+)/, kind: 'interface' },
  { re: /^\s*interface\s+(\w+)/, kind: 'interface' },
  {
    re: /^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/,
    kind: 'variable',
  },
  {
    re: /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{/,
    kind: 'method',
  },
];

export function outlineHeuristic(source: string, _languageId: string): OutlineEntry[] {
  const lines = source.split('\n');
  const out: OutlineEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const { re, kind } of LINE_RES) {
      const m = line.match(re);
      if (m?.[1]) {
        out.push({ name: m[1], kind, line: i + 1 });
        break;
      }
    }
    if (out.length >= 400) break;
  }
  return out;
}

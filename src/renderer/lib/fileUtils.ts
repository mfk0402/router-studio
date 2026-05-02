import type { FileEntry } from '../../shared/types';

/**
 * Map file extensions to the Monaco language id.
 *
 * Monaco's bundled languages cover: typescript, javascript, json, html, css,
 * scss, less, markdown, python, ruby, php, rust, go, java, kotlin, swift,
 * csharp, cpp, c, objective-c, sql, shell, powershell, yaml, xml, dockerfile,
 * lua, r, perl, clojure, scala, fsharp, pgsql, mysql, graphql, handlebars,
 * redis, sb, coffee, bat, ini, pug, julia, solidity, tcl, vb, razor, dart,
 * apex, abap, azcli, bicep, cameligo, pascal, hcl, liquid, m3, postiats,
 * powerquery, qsharp, scheme, sophia, st, systemverilog, twig.
 *
 * See: https://github.com/microsoft/monaco-editor/tree/main/src/basic-languages
 */
const EXT_MAP: Record<string, string> = {
  // TS/JS family
  ts: 'typescript',
  tsx: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  cjs: 'javascript',
  mjs: 'javascript',
  // Data / config
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  env: 'shell',
  properties: 'ini',
  // Docs
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  mdc: 'markdown',
  rst: 'plaintext',
  txt: 'plaintext',
  log: 'plaintext',
  // Web
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  svg: 'xml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  // Backend scripts
  py: 'python',
  pyw: 'python',
  rb: 'ruby',
  php: 'php',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  // Systems
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  fs: 'fsharp',
  fsx: 'fsharp',
  vb: 'vb',
  // Shells
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ksh: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  // Data / query
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'plaintext',
  // Other languages Monaco supports
  lua: 'lua',
  pl: 'perl',
  pm: 'perl',
  r: 'r',
  scala: 'scala',
  clj: 'clojure',
  cljs: 'clojure',
  dart: 'dart',
  jl: 'julia',
  sol: 'sol',
  // Infra
  dockerfile: 'dockerfile',
  tf: 'hcl',
  tfvars: 'hcl',
  hcl: 'hcl',
  // Misc
  coffee: 'coffeescript',
  pug: 'pug',
  handlebars: 'handlebars',
  hbs: 'handlebars',
  razor: 'razor',
  cshtml: 'razor',
  // Languages Monaco doesn't have — fall back to plaintext with vibey names
  vue: 'html',
  svelte: 'html',
  astro: 'html',
  zig: 'plaintext',
  nim: 'plaintext',
  elm: 'plaintext',
  hs: 'plaintext',
  ex: 'plaintext',
  exs: 'plaintext',
  erl: 'plaintext',
  ml: 'plaintext',
  mli: 'plaintext',
  proto: 'plaintext',
  v: 'plaintext',
  vhd: 'plaintext',
  vhdl: 'plaintext',
  patch: 'plaintext',
  diff: 'plaintext',
};

/** Special filenames (no extension, or name is authoritative). */
const FILENAME_MAP: Record<string, string> = {
  dockerfile: 'dockerfile',
  'dockerfile.dev': 'dockerfile',
  'dockerfile.prod': 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  rakefile: 'ruby',
  gemfile: 'ruby',
  'gemfile.lock': 'ruby',
  procfile: 'yaml',
  brewfile: 'ruby',
  '.gitignore': 'ignore',
  '.gitattributes': 'plaintext',
  '.dockerignore': 'ignore',
  '.npmignore': 'ignore',
  '.editorconfig': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  '.env': 'shell',
  '.env.local': 'shell',
  '.env.development': 'shell',
  '.env.production': 'shell',
  'cmakelists.txt': 'cmake',
  'cargo.toml': 'ini',
  'cargo.lock': 'ini',
  'pipfile': 'ini',
  'pipfile.lock': 'json',
  'package.json': 'json',
  'package-lock.json': 'json',
  'tsconfig.json': 'json',
  'jsconfig.json': 'json',
};

export function extToLanguage(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? filename;
  const lower = base.toLowerCase();
  if (FILENAME_MAP[lower]) return FILENAME_MAP[lower];
  // Handle Dockerfile.anything
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile';
  if (lower === 'makefile' || lower.startsWith('makefile.')) return 'makefile';
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'plaintext';
  const ext = lower.slice(dot + 1);
  return EXT_MAP[ext] ?? 'plaintext';
}

/**
 * Build a compact project-tree summary string suitable for AI context.
 * Trims at maxLines and skips common heavy directories.
 */
export function summarizeTree(root: FileEntry | null, maxLines = 200): string {
  if (!root) return '';
  const lines: string[] = [];
  function walk(node: FileEntry, depth: number): void {
    if (lines.length >= maxLines) return;
    if (node.relativePath !== '.') {
      const prefix = '  '.repeat(depth - 1);
      lines.push(`${prefix}${node.isDirectory ? '[D] ' : '[F] '}${node.name}`);
    }
    if (node.children) {
      for (const child of node.children) {
        if (lines.length >= maxLines) break;
        walk(child, depth + 1);
      }
    }
  }
  walk(root, 0);
  if (lines.length >= maxLines) {
    lines.push(`... (tree truncated at ${maxLines} lines)`);
  }
  return lines.join('\n');
}

export function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p;
}

export function dirname(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  parts.pop();
  return parts.join('/');
}

/** Does this Monaco language id correspond to a shell-like language? */
export function isShellLanguage(lang: string): boolean {
  return lang === 'shell' || lang === 'powershell' || lang === 'bat';
}

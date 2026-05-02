import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

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
]);

// Common code file extensions
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.go',
  '.rs',
  '.java', '.kt', '.kts',
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.scala',
  '.vue', '.svelte',
]);

// Symbol patterns for different languages
const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  // TypeScript/JavaScript
  '.ts': [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
    /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/gm,
    /^(?:export\s+)?class\s+(\w+)/gm,
    /^(?:export\s+)?interface\s+(\w+)/gm,
    /^(?:export\s+)?type\s+(\w+)/gm,
    /^(?:export\s+)?enum\s+(\w+)/gm,
  ],
  '.tsx': [],  // Uses .ts patterns
  '.js': [],   // Uses .ts patterns  
  '.jsx': [],  // Uses .ts patterns
  '.mjs': [],  // Uses .ts patterns
  '.cjs': [],  // Uses .ts patterns
  
  // Python
  '.py': [
    /^(?:async\s+)?def\s+(\w+)/gm,
    /^class\s+(\w+)/gm,
  ],
  
  // Go
  '.go': [
    /^func\s+(?:\([^)]*\)\s+)?(\w+)/gm,
    /^type\s+(\w+)\s+(?:struct|interface)/gm,
    /^var\s+(\w+)/gm,
    /^const\s+(\w+)/gm,
  ],
  
  // Rust
  '.rs': [
    /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm,
    /^(?:pub\s+)?struct\s+(\w+)/gm,
    /^(?:pub\s+)?enum\s+(\w+)/gm,
    /^(?:pub\s+)?trait\s+(\w+)/gm,
    /^(?:pub\s+)?type\s+(\w+)/gm,
    /^(?:pub\s+)?const\s+(\w+)/gm,
  ],
  
  // Java/Kotlin
  '.java': [
    /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+(\w+)/gm,
    /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?\w+\s+(\w+)\s*\(/gm,
    /^(?:public|private|protected)?\s*interface\s+(\w+)/gm,
    /^(?:public|private|protected)?\s*enum\s+(\w+)/gm,
  ],
  '.kt': [
    /^(?:fun|suspend fun)\s+(\w+)/gm,
    /^(?:class|data class|object|interface|enum class)\s+(\w+)/gm,
  ],
  
  // C/C++
  '.c': [
    /^\w+\s+(\w+)\s*\([^;]*$/gm,  // Function definitions
    /^struct\s+(\w+)/gm,
    /^typedef\s+(?:struct\s+)?(?:\w+\s+)+(\w+)\s*;/gm,
  ],
  '.h': [],   // Uses .c patterns
  '.cpp': [], // Uses .c patterns
  '.hpp': [], // Uses .c patterns
  '.cc': [],  // Uses .c patterns
  '.cxx': [], // Uses .c patterns
  
  // C#
  '.cs': [
    /^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:partial\s+)?class\s+(\w+)/gm,
    /^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?\w+\s+(\w+)\s*\(/gm,
    /^(?:public|private|protected|internal)?\s*interface\s+(\w+)/gm,
    /^(?:public|private|protected|internal)?\s*enum\s+(\w+)/gm,
    /^(?:public|private|protected|internal)?\s*struct\s+(\w+)/gm,
  ],
  
  // Ruby
  '.rb': [
    /^def\s+(\w+)/gm,
    /^class\s+(\w+)/gm,
    /^module\s+(\w+)/gm,
  ],
  
  // PHP
  '.php': [
    /^(?:public|private|protected)?\s*(?:static\s+)?function\s+(\w+)/gm,
    /^class\s+(\w+)/gm,
    /^interface\s+(\w+)/gm,
    /^trait\s+(\w+)/gm,
  ],
};

// Fill in aliases
SYMBOL_PATTERNS['.tsx'] = SYMBOL_PATTERNS['.ts'];
SYMBOL_PATTERNS['.js'] = SYMBOL_PATTERNS['.ts'];
SYMBOL_PATTERNS['.jsx'] = SYMBOL_PATTERNS['.ts'];
SYMBOL_PATTERNS['.mjs'] = SYMBOL_PATTERNS['.ts'];
SYMBOL_PATTERNS['.cjs'] = SYMBOL_PATTERNS['.ts'];
SYMBOL_PATTERNS['.h'] = SYMBOL_PATTERNS['.c'];
SYMBOL_PATTERNS['.cpp'] = SYMBOL_PATTERNS['.c'];
SYMBOL_PATTERNS['.hpp'] = SYMBOL_PATTERNS['.c'];
SYMBOL_PATTERNS['.cc'] = SYMBOL_PATTERNS['.c'];
SYMBOL_PATTERNS['.cxx'] = SYMBOL_PATTERNS['.c'];

export const tool: RegisteredTool = {
  name: 'search_symbols',
  description:
    'Search for symbol definitions (functions, classes, interfaces, types, etc.) in the codebase. ' +
    'Faster than grep for finding where something is defined.',
  category: 'search',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Symbol name or pattern to search for (case-insensitive substring match).',
      },
      fileGlob: {
        type: 'string',
        description: 'Optional glob pattern to filter files (e.g., "*.ts", "src/**/*.py").',
      },
      maxResults: {
        type: 'integer',
        description: 'Maximum number of results to return. Default is 50.',
      },
    },
    required: ['query'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const query = String(args.query ?? '').toLowerCase();
    const fileGlob = args.fileGlob ? String(args.fileGlob) : undefined;
    const maxResults = Math.min(Number(args.maxResults) || 50, 200);

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!query) {
      return { success: false, error: 'Query is required.' };
    }

    const globRegex = fileGlob ? globToRegex(fileGlob) : null;
    const matches: Array<{
      file: string;
      line: number;
      symbol: string;
      kind: string;
      preview: string;
    }> = [];

    async function walk(dir: string): Promise<void> {
      if (matches.length >= maxResults) return;

      let entries: Dirent[];
      try {
        entries = (await fs.readdir(dir, { withFileTypes: true })) as Dirent[];
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= maxResults) return;

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          await walk(path.join(dir, entry.name));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!CODE_EXTENSIONS.has(ext)) continue;

          const abs = path.join(dir, entry.name);
          const rel = path.relative(ctx.projectRoot!, abs).replace(/\\/g, '/');

          if (globRegex && !globRegex.test(rel) && !globRegex.test(entry.name)) continue;

          const patterns = SYMBOL_PATTERNS[ext];
          if (!patterns || patterns.length === 0) continue;

          try {
            const content = await fs.readFile(abs, 'utf8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
              const line = lines[i];

              for (const pattern of patterns) {
                pattern.lastIndex = 0;
                const match = pattern.exec(line);
                if (match && match[1]) {
                  const symbolName = match[1];
                  if (symbolName.toLowerCase().includes(query)) {
                    matches.push({
                      file: rel,
                      line: i + 1,
                      symbol: symbolName,
                      kind: inferKind(line),
                      preview: line.trim().slice(0, 100),
                    });
                    break; // Only one match per line
                  }
                }
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }

    await walk(ctx.projectRoot);

    return {
      success: true,
      result: {
        query,
        symbols: matches,
        count: matches.length,
        truncated: matches.length >= maxResults,
      },
    };
  },
};

function inferKind(line: string): string {
  const l = line.toLowerCase();
  if (l.includes('class ')) return 'class';
  if (l.includes('interface ')) return 'interface';
  if (l.includes('function ') || l.includes('def ') || l.includes('fn ') || l.includes('func ')) return 'function';
  if (l.includes('type ')) return 'type';
  if (l.includes('enum ')) return 'enum';
  if (l.includes('struct ')) return 'struct';
  if (l.includes('trait ')) return 'trait';
  if (l.includes('const ')) return 'const';
  if (l.includes('var ') || l.includes('let ')) return 'variable';
  return 'symbol';
}

function globToRegex(glob: string): RegExp {
  let pattern = glob;
  if (pattern.startsWith('**/')) {
    pattern = pattern.slice(3);
  } else if (!pattern.startsWith('/')) {
    pattern = '**/' + pattern;
  }

  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/{{GLOBSTAR}}/g, '.*');

  return new RegExp(escaped.startsWith('.*') ? escaped : `(?:^|/)${escaped}$`);
}

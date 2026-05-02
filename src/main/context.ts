import { dialog, type BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * "Context adder" helpers: fetching URLs, picking images, and picking text
 * files via native dialogs. These all run in the main process so the renderer
 * never needs direct network / filesystem access, and so CSP doesn't have to
 * allow arbitrary origins.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_URL_BYTES = 2 * 1024 * 1024; // raw HTML cap
const MAX_URL_TEXT_CHARS = 40_000; // extracted text cap

const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
];

const TEXT_FILTERS = [
  {
    name: 'Text / code',
    extensions: [
      'txt', 'md', 'markdown', 'mdx', 'log', 'csv', 'tsv',
      'json', 'yml', 'yaml', 'toml', 'ini', 'env',
      'ts', 'tsx', 'js', 'jsx', 'cjs', 'mjs',
      'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
      'c', 'h', 'cpp', 'hpp', 'cs', 'php',
      'sh', 'bash', 'zsh', 'ps1', 'bat',
      'html', 'htm', 'css', 'scss', 'less',
      'xml', 'svg', 'sql', 'graphql', 'gql',
    ],
  },
  { name: 'All files', extensions: ['*'] },
];

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

export async function pickImage(
  win?: BrowserWindow | null,
): Promise<{ filename: string; dataUrl: string; sizeBytes: number } | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Attach Image',
    properties: ['openFile'],
    filters: IMAGE_FILTERS,
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  const abs = result.filePaths[0];
  const stat = await fs.stat(abs);
  if (stat.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image is too large (${Math.round(stat.size / 1024 / 1024)} MB). Max is ${
        MAX_IMAGE_BYTES / 1024 / 1024
      } MB.`,
    );
  }
  const buf = await fs.readFile(abs);
  const mime = mimeFromExt(path.extname(abs));
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  return { filename: path.basename(abs), dataUrl, sizeBytes: stat.size };
}

export async function pickTextFile(
  win?: BrowserWindow | null,
): Promise<{
  filename: string;
  content: string;
  language: string;
  sizeBytes: number;
} | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Attach File',
    properties: ['openFile'],
    filters: TEXT_FILTERS,
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  const abs = result.filePaths[0];
  const stat = await fs.stat(abs);
  if (stat.size > MAX_TEXT_BYTES) {
    throw new Error(
      `File is too large (${Math.round(stat.size / 1024)} KB). Max is ${
        MAX_TEXT_BYTES / 1024
      } KB.`,
    );
  }
  const content = await fs.readFile(abs, 'utf8');
  return {
    filename: path.basename(abs),
    content,
    language: langFromExt(path.extname(abs)),
    sizeBytes: stat.size,
  };
}

function langFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.cs': 'csharp',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.json': 'json',
    '.md': 'markdown',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sql': 'sql',
    '.sh': 'shell',
    '.bash': 'shell',
    '.ps1': 'powershell',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.xml': 'xml',
  };
  return map[ext.toLowerCase()] ?? 'plaintext';
}

export async function fetchUrl(raw: string): Promise<{
  ok: boolean;
  url?: string;
  title?: string;
  text?: string;
  sizeBytes?: number;
  error?: string;
}> {
  let url = raw.trim();
  if (!url) return { ok: false, error: 'Empty URL.' };
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctl.signal,
      headers: {
        'User-Agent':
          'RouterStudio/0.1 (+https://router-studio.local) Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
      },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} fetching ${url}` };
    }
    const ctype = (res.headers.get('content-type') ?? '').toLowerCase();
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: 'Empty response body.' };

    // Cap raw bytes we read to avoid DoS-ing ourselves on a huge page.
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let body = '';
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        body += decoder.decode(value, { stream: true });
        if (total > MAX_URL_BYTES) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          break;
        }
      }
    }

    let title: string | undefined;
    let text: string;
    if (ctype.includes('text/html') || /<html[\s>]/i.test(body)) {
      title = extractTitle(body);
      text = htmlToText(body);
    } else {
      text = body;
    }

    if (text.length > MAX_URL_TEXT_CHARS) {
      text =
        text.slice(0, MAX_URL_TEXT_CHARS) +
        `\n\n… [truncated from ${text.length} chars]`;
    }

    return {
      ok: true,
      url: res.url || url,
      title,
      text,
      sizeBytes: total,
    };
  } catch (e) {
    const err = e as Error & { name?: string };
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Timed out after 15s.' };
    }
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  return decodeEntities(m[1]).replace(/\s+/g, ' ').trim() || undefined;
}

/**
 * Very lightweight HTML → plain text converter. No DOM parsing — intentionally
 * cheap. Sufficient for feeding AI models with the gist of a page.
 */
function htmlToText(html: string): string {
  let s = html;
  // Strip inert blocks entirely.
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  s = s.replace(/<head[\s\S]*?<\/head>/gi, '');
  // Block boundaries → newlines.
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  s = s.replace(
    /<\/(p|div|section|article|header|footer|nav|aside|main|li|ul|ol|tr|td|th|h[1-6]|pre|blockquote)>/gi,
    '\n',
  );
  // Strip remaining tags.
  s = s.replace(/<[^>]+>/g, '');
  // Decode entities.
  s = decodeEntities(s);
  // Normalise whitespace.
  s = s.replace(/[ \t\r\f\v]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s
    .split('\n')
    .map((l) => l.replace(/^\s+|\s+$/g, ''))
    .filter((l) => l.length > 0)
    .join('\n');
  return s.trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)));
}

function safeCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

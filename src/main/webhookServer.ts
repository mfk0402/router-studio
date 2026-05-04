import http from 'node:http';
import type { BrowserWindow } from 'electron';

let server: http.Server | null = null;

/** Headers that are stripped before forwarding webhook payloads to the renderer. */
const STRIPPED_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
  'www-authenticate',
  'proxy-authenticate',
]);

function stripHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (STRIPPED_HEADERS.has(key.toLowerCase())) continue;
    // Only forward string values; skip multi-value arrays for simplicity.
    if (typeof value === 'string') {
      safe[key] = value;
    } else if (Array.isArray(value)) {
      safe[key] = value.join(', ');
    }
  }
  return safe;
}

export function restartWebhookServer(
  win: BrowserWindow | null,
  enabled: boolean,
  port: number,
): void {
  stopWebhookServer();
  if (!enabled || !win || port < 1 || port > 65535) return;

  const s = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (req.method === 'POST' && (url === '/hook' || url.startsWith('/hook?'))) {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        try {
          win.webContents.send('webhook:incoming', {
            path: url,
            method: req.method,
            body: body.slice(0, 50_000),
            headers: stripHeaders(req.headers),
            receivedAt: Date.now(),
          });
        } catch {
          /* window may be closing */
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      });
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  s.on('error', (err) => {
    console.error('[webhook]', err);
  });

  try {
    s.listen(port, '127.0.0.1', () => {
      console.info(`[webhook] listening on http://127.0.0.1:${port}/hook`);
    });
    server = s;
  } catch (e) {
    console.error('[webhook] listen failed', e);
  }
}

export function stopWebhookServer(): void {
  if (server) {
    try {
      server.close();
    } catch {
      /* ignore */
    }
    server = null;
  }
}
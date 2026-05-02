import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'fetch_json',
  description:
    'Fetch JSON from a URL (REST API endpoint). ' +
    'Returns parsed JSON data. Use for API calls and structured data.',
  category: 'network',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch.',
      },
      method: {
        type: 'string',
        description: 'HTTP method: GET, POST, PUT, DELETE, PATCH. Default is GET.',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      headers: {
        type: 'object',
        description: 'Additional headers to send.',
      },
      body: {
        type: 'object',
        description: 'Request body for POST/PUT/PATCH (will be JSON-encoded).',
      },
    },
    required: ['url'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const url = String(args.url ?? '');
    const method = String(args.method ?? 'GET').toUpperCase();
    const customHeaders = (args.headers as Record<string, string>) ?? {};
    const body = args.body;

    if (!url) {
      return { success: false, error: 'URL is required.' };
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return { success: false, error: 'Invalid URL format.' };
    }

    // Block localhost and private IPs
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.')
    ) {
      return { success: false, error: 'Cannot fetch from localhost or private networks.' };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const headers: Record<string, string> = {
        'User-Agent': 'Router-Studio/1.0 (AI Workspace)',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...customHeaders,
      };

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = JSON.stringify(body);
      }

      const res = await fetch(url, fetchOptions);
      clearTimeout(timeout);

      const responseText = await res.text();
      let data: unknown;

      try {
        data = JSON.parse(responseText);
      } catch {
        // Not JSON, return as text
        return {
          success: !res.ok ? false : true,
          result: {
            url,
            status: res.status,
            contentType: res.headers.get('content-type') ?? 'unknown',
            isJson: false,
            text: responseText.slice(0, 50000),
          },
          error: !res.ok ? `HTTP ${res.status}` : undefined,
        };
      }

      return {
        success: res.ok,
        result: {
          url,
          status: res.status,
          isJson: true,
          data,
        },
        error: !res.ok ? `HTTP ${res.status}` : undefined,
      };
    } catch (e) {
      const error = e as Error;
      if (error.name === 'AbortError') {
        return { success: false, error: 'Request timed out.' };
      }
      return { success: false, error: `Fetch failed: ${error.message}` };
    }
  },
};

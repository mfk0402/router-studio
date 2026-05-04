import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'fetch_url',
  description:
    'Fetch content from a URL and return the HTML/text content. ' +
    'Useful for reading documentation, web pages, or API endpoints. ' +
    'For structured JSON responses, use fetch_json instead.',
  category: 'network',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch.',
      },
      extractText: {
        type: 'boolean',
        description: 'If true, attempt to extract readable text from HTML. Default is true.',
      },
      maxLength: {
        type: 'integer',
        description: 'Maximum content length in characters. Default is 50000.',
      },
    },
    required: ['url'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const url = String(args.url ?? '');
    const extractText = args.extractText !== false;
    const maxLength = Math.min(Number(args.maxLength) || 50000, 100000);

    if (!url) {
      return { success: false, error: 'URL is required.' };
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return { success: false, error: 'Invalid URL format.' };
    }

    // Block localhost and private IPs for security
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

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Router-Studio/1.0 (AI Workspace)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        return {
          success: false,
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const contentType = res.headers.get('content-type') ?? '';
      let content = await res.text();

      // Truncate if too long
      if (content.length > maxLength) {
        content = content.slice(0, maxLength);
      }

      // Extract text from HTML if requested
      if (extractText && contentType.includes('text/html')) {
        content = extractTextFromHtml(content);
      }

      return {
        success: true,
        result: {
          url,
          contentType,
          length: content.length,
          truncated: content.length >= maxLength,
          content,
        },
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

export function extractTextFromHtml(html: string): string {
  // Remove script, style, and other non-content tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Replace common block elements with newlines
  text = text
    .replace(/<\/?(p|div|br|hr|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, '\n\n');

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");

  // Clean up whitespace
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  // Collapse multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

import type { Browser, BrowserContext, Page } from 'playwright';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
const consoleBuf: string[] = [];

async function ensurePage(): Promise<Page> {
  const { chromium } = await import('playwright');
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  if (!context) {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
  }
  if (!page) {
    page = await context.newPage();
    page.on('console', (msg) => {
      consoleBuf.push(`[${msg.type()}] ${msg.text()}`);
      while (consoleBuf.length > 150) consoleBuf.shift();
    });
  }
  return page;
}

export const browserOpenTool: RegisteredTool = {
  name: 'browser_open',
  description:
    'Open a URL in the embedded Playwright Chromium session (agent browser). ' +
    'Use for local dev servers or public pages during visual verification.',
  category: 'network',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'http(s) URL to navigate to.' },
      wait_until: {
        type: 'string',
        description: 'Playwright waitUntil: load | domcontentloaded | networkidle (default load).',
      },
    },
    required: ['url'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const url = String(args.url ?? '').trim();
    const waitUntil = (String(args.wait_until ?? 'load') || 'load') as 'load' | 'domcontentloaded' | 'networkidle';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: 'url must start with http:// or https://' };
    }
    try {
      const p = await ensurePage();
      await p.goto(url, { waitUntil });
      return {
        success: true,
        result: { url, title: await p.title(), wait_until: waitUntil },
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const browserScreenshotTool: RegisteredTool = {
  name: 'browser_screenshot',
  description: 'Capture a PNG screenshot of the current Playwright page as base64.',
  category: 'network',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      full_page: { type: 'boolean', description: 'Capture full scrollable page (default false).' },
    },
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    try {
      const p = await ensurePage();
      const buf = await p.screenshot({ type: 'png', fullPage: Boolean(args.full_page) });
      const base64 = Buffer.from(buf).toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;
      return {
        success: true,
        result: {
          format: 'png',
          data_url: dataUrl,
          bytes: buf.length,
        },
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const browserClickTool: RegisteredTool = {
  name: 'browser_click',
  description: 'Click an element matched by a CSS selector on the Playwright page.',
  category: 'network',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector unique enough to click safely.' },
    },
    required: ['selector'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const selector = String(args.selector ?? '').trim();
    if (!selector) return { success: false, error: 'selector is required.' };
    try {
      const p = await ensurePage();
      await p.click(selector, { timeout: 15000 });
      return { success: true, result: { clicked: selector } };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const browserTypeTool: RegisteredTool = {
  name: 'browser_type',
  description: 'Type text into an element matched by a CSS selector.',
  category: 'network',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      text: { type: 'string' },
      submit: { type: 'boolean', description: 'Press Enter after typing (default false).' },
    },
    required: ['selector', 'text'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const selector = String(args.selector ?? '');
    const text = String(args.text ?? '');
    const submit = Boolean(args.submit);
    try {
      const p = await ensurePage();
      await p.fill(selector, text);
      if (submit) await p.press(selector, 'Enter');
      return { success: true, result: { selector, chars: text.length, submit } };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const browserConsoleLogsTool: RegisteredTool = {
  name: 'browser_console_logs',
  description: 'Return recent browser console lines captured from the Playwright page.',
  category: 'network',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      clear: { type: 'boolean', description: 'Clear buffer after read (default false).' },
    },
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const clear = Boolean(args.clear);
    const lines = [...consoleBuf];
    if (clear) consoleBuf.length = 0;
    return { success: true, result: { lines, count: lines.length } };
  },
};

export const browserEvalTool: RegisteredTool = {
  name: 'browser_eval',
  description:
    'Evaluate JavaScript in the page context (dangerous — sandbox disables this). Returns JSON-serializable values only.',
  category: 'network',
  riskLevel: 'high',
  schema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Single JS expression to evaluate.' },
    },
    required: ['expression'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const expression = String(args.expression ?? '');
    if (!expression.trim()) return { success: false, error: 'expression is required.' };
    try {
      const p = await ensurePage();
      const value = await p.evaluate((expr: string) => {
        return (0, eval)(expr);
      }, expression);
      return { success: true, result: { value } };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const browserWaitForTextTool: RegisteredTool = {
  name: 'browser_wait_for_text',
  description: 'Wait until visible page text includes the given substring (timeout 30s).',
  category: 'network',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      timeout_ms: { type: 'integer' },
    },
    required: ['text'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const text = String(args.text ?? '');
    const timeout = Math.min(Number(args.timeout_ms) || 30000, 120000);
    if (!text) return { success: false, error: 'text is required.' };
    try {
      const p = await ensurePage();
      await p.waitForFunction(
        (needle: string) => document.body?.innerText?.includes(needle) ?? false,
        text,
        { timeout },
      );
      return { success: true, result: { found: text } };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const browserGetDomTool: RegisteredTool = {
  name: 'browser_get_dom',
  description: 'Return truncated inner HTML of document.body for inspection (capped ~200KB).',
  category: 'network',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {},
  },
  handler: async (): Promise<ToolHandlerResult> => {
    try {
      const p = await ensurePage();
      const html = await p.evaluate(() => document.body?.innerHTML ?? '');
      const max = 200_000;
      const truncated = html.length > max;
      return {
        success: true,
        result: {
          html: truncated ? html.slice(0, max) : html,
          truncated,
          length: html.length,
        },
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

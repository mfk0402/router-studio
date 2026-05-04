import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { extractTextFromHtml } from './fetchUrl.js';

const UA = 'Router-Studio/1.0 (AI Workspace; doc lookup)';
const FETCH_MS = 22_000;

function isSafeNpmPackageName(name: string): boolean {
  const n = name.trim();
  if (n.length === 0 || n.length > 214) return false;
  if (n.includes('..') || /%2f|%5c/i.test(n)) return false;
  if (n.startsWith('@')) {
    const i = n.indexOf('/');
    if (i <= 1 || i === n.length - 1) return false;
    const scope = n.slice(1, i);
    const pkg = n.slice(i + 1);
    if (!scope || !pkg || scope.includes('/') || pkg.includes('/')) return false;
    return /^[a-z0-9-~][a-z0-9-._~]*$/i.test(scope) && /^[a-zA-Z0-9@._~-]+$/.test(pkg);
  }
  if (n.includes('/')) return false;
  return /^[a-zA-Z0-9@._~-]+$/.test(n);
}

function isSafePypiName(name: string): boolean {
  const n = name.trim();
  return n.length > 0 && n.length <= 100 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/i.test(n);
}

/** Doc path under https://developer.mozilla.org/en-US/docs/ */
function isSafeMdnSlug(slug: string): boolean {
  const s = slug.trim().replace(/^\/+/, '');
  if (s.length === 0 || s.length > 280) return false;
  if (s.includes('..')) return false;
  return /^[A-Za-z0-9_\-./]+$/.test(s);
}

export const lookupNpmPackageTool: RegisteredTool = {
  name: 'lookup_npm_package',
  description:
    'Fetch metadata for an npm package from the public registry (latest version). ' +
    'Use for dependency checks, peer deps, and README excerpts without guessing URLs.',
  category: 'network',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      package: {
        type: 'string',
        description: 'npm package name, e.g. "react" or "@types/node".',
      },
      readme_max_chars: {
        type: 'integer',
        description: 'Max README characters to include (default 6000, max 20000).',
      },
    },
    required: ['package'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const pkg = String(args.package ?? '').trim();
    const readmeCap = Math.min(Math.max(Number(args.readme_max_chars) || 6000, 0), 20000);
    if (!isSafeNpmPackageName(pkg)) {
      return { success: false, error: 'Invalid or unsupported npm package name.' };
    }
    const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_MS);
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': UA,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      if (!res.ok) {
        return {
          success: false,
          error: `npm registry HTTP ${res.status}: ${text.slice(0, 200)}`,
        };
      }
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { success: false, error: 'npm registry returned non-JSON.' };
      }
      const readmeRaw = data.readme;
      let readme: string | undefined;
      if (typeof readmeRaw === 'string' && readmeRaw.length > 0 && readmeCap > 0) {
        readme =
          readmeRaw.length > readmeCap
            ? `${readmeRaw.slice(0, readmeCap)}\n\n… (truncated)`
            : readmeRaw;
      }
      const deps = data.dependencies;
      const peer = data.peerDependencies;
      const optionalPeer = data.peerDependenciesMeta;
      return {
        success: true,
        result: {
          source: 'registry.npmjs.org',
          name: data.name,
          version: data.version,
          description: data.description,
          license: data.license,
          homepage: data.homepage,
          repository: data.repository,
          keywords: data.keywords,
          dependencies:
            deps && typeof deps === 'object'
              ? Object.keys(deps as Record<string, string>).slice(0, 80)
              : undefined,
          peer_dependencies:
            peer && typeof peer === 'object'
              ? Object.keys(peer as Record<string, string>).slice(0, 40)
              : undefined,
          peer_dependencies_meta:
            optionalPeer && typeof optionalPeer === 'object'
              ? Object.keys(optionalPeer as Record<string, unknown>).slice(0, 40)
              : undefined,
          readme,
        },
      };
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError') {
        return { success: false, error: 'npm registry request timed out.' };
      }
      return { success: false, error: err.message || 'npm lookup failed.' };
    }
  },
};

export const lookupPypiPackageTool: RegisteredTool = {
  name: 'lookup_pypi_package',
  description:
    'Fetch metadata for a PyPI project (latest release JSON). ' +
    'Use for Python dependency/version checks and project links.',
  category: 'network',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      package: {
        type: 'string',
        description: 'PyPI distribution name, e.g. "requests".',
      },
      description_max_chars: {
        type: 'integer',
        description: 'Max length for long_description (default 8000, max 24000).',
      },
    },
    required: ['package'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const pkg = String(args.package ?? '').trim().toLowerCase();
    const descCap = Math.min(Math.max(Number(args.description_max_chars) || 8000, 0), 24000);
    if (!isSafePypiName(pkg)) {
      return { success: false, error: 'Invalid PyPI package name.' };
    }
    const url = `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_MS);
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': UA,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      if (!res.ok) {
        return {
          success: false,
          error: `PyPI HTTP ${res.status}: ${text.slice(0, 200)}`,
        };
      }
      const json = JSON.parse(text) as {
        info?: Record<string, unknown>;
      };
      const info = json.info;
      if (!info || typeof info !== 'object') {
        return { success: false, error: 'PyPI returned unexpected JSON.' };
      }
      const longDesc = info.description;
      let description: string | undefined;
      if (typeof longDesc === 'string' && longDesc.length > 0 && descCap > 0) {
        description =
          longDesc.length > descCap ? `${longDesc.slice(0, descCap)}\n\n… (truncated)` : longDesc;
      }
      const reqs = info.requires_dist;
      return {
        success: true,
        result: {
          source: 'pypi.org',
          name: info.name,
          version: info.version,
          summary: info.summary,
          home_page: info.home_page,
          project_urls: info.project_urls,
          license: info.license,
          requires_python: info.requires_python,
          requires_dist: Array.isArray(reqs) ? reqs.slice(0, 60) : reqs,
          description,
        },
      };
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError') {
        return { success: false, error: 'PyPI request timed out.' };
      }
      return { success: false, error: err.message || 'PyPI lookup failed.' };
    }
  },
};

export const lookupMdnDocTool: RegisteredTool = {
  name: 'lookup_mdn_doc',
  description:
    'Fetch readable text from a Mozilla Developer Network documentation page (developer.mozilla.org). ' +
    'Pass the docs path after /docs/, e.g. "Web/JavaScript/Reference/Global_Objects/Promise".',
  category: 'network',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description:
          'Path under MDN /docs/ (no leading slash), e.g. Web/API/Fetch_API or Web/CSS/display.',
      },
      max_chars: {
        type: 'integer',
        description: 'Maximum extracted text length (default 45000, max 90000).',
      },
    },
    required: ['slug'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const slug = String(args.slug ?? '');
    const maxChars = Math.min(Math.max(Number(args.max_chars) || 45000, 4000), 90000);
    if (!isSafeMdnSlug(slug)) {
      return {
        success: false,
        error:
          'Invalid MDN slug. Use letters, numbers, slashes, dots, underscores, hyphens only (no "..").',
      };
    }
    const trimmed = slug.trim().replace(/^\/+/, '');
    const url = `https://developer.mozilla.org/en-US/docs/${trimmed}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_MS);
      const res = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'User-Agent': UA,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        return { success: false, error: `MDN HTTP ${res.status} for ${url}` };
      }
      const html = await res.text();
      let content = extractTextFromHtml(html);
      const truncated = content.length > maxChars;
      if (truncated) {
        content = `${content.slice(0, maxChars)}\n\n… (truncated)`;
      }
      return {
        success: true,
        result: {
          source: 'developer.mozilla.org',
          url,
          length: content.length,
          truncated,
          content,
        },
      };
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError') {
        return { success: false, error: 'MDN request timed out.' };
      }
      return { success: false, error: err.message || 'MDN lookup failed.' };
    }
  },
};

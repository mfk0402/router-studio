import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolContext, ToolHandlerResult } from '../../../shared/types.js';
import { getSettings, setSettings } from '../../secureStore.js';
import * as tasksApi from '../../tasks.js';
import { outlineHeuristic } from '../../treeOutlineHeuristic.js';
import { checkpointsUserDataDir } from '../../checkpointsApi.js';

function checkpointsDir(): string {
  return checkpointsUserDataDir();
}

function runProg(
  cmd: string,
  args: string[],
  cwd: string | undefined,
  timeoutMs: number,
): Promise<{ out: string; err: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let out = '';
    let err = '';
    const t = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (c: string) => {
      out += c;
    });
    p.stderr.on('data', (c: string) => {
      err += c;
    });
    p.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(t);
      resolve({ out, err, code });
    });
  });
}

function npmCmd(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export const dockerPsTool: RegisteredTool = {
  name: 'docker_ps',
  description:
    'Run `docker ps` in the project environment and return stdout ' +
    '(requires Docker CLI on PATH).',
  category: 'integration',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      all: { type: 'boolean', description: 'If true, adds -a (all containers).' },
    },
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }
    const all = Boolean(args.all);
    const docker = 'docker';
    const cliArgs = all ? ['ps', '-a'] : ['ps'];
    try {
      const { out, err, code } = await runProg(docker, cliArgs, ctx.projectRoot, 45_000);
      return {
        success: code === 0,
        result: { stdout: out.slice(0, 200_000), stderr: err.slice(0, 20_000), exitCode: code },
        error: code !== 0 ? err || out || `exit ${code}` : undefined,
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const sqliteQueryTool: RegisteredTool = {
  name: 'sqlite_query',
  description:
    'Execute a SQL statement against a SQLite database file using the `sqlite3` CLI. ' +
    'Set readonly:true (default) for SELECT-only exploration; mutating SQL requires explicit approval.',
  category: 'integration',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to .sqlite / .db file, relative to project root.',
      },
      sql: { type: 'string', description: 'Single SQL statement.' },
      readonly: {
        type: 'boolean',
        description: 'When true (default), reject non-SELECT statements.',
      },
    },
    required: ['path', 'sql'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }
    const rel = String(args.path ?? '');
    const sql = String(args.sql ?? '').trim();
    const readonly = args.readonly !== false;
    if (!rel || !sql) {
      return { success: false, error: 'path and sql are required.' };
    }
    const absDb = path.resolve(ctx.projectRoot, rel);
    if (!absDb.startsWith(ctx.projectRoot)) {
      return { success: false, error: 'Database path must stay inside the project.' };
    }
    if (readonly) {
      if (!/^\s*select\b/i.test(sql)) {
        return {
          success: false,
          error: 'readonly mode allows SELECT only. Pass readonly:false for writes (requires approval).',
        };
      }
    }
    const bin = 'sqlite3';
    try {
      const { out, err, code } = await runProg(bin, [absDb, sql], undefined, 60_000);
      return {
        success: code === 0,
        result: { stdout: out.slice(0, 500_000), stderr: err.slice(0, 10_000), exitCode: code },
        error: code !== 0 ? err || out || `exit ${code}` : undefined,
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const githubListIssuesTool: RegisteredTool = {
  name: 'github_list_issues',
  description:
    'List recent issues for a GitHub repository using the REST API (requires githubToken in Settings).',
  category: 'integration',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      state: {
        type: 'string',
        enum: ['open', 'closed', 'all'],
        description: 'Issue state filter.',
      },
      per_page: { type: 'integer', description: 'Max issues (1–30).' },
    },
    required: ['owner', 'repo'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const settings = await getSettings();
    const token = (settings.githubToken ?? '').trim();
    if (!token) {
      return { success: false, error: 'Set githubToken in Settings → Integrations first.' };
    }
    const owner = String(args.owner ?? '');
    const repo = String(args.repo ?? '');
    const state = (args.state as string) || 'open';
    const n = Math.min(30, Math.max(1, Number(args.per_page) || 10));
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=${encodeURIComponent(state)}&per_page=${n}`;
    try {
      const r = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'RouterStudio',
        },
      });
      const text = await r.text();
      if (!r.ok) {
        return { success: false, error: `GitHub ${r.status}: ${text.slice(0, 500)}` };
      }
      const data = JSON.parse(text) as unknown;
      return { success: true, result: data };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const linearListIssuesTool: RegisteredTool = {
  name: 'linear_list_issues',
  description:
    'Run a simple Linear GraphQL query for recently updated issues (requires linearApiKey in Settings).',
  category: 'integration',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      first: { type: 'integer', description: 'Number of issues (1–25).' },
    },
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const settings = await getSettings();
    const key = (settings.linearApiKey ?? '').trim();
    if (!key) {
      return { success: false, error: 'Set linearApiKey in Settings → Integrations first.' };
    }
    const first = Math.min(25, Math.max(1, Number(args.first) || 10));
    const query = `query Issues($n: Int!) { issues(first: $n) { nodes { identifier title url state { name } } } }`;
    try {
      const r = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: key,
        },
        body: JSON.stringify({ query, variables: { n: first } }),
      });
      const json = (await r.json()) as { data?: unknown; errors?: unknown };
      if (!r.ok) {
        return { success: false, error: `Linear HTTP ${r.status}` };
      }
      return { success: true, result: json };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const listMcpServersTool: RegisteredTool = {
  name: 'list_mcp_servers',
  description:
    'Return MCP-style server rows from Settings (registry only; processes are not spawned automatically).',
  category: 'integration',
  riskLevel: 'low',
  schema: { type: 'object', properties: {} },
  handler: async (): Promise<ToolHandlerResult> => {
    const s = await getSettings();
    return { success: true, result: { servers: s.mcpServers ?? [] } };
  },
};

export const listOpencodeCustomToolsTool: RegisteredTool = {
  name: 'list_opencode_custom_tools',
  description: 'List *.ts files under .opencode/tools relative to the project (custom tool stubs).',
  category: 'integration',
  riskLevel: 'low',
  schema: { type: 'object', properties: {} },
  handler: async (_args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }
    const dir = path.join(ctx.projectRoot, '.opencode', 'tools');
    try {
      const names = await fs.readdir(dir);
      const files = names.filter((f) => f.endsWith('.ts'));
      return { success: true, result: { directory: '.opencode/tools', files } };
    } catch {
      return { success: true, result: { directory: '.opencode/tools', files: [] as string[] } };
    }
  },
};

export const pluginRegistryStatusTool: RegisteredTool = {
  name: 'plugin_registry_status',
  description: 'Report plugin host status (typed plugin API is not loaded yet).',
  category: 'integration',
  riskLevel: 'low',
  schema: { type: 'object', properties: {} },
  handler: async (): Promise<ToolHandlerResult> => {
    return {
      success: true,
      result: {
        hostReady: false,
        loadedPlugins: [] as string[],
        message:
          'Plugin runtime is not enabled in this build. Use custom actions, slash commands, and MCP registry for extensions.',
      },
    };
  },
};

export const exportAgentTaskTool: RegisteredTool = {
  name: 'export_agent_task',
  description: 'Load a saved agent task JSON by id for export or replay.',
  category: 'integration',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: { task_id: { type: 'string', description: 'Saved task id (filename stem).' } },
    required: ['task_id'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const id = String(args.task_id ?? '');
    const task = await tasksApi.getTask(id);
    if (!task) {
      return { success: false, error: `Task not found: ${id}` };
    }
    return { success: true, result: task };
  },
};

export const workspaceSnapshotSaveTool: RegisteredTool = {
  name: 'workspace_snapshot_save',
  description:
    'Save contents of selected project files into a local checkpoint under userData (for rewind / replay workflows).',
  category: 'integration',
  riskLevel: 'high',
  schema: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Human-readable checkpoint label.' },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Relative file paths to snapshot.',
      },
    },
    required: ['label', 'paths'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }
    const label = String(args.label ?? '');
    const paths = Array.isArray(args.paths) ? args.paths.map(String) : [];
    if (!label || paths.length === 0) {
      return { success: false, error: 'label and non-empty paths[] are required.' };
    }
    const snapDir = checkpointsDir();
    await fs.mkdir(snapDir, { recursive: true });
    const id = randomUUID();
    const files: Array<{ path: string; content: string }> = [];
    for (const rel of paths) {
      const abs = path.resolve(ctx.projectRoot, rel);
      if (!abs.startsWith(ctx.projectRoot)) {
        return { success: false, error: `Path escapes project: ${rel}` };
      }
      try {
        const content = await fs.readFile(abs, 'utf8');
        files.push({ path: rel, content });
      } catch (e) {
        return { success: false, error: `Could not read ${rel}: ${(e as Error).message}` };
      }
    }
    const payload = {
      id,
      label,
      createdAt: Date.now(),
      projectRoot: ctx.projectRoot,
      files,
    };
    await fs.writeFile(path.join(snapDir, `${id}.json`), JSON.stringify(payload, null, 2), 'utf8');
    return { success: true, result: { checkpointId: id, fileCount: files.length } };
  },
};

export const listWorkspaceSnapshotsTool: RegisteredTool = {
  name: 'list_workspace_snapshots',
  description: 'List checkpoint ids saved by workspace_snapshot_save.',
  category: 'integration',
  riskLevel: 'low',
  schema: { type: 'object', properties: {} },
  handler: async (): Promise<ToolHandlerResult> => {
    const dir = checkpointsDir();
    try {
      const names = await fs.readdir(dir);
      const ids = names.filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, ''));
      return { success: true, result: { checkpointIds: ids } };
    } catch {
      return { success: true, result: { checkpointIds: [] as string[] } };
    }
  },
};

export const treesitterOutlineTool: RegisteredTool = {
  name: 'treesitter_outline',
  description:
    'Heuristic structural outline for a source file (regex-based). ' +
    'Full Tree-sitter WASM parsing may replace internals later.',
  category: 'integration',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to source file.' },
      language_id: {
        type: 'string',
        description: 'Monaco language id hint (e.g. typescript, python).',
      },
    },
    required: ['path'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }
    const rel = String(args.path ?? '');
    const lang = String(args.language_id ?? '');
    if (!rel) return { success: false, error: 'path is required.' };
    const abs = path.resolve(ctx.projectRoot, rel);
    if (!abs.startsWith(ctx.projectRoot)) {
      return { success: false, error: 'Path must be inside the project.' };
    }
    try {
      const source = await fs.readFile(abs, 'utf8');
      const symbols = outlineHeuristic(source, lang);
      return {
        success: true,
        result: { path: rel, language_id: lang || 'unknown', symbols, engine: 'regex-heuristic' },
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const lspWorkspaceStatusTool: RegisteredTool = {
  name: 'lsp_workspace_status',
  description: 'Return LSP bridge status (monaco-languageclient not wired in this build).',
  category: 'debug',
  riskLevel: 'low',
  schema: { type: 'object', properties: {} },
  handler: async (): Promise<ToolHandlerResult> => {
    return {
      success: true,
      result: {
        connected: false,
        servers: [] as string[],
        message:
          'Native LSP via monaco-languageclient is planned. Use Problems panel and heuristic outline tools meanwhile.',
      },
    };
  },
};

export const debugAdapterStatusTool: RegisteredTool = {
  name: 'debug_adapter_status',
  description: 'Return Debug Adapter Protocol host status (not enabled in this build).',
  category: 'debug',
  riskLevel: 'low',
  schema: { type: 'object', properties: {} },
  handler: async (): Promise<ToolHandlerResult> => {
    return {
      success: true,
      result: {
        dapEnabled: false,
        message:
          'DAP debugging (Node, Python) is not bundled yet. Use terminal + breakpoints in external IDEs if needed.',
      },
    };
  },
};

export const runNpmScriptTool: RegisteredTool = {
  name: 'run_npm_script',
  description:
    'Run a script from package.json via npm (npm run <name>) in the project root. Prefer read-only inspection scripts when possible.',
  category: 'integration',
  riskLevel: 'high',
  schema: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'Script name from package.json#scripts.' },
      extra_args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional arguments after --',
      },
    },
    required: ['script'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }
    const script = String(args.script ?? '');
    const extras = Array.isArray(args.extra_args) ? args.extra_args.map(String) : [];
    if (!script) return { success: false, error: 'script is required.' };
    const cmd = npmCmd();
    const rargs = ['run', script, '--', ...extras];
    try {
      const { out, err, code } = await runProg(cmd, rargs, ctx.projectRoot, 300_000);
      return {
        success: code === 0,
        result: { stdout: out.slice(0, 500_000), stderr: err.slice(0, 50_000), exitCode: code },
        error: code !== 0 ? err || out || `exit ${code}` : undefined,
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const listScheduledTasksTool: RegisteredTool = {
  name: 'list_scheduled_tasks',
  description: 'List interval reminders configured in Settings (main process fires every minute).',
  category: 'integration',
  riskLevel: 'low',
  schema: { type: 'object', properties: {} },
  handler: async (): Promise<ToolHandlerResult> => {
    const s = await getSettings();
    return { success: true, result: { tasks: s.scheduledTasks ?? [] } };
  },
};

export const saveUserSnippetTool: RegisteredTool = {
  name: 'save_user_snippet',
  description:
    'Append a user-defined Monaco snippet (prefix + body) to Settings. Ask the user before saving ambiguous snippets.',
  category: 'editor',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      prefix: { type: 'string' },
      body: { type: 'string', description: 'Monaco snippet body (use $1, $0 tab stops).' },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Monaco language ids; omit for all.',
      },
    },
    required: ['name', 'prefix', 'body'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const name = String(args.name ?? '');
    const prefix = String(args.prefix ?? '');
    const body = String(args.body ?? '');
    const languages = Array.isArray(args.languages) ? args.languages.map(String) : undefined;
    if (!name || !prefix || !body) {
      return { success: false, error: 'name, prefix, and body are required.' };
    }
    const s = await getSettings();
    const id = randomUUID();
    const nextSnippets = [
      ...(s.userSnippets ?? []),
      { id, name, prefix, body, languages: languages?.length ? languages : undefined },
    ];
    await setSettings({ userSnippets: nextSnippets });
    return { success: true, result: { id, saved: true } };
  },
};

export const addTaskTemplateTool: RegisteredTool = {
  name: 'add_task_template',
  description: 'Add a reusable task template (title + prompt) shown in the AI panel.',
  category: 'integration',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      prompt: { type: 'string' },
    },
    required: ['title', 'prompt'],
  },
  handler: async (args): Promise<ToolHandlerResult> => {
    const title = String(args.title ?? '');
    const prompt = String(args.prompt ?? '');
    if (!title || !prompt) {
      return { success: false, error: 'title and prompt are required.' };
    }
    const s = await getSettings();
    const id = randomUUID();
    const next = [...(s.taskTemplates ?? []), { id, title, prompt }];
    await setSettings({ taskTemplates: next });
    return { success: true, result: { id } };
  },
};

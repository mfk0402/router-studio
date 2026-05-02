/**
 * Tool Registry — central hub for all agent tools.
 *
 * Each tool is a module that exports:
 * - name: string
 * - description: string
 * - category: ToolCategory
 * - riskLevel: 'low' | 'medium' | 'high'
 * - schema: JSON Schema for parameters
 * - handler: async function that executes the tool
 */

import type { BrowserWindow } from 'electron';
import type {
  ToolDefinition,
  ToolPolicy,
  ToolContext,
  ToolHandlerResult,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolExecutionEvent,
  RegisteredTool,
} from '../../shared/types.js';
import { getSettings, setSettings } from '../secureStore.js';
import { getRoot } from '../fileSystem.js';
import { randomUUID } from 'node:crypto';
import { redactSecrets } from '../../shared/redactSecrets.js';
import * as toolAudit from '../toolAudit.js';
import { recordToolRun } from '../localStats.js';

/** Tools fully disabled in sandbox (never exposed when sandbox is on). */
const SANDBOX_BLOCKED_TOOLS = new Set<string>([
  'write_file',
  'edit_file',
  'create_file',
  'delete_file',
  'run_shell',
  'git_add',
  'git_commit',
  'run_tests',
  'memory_set',
  'memory_forget',
]);

function blockedBySandbox(toolName: string, args: Record<string, unknown>): boolean {
  if (SANDBOX_BLOCKED_TOOLS.has(toolName)) return true;
  if (toolName === 'git_branch') {
    const action = String(args.action ?? '');
    return action !== '' && action !== 'list';
  }
  return false;
}

function shouldDryRunSimulate(toolName: string, args: Record<string, unknown>): boolean {
  if (!SANDBOX_BLOCKED_TOOLS.has(toolName)) {
    if (toolName === 'git_branch') {
      const action = String(args.action ?? '');
      return action !== '' && action !== 'list';
    }
    return false;
  }
  return true;
}

function buildDryRunSummary(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const base = { dry_run: true as const, tool: toolName };
  switch (toolName) {
    case 'write_file':
      return {
        ...base,
        action: 'would_write_file',
        path: args.path,
        content_chars: String(args.content ?? '').length,
      };
    case 'edit_file':
      return {
        ...base,
        action: 'would_apply_edit',
        path: args.path,
      };
    case 'create_file':
      return {
        ...base,
        action: 'would_create_file',
        path: args.path,
      };
    case 'delete_file':
      return {
        ...base,
        action: 'would_delete_file',
        path: args.path,
      };
    case 'run_shell':
      return {
        ...base,
        action: 'would_run_shell',
        command: args.command,
      };
    case 'git_add':
      return {
        ...base,
        action: 'would_git_add',
        paths: args.paths,
        all: args.all,
      };
    case 'git_commit':
      return {
        ...base,
        action: 'would_git_commit',
        message: args.message,
      };
    case 'git_branch':
      return {
        ...base,
        action: 'would_git_branch',
        branch_action: args.action,
        name: args.name,
      };
    case 'run_tests':
      return {
        ...base,
        action: 'would_run_tests',
        framework: args.framework,
      };
    case 'memory_set':
      return {
        ...base,
        action: 'would_memory_set',
        key: args.key,
      };
    case 'memory_forget':
      return {
        ...base,
        action: 'would_memory_forget',
        key: args.key,
      };
    default:
      return { ...base, action: 'would_execute', args };
  }
}

// Import tool modules
import * as readFileTool from './fs/readFile.js';
import * as writeFileTool from './fs/writeFile.js';
import * as editFileTool from './fs/editFile.js';
import * as createFileTool from './fs/createFile.js';
import * as deleteFileTool from './fs/deleteFile.js';
import * as listDirTool from './fs/listDir.js';
import * as statFileTool from './fs/statFile.js';
import * as grepTool from './search/grep.js';
import * as findFilesTool from './search/findFiles.js';
import * as searchSymbolsTool from './search/searchSymbols.js';
import * as runShellTool from './shell/runShell.js';
import * as openFileTool from './editor/openFile.js';
import * as getOpenTabsTool from './editor/getOpenTabs.js';
import * as getSelectionTool from './editor/getSelection.js';
import * as gitStatusTool from './git/gitStatus.js';
import * as gitDiffTool from './git/gitDiff.js';
import * as gitLogTool from './git/gitLog.js';
import * as gitCommitTool from './git/gitCommit.js';
import * as gitBranchTool from './git/gitBranch.js';
import * as gitAddTool from './git/gitAdd.js';
import * as fetchUrlTool from './network/fetchUrl.js';
import * as fetchJsonTool from './network/fetchJson.js';
import * as runTestsTool from './diagnostic/runTests.js';
import * as memoryTools from './memory/memoryTools.js';

const registry = new Map<string, RegisteredTool>();

// Pending approval requests
const pendingApprovals = new Map<string, {
  resolve: (approved: boolean) => void;
  request: ToolApprovalRequest;
}>();

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
  // Also set for editor tools
  openFileTool.setMainWindow(win);
  getOpenTabsTool.setMainWindow(win);
  getSelectionTool.setMainWindow(win);
}

function sendToRenderer<T>(channel: string, data: T): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Register a tool in the registry.
 */
export function registerTool(tool: RegisteredTool): void {
  registry.set(tool.name, tool);
}

/**
 * Get all registered tools as OpenAI-compatible definitions.
 * Sandbox mode omits tools that mutate the project or environment.
 */
export async function getToolDefinitions(): Promise<ToolDefinition[]> {
  const settings = await getSettings();
  const entries = Array.from(registry.values()).filter((t) => {
    if (!settings.agentSandboxMode) return true;
    return !SANDBOX_BLOCKED_TOOLS.has(t.name);
  });
  return entries.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.schema,
    },
  }));
}

/**
 * Get a tool by name.
 */
export function getTool(name: string): RegisteredTool | undefined {
  return registry.get(name);
}

/**
 * Get all registered tool names.
 */
export function getToolNames(): string[] {
  return Array.from(registry.keys());
}

/**
 * Check if a tool call needs approval based on settings and allowlists.
 */
async function needsApproval(
  tool: RegisteredTool,
  args: Record<string, unknown>,
): Promise<{ needs: boolean; reason?: string }> {
  const settings = await getSettings();

  // Check explicit policy
  const policy = settings.toolPolicy[tool.name] ?? 'ask';
  if (policy === 'auto') return { needs: false };
  if (policy === 'deny') return { needs: true, reason: 'Tool is denied by policy.' };

  // Check risk level — low risk tools auto-approve if not explicitly 'ask'
  if (tool.riskLevel === 'low') return { needs: false };

  // Check allowlists for specific tools
  if (tool.name === 'run_shell') {
    const cmd = String(args.command ?? '');
    for (const pattern of settings.shellAllowlist) {
      try {
        if (new RegExp(pattern).test(cmd)) {
          return { needs: false };
        }
      } catch {
        // Invalid regex, skip
      }
    }
  }

  if (tool.name === 'write_file' || tool.name === 'edit_file' || tool.name === 'create_file') {
    const pathArg = String(args.path ?? '');
    for (const glob of settings.writeAllowPaths) {
      // Simple glob matching (supports * and **)
      const regex = globToRegex(glob);
      if (regex.test(pathArg)) {
        return { needs: false };
      }
    }
  }

  return { needs: true };
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function jsonRedacted(value: unknown): unknown {
  try {
    return JSON.parse(redactSecrets(JSON.stringify(value))) as unknown;
  } catch {
    return redactSecrets(String(value));
  }
}

/**
 * Request approval from the renderer process.
 */
async function requestApproval(
  tool: RegisteredTool,
  args: Record<string, unknown>,
  preview?: string,
): Promise<boolean> {
  const id = randomUUID();
  const request: ToolApprovalRequest = {
    id,
    toolName: tool.name,
    args,
    preview,
    riskLevel: tool.riskLevel,
  };

  return new Promise((resolve) => {
    pendingApprovals.set(id, { resolve, request });
    sendToRenderer('tools:approval', request);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingApprovals.has(id)) {
        pendingApprovals.delete(id);
        resolve(false);
      }
    }, 5 * 60 * 1000);
  });
}

/**
 * Handle approval response from renderer.
 */
export async function handleApprovalResponse(response: ToolApprovalResponse): Promise<void> {
  const pending = pendingApprovals.get(response.id);
  if (!pending) return;

  pendingApprovals.delete(response.id);
  const { resolve, request } = pending;

  switch (response.action) {
    case 'allow':
      resolve(true);
      break;

    case 'allow_always_tool': {
      // Set tool policy to auto
      const settings = await getSettings();
      await setSettings({
        toolPolicy: { ...settings.toolPolicy, [request.toolName]: 'auto' },
      });
      resolve(true);
      break;
    }

    case 'allow_always_pattern': {
      // Add to appropriate allowlist
      const settings = await getSettings();
      if (request.toolName === 'run_shell' && response.pattern) {
        await setSettings({
          shellAllowlist: [...settings.shellAllowlist, response.pattern],
        });
      } else if (
        (request.toolName === 'write_file' ||
          request.toolName === 'edit_file' ||
          request.toolName === 'create_file') &&
        response.pattern
      ) {
        await setSettings({
          writeAllowPaths: [...settings.writeAllowPaths, response.pattern],
        });
      }
      resolve(true);
      break;
    }

    case 'deny':
      resolve(false);
      break;

    case 'deny_stop':
      resolve(false);
      // The renderer will handle stopping the task
      break;
  }
}

/**
 * Execute a tool by name.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  requestId?: string,
): Promise<ToolHandlerResult> {
  const tool = registry.get(toolName);
  if (!tool) {
    void recordToolRun(false);
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  const toolCallId = randomUUID();
  const startTime = Date.now();

  // Send execution started event
  const executionEvent: ToolExecutionEvent = {
    requestId: requestId ?? '',
    toolCallId,
    toolName,
    args,
    status: 'pending',
  };
  sendToRenderer('tools:execution', executionEvent);

  const settings = await getSettings();

  if (settings.agentSandboxMode && blockedBySandbox(tool.name, args)) {
    const durationMs = Date.now() - startTime;
    const msg =
      tool.name === 'git_branch'
        ? 'Sandbox mode allows only git_branch list; checkout/create/delete are disabled.'
        : 'Sandbox mode is enabled: this tool cannot mutate your project or environment.';
    sendToRenderer('tools:execution', {
      ...executionEvent,
      status: 'denied',
      error: msg,
      durationMs,
    });
    void toolAudit.appendToolAuditLine({
      ts: Date.now(),
      toolName,
      toolCallId,
      requestId: requestId ?? null,
      success: false,
      durationMs,
      args: jsonRedacted(args ?? {}),
      error: msg,
      sandboxBlocked: true,
    });
    void recordToolRun(false);
    return { success: false, error: msg };
  }

  if (settings.agentDryRunMode && shouldDryRunSimulate(tool.name, args)) {
    const summary = buildDryRunSummary(tool.name, args);
    const durationMs = Date.now() - startTime;
    const resultStr = JSON.stringify(summary);
    sendToRenderer('tools:execution', {
      ...executionEvent,
      status: 'success',
      result: redactSecrets(resultStr),
      durationMs,
    });
    void toolAudit.appendToolAuditLine({
      ts: Date.now(),
      toolName,
      toolCallId,
      requestId: requestId ?? null,
      success: true,
      durationMs,
      args: jsonRedacted(args ?? {}),
      dryRun: true,
      resultPreview: redactSecrets(resultStr).slice(0, 8000),
    });
    void recordToolRun(true);
    return { success: true, result: summary };
  }

  // Check if approval is needed
  const { needs: needsApprovalCheck } = await needsApproval(tool, args);

  if (needsApprovalCheck) {
    // Generate preview if possible
    let preview: string | undefined;
    if (tool.name === 'write_file' || tool.name === 'edit_file') {
      preview = `${tool.name}(${JSON.stringify(args, null, 2)})`;
    } else if (tool.name === 'run_shell') {
      preview = `$ ${args.command}`;
    }

    sendToRenderer('tools:execution', { ...executionEvent, status: 'pending' });

    const approved = await requestApproval(tool, args, preview);
    if (!approved) {
      sendToRenderer('tools:execution', {
        ...executionEvent,
        status: 'denied',
        durationMs: Date.now() - startTime,
      });
      void recordToolRun(false);
      return { success: false, error: 'Tool execution denied by user.' };
    }

    sendToRenderer('tools:execution', { ...executionEvent, status: 'approved' });
  }

  // Execute the tool
  sendToRenderer('tools:execution', { ...executionEvent, status: 'executing' });

  const ctx: ToolContext = {
    projectRoot: getRoot(),
    requestApproval: async (preview: string) => {
      return requestApproval(tool, args, preview);
    },
    sendProgress: (message: string) => {
      sendToRenderer('tools:execution', {
        ...executionEvent,
        status: 'executing',
        result: message,
      });
    },
  };

  try {
    const result = await tool.handler(args, ctx);
    const durationMs = Date.now() - startTime;

    const safeResultStr =
      result.success && result.result !== undefined
        ? redactSecrets(JSON.stringify(result.result))
        : undefined;

    sendToRenderer('tools:execution', {
      ...executionEvent,
      status: result.success ? 'success' : 'error',
      result: safeResultStr,
      error: result.error ? redactSecrets(result.error) : undefined,
      durationMs,
    });

    void toolAudit.appendToolAuditLine({
      ts: Date.now(),
      toolName,
      toolCallId,
      requestId: requestId ?? null,
      success: result.success,
      durationMs,
      args: jsonRedacted(args ?? {}),
      error: result.error ? redactSecrets(result.error) : undefined,
      resultPreview:
        result.success && result.result !== undefined
          ? redactSecrets(JSON.stringify(result.result).slice(0, 8000))
          : undefined,
    });

    void recordToolRun(result.success);
    return result;
  } catch (e) {
    const error = redactSecrets((e as Error).message);
    const durationMs = Date.now() - startTime;

    sendToRenderer('tools:execution', {
      ...executionEvent,
      status: 'error',
      error,
      durationMs,
    });

    void toolAudit.appendToolAuditLine({
      ts: Date.now(),
      toolName,
      toolCallId,
      requestId: requestId ?? null,
      success: false,
      durationMs,
      args: jsonRedacted(args ?? {}),
      error,
    });

    void recordToolRun(false);
    return { success: false, error };
  }
}

/**
 * Get tool policy for a specific tool.
 */
export async function getToolPolicy(toolName: string): Promise<ToolPolicy> {
  const settings = await getSettings();
  return settings.toolPolicy[toolName] ?? 'ask';
}

/**
 * Set tool policy for a specific tool.
 */
export async function setToolPolicy(toolName: string, policy: ToolPolicy): Promise<void> {
  const settings = await getSettings();
  await setSettings({
    toolPolicy: { ...settings.toolPolicy, [toolName]: policy },
  });
}

/**
 * Add a pattern to shell allowlist.
 */
export async function addShellAllowPattern(pattern: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.shellAllowlist.includes(pattern)) {
    await setSettings({
      shellAllowlist: [...settings.shellAllowlist, pattern],
    });
  }
}

/**
 * Remove a pattern from shell allowlist.
 */
export async function removeShellAllowPattern(pattern: string): Promise<void> {
  const settings = await getSettings();
  await setSettings({
    shellAllowlist: settings.shellAllowlist.filter((p) => p !== pattern),
  });
}

/**
 * Add a glob to write allow paths.
 */
export async function addWriteAllowPath(glob: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.writeAllowPaths.includes(glob)) {
    await setSettings({
      writeAllowPaths: [...settings.writeAllowPaths, glob],
    });
  }
}

/**
 * Remove a glob from write allow paths.
 */
export async function removeWriteAllowPath(glob: string): Promise<void> {
  const settings = await getSettings();
  await setSettings({
    writeAllowPaths: settings.writeAllowPaths.filter((p) => p !== glob),
  });
}

/**
 * Initialize all tools.
 */
export function initializeTools(): void {
  // Filesystem tools
  registerTool(readFileTool.tool);
  registerTool(writeFileTool.tool);
  registerTool(editFileTool.tool);
  registerTool(createFileTool.tool);
  registerTool(deleteFileTool.tool);
  registerTool(listDirTool.tool);
  registerTool(statFileTool.tool);

  // Search tools
  registerTool(grepTool.tool);
  registerTool(findFilesTool.tool);
  registerTool(searchSymbolsTool.tool);

  // Shell tools
  registerTool(runShellTool.tool);

  // Editor tools
  registerTool(openFileTool.tool);
  registerTool(getOpenTabsTool.tool);
  registerTool(getSelectionTool.tool);

  // Git tools
  registerTool(gitStatusTool.tool);
  registerTool(gitDiffTool.tool);
  registerTool(gitLogTool.tool);
  registerTool(gitCommitTool.tool);
  registerTool(gitBranchTool.tool);
  registerTool(gitAddTool.tool);

  // Network tools
  registerTool(fetchUrlTool.tool);
  registerTool(fetchJsonTool.tool);

  // Diagnostic tools
  registerTool(runTestsTool.tool);

  // Memory tools
  registerTool(memoryTools.memorySetTool);
  registerTool(memoryTools.memoryGetTool);
  registerTool(memoryTools.memoryListTool);
  registerTool(memoryTools.memoryForgetTool);
}

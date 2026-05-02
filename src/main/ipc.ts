import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { IPC_INVOKE_CHANNELS } from './ipcChannels.js';
import * as fsApi from './fileSystem.js';
import * as workspaceApi from './workspace.js';
import * as orApi from './openrouter.js';
import * as store from './secureStore.js';
import * as term from './terminal.js';
import * as rules from './rules.js';
import * as ctxApi from './context.js';
import * as tasksApi from './tasks.js';
import * as toolsApi from './tools/index.js';
import * as sessionApi from './session.js';
import * as diagnosticsApi from './diagnostics.js';
import * as screenshotApi from './screenshot.js';
import * as toolAuditApi from './toolAudit.js';
import * as updaterApi from './updater.js';
import * as statsApi from './localStats.js';
import { restartWebhookServer } from './webhookServer.js';
import type {
  AgentTask,
  AppSettings,
  ChatCompletionRequest,
  Rule,
  ToolApprovalResponse,
  ToolPolicy,
} from '../shared/types.js';

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  for (const channel of IPC_INVOKE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  toolsApi.initializeTools();

  // ---- secure store ----
  ipcMain.handle('secureStore:get', async (_e, key: string) => store.secretGet(key));
  ipcMain.handle('secureStore:set', async (_e, key: string, value: string) =>
    store.secretSet(key, value),
  );
  ipcMain.handle('secureStore:delete', async (_e, key: string) => store.secretDelete(key));

  // ---- settings ----
  ipcMain.handle('settings:get', async () => store.getSettings());
  ipcMain.handle('settings:set', async (_e, partial: Partial<AppSettings>) => {
    const next = await store.setSettings(partial);
    restartWebhookServer(getWindow(), next.webhookListenerEnabled, next.webhookPort);
    return next;
  });

  // ---- file system ----
  ipcMain.handle('fs:openFolder', async () => fsApi.openFolder(getWindow()));
  ipcMain.handle('fs:setRoot', async (_e, root: string) => fsApi.setRoot(root));
  ipcMain.handle('fs:getRoot', async () => fsApi.getRoot());
  ipcMain.handle('fs:listFiles', async () => fsApi.listFiles());
  ipcMain.handle('fs:readFile', async (_e, rel: string) => fsApi.readFile(rel));
  ipcMain.handle('fs:writeFile', async (_e, rel: string, content: string) =>
    fsApi.writeFile(rel, content),
  );
  ipcMain.handle('fs:createFile', async (_e, rel: string, content?: string) =>
    fsApi.createFile(rel, content),
  );
  ipcMain.handle('fs:deleteFile', async (_e, rel: string) => fsApi.deleteFile(rel));
  ipcMain.handle('fs:renameFile', async (_e, oldRel: string, newRel: string) =>
    fsApi.renameFile(oldRel, newRel),
  );
  ipcMain.handle('fs:searchFiles', async (_e, query: string) => fsApi.searchFiles(query));
  ipcMain.handle('fs:backupFile', async (_e, rel: string) => fsApi.backupFile(rel));
  ipcMain.handle('fs:pickImage', async () => ctxApi.pickImage(getWindow()));
  ipcMain.handle('fs:pickTextFile', async () => ctxApi.pickTextFile(getWindow()));

  ipcMain.handle('workspace:pickParentDir', async () => workspaceApi.pickParentDirectory(getWindow()));
  ipcMain.handle(
    'workspace:gitClone',
    async (_e, repoUrl: string, parentDir: string) => workspaceApi.gitCloneRepository(repoUrl, parentDir),
  );

  // ---- context (URL fetching) ----
  ipcMain.handle('context:fetchUrl', async (_e, url: string) => ctxApi.fetchUrl(url));

  // ---- openrouter ----
  ipcMain.handle('openrouter:testKey', async (_e, apiKey: string) => orApi.testApiKey(apiKey));
  ipcMain.handle('openrouter:listModels', async (_e, apiKey: string) => orApi.listModels(apiKey));
  ipcMain.handle('openrouter:chat', async (_e, req: ChatCompletionRequest) => {
    try {
      const res = await orApi.chatCompletion(req);
      await statsApi.recordCompletion({ ok: true, usage: res.usage });
      return res;
    } catch (e) {
      await statsApi.recordCompletion({ ok: false });
      throw e;
    }
  });
  ipcMain.handle('openrouter:chatStreamStart', async (_e, req: ChatCompletionRequest) => {
    const id = randomUUID();
    // Start streaming but don't await - results go through 'openrouter:stream' event.
    void orApi.startChatStream(req, id, getWindow());
    return id;
  });
  ipcMain.handle('openrouter:chatStreamCancel', async (_e, id: string) => orApi.cancelStream(id));

  // ---- terminal ----
  ipcMain.handle(
    'terminal:start',
    async (_e, opts: { shell?: string; cwd?: string; cols?: number; rows?: number }) => {
      const cwd = opts.cwd ?? fsApi.getRoot() ?? undefined;
      return term.startSession({ shell: opts.shell, cwd }, getWindow());
    },
  );
  ipcMain.handle('terminal:write', async (_e, id: string, data: string) =>
    term.writeToSession(id, data),
  );
  ipcMain.handle('terminal:run', async (_e, id: string, cmd: string) =>
    term.runCommand(id, cmd),
  );
  ipcMain.handle('terminal:kill', async (_e, id: string) => term.killSession(id));
  ipcMain.handle('terminal:resize', async (_e, id: string, cols: number, rows: number) =>
    term.resizeSession(id, cols, rows),
  );

  // ---- rules ----
  ipcMain.handle('rules:scan', async () => rules.scanRules());
  ipcMain.handle('rules:getUser', async () => rules.getUserRules());
  ipcMain.handle('rules:saveUser', async (_e, rule: Omit<Rule, 'source'>) =>
    rules.saveUserRule(rule),
  );
  ipcMain.handle('rules:deleteUser', async (_e, id: string) => rules.deleteUserRule(id));
  ipcMain.handle('rules:setEnabled', async (_e, id: string, enabled: boolean) =>
    rules.setRuleEnabled(id, enabled),
  );
  ipcMain.handle('rules:getEnabledMap', async () => rules.getEnabledMap());

  // ---- agent tasks (persistence + resume) ----
  ipcMain.handle('tasks:list', async () => tasksApi.listTasks());
  ipcMain.handle('tasks:get', async (_e, id: string) => tasksApi.getTask(id));
  ipcMain.handle('tasks:save', async (_e, task: AgentTask) => tasksApi.saveTask(task));
  ipcMain.handle('tasks:delete', async (_e, id: string) => tasksApi.deleteTask(id));

  // ---- tools ----
  ipcMain.handle('tools:listDefinitions', async () => toolsApi.getToolDefinitions());
  ipcMain.handle(
    'tools:execute',
    async (
      _e,
      toolName: string,
      args: Record<string, unknown>,
      meta?: { taskId?: string; requestId?: string },
    ) => {
      return toolsApi.executeTool(toolName, args, meta?.requestId, meta?.taskId ?? null);
    },
  );
  ipcMain.handle('tools:getPolicy', async (_e, toolName: string) =>
    toolsApi.getToolPolicy(toolName),
  );
  ipcMain.handle('tools:setPolicy', async (_e, toolName: string, policy: ToolPolicy) =>
    toolsApi.setToolPolicy(toolName, policy),
  );
  ipcMain.handle('tools:addShellAllowPattern', async (_e, pattern: string) =>
    toolsApi.addShellAllowPattern(pattern),
  );
  ipcMain.handle('tools:removeShellAllowPattern', async (_e, pattern: string) =>
    toolsApi.removeShellAllowPattern(pattern),
  );
  ipcMain.handle('tools:addWriteAllowPath', async (_e, glob: string) =>
    toolsApi.addWriteAllowPath(glob),
  );
  ipcMain.handle('tools:removeWriteAllowPath', async (_e, glob: string) =>
    toolsApi.removeWriteAllowPath(glob),
  );
  ipcMain.handle('tools:respondApproval', async (_e, response: ToolApprovalResponse) =>
    toolsApi.handleApprovalResponse(response),
  );

  // ---- session management ----
  ipcMain.handle('session:load', async () => sessionApi.loadSession());
  ipcMain.handle(
    'session:save',
    async (_e, state: Partial<sessionApi.SessionState>) => sessionApi.saveSession(state),
  );
  ipcMain.handle('session:clear', async () => sessionApi.clearSession());

  // ---- autosave ----
  ipcMain.handle('autosave:save', async (_e, relativePath: string, content: string) =>
    sessionApi.saveAutosave(relativePath, content),
  );
  ipcMain.handle('autosave:load', async (_e, relativePath: string) =>
    sessionApi.loadAutosave(relativePath),
  );
  ipcMain.handle('autosave:delete', async (_e, relativePath: string) =>
    sessionApi.deleteAutosave(relativePath),
  );
  ipcMain.handle('autosave:list', async () => sessionApi.listAutosaves());
  ipcMain.handle('autosave:clear', async () => sessionApi.clearAutosaves());

  // ---- crash recovery ----
  ipcMain.handle('crash:check', async () => sessionApi.checkCrashFlag());
  ipcMain.handle('crash:setCrashFlag', async () => sessionApi.setCrashFlag());
  ipcMain.handle('crash:clearCrashFlag', async () => sessionApi.clearCrashFlag());

  // ---- diagnostics ----
  ipcMain.handle('diagnostics:runAll', async () => diagnosticsApi.runAllDiagnostics());
  ipcMain.handle('diagnostics:runForFile', async (_e, filePath: string) =>
    diagnosticsApi.runDiagnosticsForFile(filePath),
  );

  // ---- screenshot ----
  ipcMain.handle('screenshot:captureAllScreens', async () => screenshotApi.captureAllScreens());
  ipcMain.handle('screenshot:captureRegion', async (_e, x: number, y: number, w: number, h: number) =>
    screenshotApi.captureRegion(x, y, w, h),
  );
  ipcMain.handle('screenshot:captureFullScreen', async () => screenshotApi.captureFullScreen());

  // ---- tool audit (local append-only log) ----
  ipcMain.handle('audit:tailLines', async (_e, maxLines: number) =>
    toolAuditApi.readToolAuditTail(maxLines),
  );
  ipcMain.handle('audit:getFilePath', async () => toolAuditApi.getToolAuditFilePath());

  ipcMain.handle('stats:get', async () => statsApi.getStats());
  ipcMain.handle('stats:reset', async () => statsApi.resetStats());

  ipcMain.handle('updates:check', async () => updaterApi.invokeCheckForUpdates());
  ipcMain.handle('updates:download', async () => updaterApi.invokeDownloadUpdate());
  ipcMain.handle('updates:quitAndInstall', async () => {
    updaterApi.invokeQuitAndInstall();
  });

  void store.getSettings().then((s) => {
    restartWebhookServer(getWindow(), s.webhookListenerEnabled, s.webhookPort);
  });
}

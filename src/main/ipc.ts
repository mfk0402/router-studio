import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { IPC_INVOKE_CHANNELS } from './ipcChannels.js';

/**
 * Channel list lives in ipcChannels.ts — keep it in sync with every ipcMain.handle below.
 *
 * Note: Do not verify handlers via ipcMain.listeners('handle:…'); invoke handlers are not
 * exposed that way in Electron, so that pattern falsely reports every channel as missing.
 */
import * as fsApi from './fileSystem.js';
import * as workspaceApi from './workspace.js';
import * as orApi from './openrouter.js';
import * as orVideoApi from './openrouterVideo.js';
import * as orSpeechApi from './openrouterSpeech.js';
import * as store from './secureStore.js';
import * as term from './terminal.js';
import * as rules from './rules.js';
import * as ctxApi from './context.js';
import * as tasksApi from './tasks.js';
import * as checkpointsApi from './checkpointsApi.js';
import * as toolsApi from './tools/index.js';
import * as projectGraphApi from './projectGraph.js';
import * as modelRouterApi from './modelRouter.js';
import * as sessionApi from './session.js';
import * as diagnosticsApi from './diagnostics.js';
import * as screenshotApi from './screenshot.js';
import * as toolAuditApi from './toolAudit.js';
import * as updaterApi from './updater.js';
import * as statsApi from './localStats.js';
import * as lspHost from './lspHost.js';
import { restartWebhookServer } from './webhookServer.js';
import * as accountVault from './accountVault.js';
import {
  consumeRegistrationToken,
  getRegistrationPolicy,
  requestRegistrationCode,
  verifyRegistrationCode,
} from './emailVerification.js';
import type {
  AgentTask,
  AgentRunEvent,
  AppSettings,
  ChatCompletionRequest,
  NormalizedModel,
  OpenRouterSpeechRequest,
  OpenRouterVideoSubmitRequest,
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
  ipcMain.handle('secureStore:set', async (_e, key: string, value: string) => {
    await store.secretSet(key, value);
    accountVault.scheduleVaultSyncIfLoggedIn();
  });
  ipcMain.handle('secureStore:delete', async (_e, key: string) => store.secretDelete(key));

  ipcMain.handle('auth:registrationPolicy', async () => getRegistrationPolicy());
  ipcMain.handle('auth:requestRegistrationCode', async (_e, email: string) =>
    requestRegistrationCode(email),
  );
  ipcMain.handle('auth:verifyRegistrationCode', async (_e, email: string, code: string) =>
    verifyRegistrationCode(email, code),
  );
  ipcMain.handle(
    'auth:register',
    async (_e, email: string, password: string, registrationToken?: string) => {
      if (await accountVault.isEmailRegistered(email)) {
        return {
          ok: false as const,
          error: 'An account with this email already exists. Sign in instead.',
        };
      }
      const policy = getRegistrationPolicy();
      if (policy.needsVerification) {
        const tok = typeof registrationToken === 'string' ? registrationToken.trim() : '';
        if (!tok) {
          return {
            ok: false as const,
            error: 'Enter the verification code from your email.',
          };
        }
        const consumed = await consumeRegistrationToken(email, tok);
        if (!consumed) {
          return {
            ok: false as const,
            error: 'Verification expired or invalid. Request a new code.',
          };
        }
      }
      return accountVault.registerAccount(email, password);
    },
  );
  ipcMain.handle('auth:login', async (_e, email: string, password: string) =>
    accountVault.loginAccount(email, password),
  );
  ipcMain.handle('auth:logout', async () => {
    accountVault.logoutAccount();
  });
  ipcMain.handle('auth:session', async () => {
    const s = accountVault.getSession();
    return s ? { loggedIn: true as const, email: s.email } : { loggedIn: false as const };
  });
  ipcMain.handle('auth:syncVault', async () => accountVault.saveVaultFromCurrentSettings());
  ipcMain.handle('auth:listAccounts', async () => accountVault.listRegisteredAccounts());

  // ---- settings ----
  ipcMain.handle('settings:get', async () => store.getSettings());
  ipcMain.handle('settings:set', async (_e, partial: Partial<AppSettings>) => {
    const next = await store.setSettings(partial);
    restartWebhookServer(getWindow(), next.webhookListenerEnabled, next.webhookPort);
    accountVault.scheduleVaultSyncIfLoggedIn();
    const root = fsApi.getRoot();
    await lspHost.ensureLspForWorkspace(next.editor.typescriptLanguageServer, root);
    return next;
  });

  // ---- file system ----
  ipcMain.handle('fs:openFolder', async () => fsApi.openFolder(getWindow()));
  ipcMain.handle('fs:setRoot', async (_e, root: string) => {
    const ok = await fsApi.setRoot(root);
    const s = await store.getSettings();
    if (ok) {
      await lspHost.ensureLspForWorkspace(s.editor.typescriptLanguageServer, root);
    } else {
      await lspHost.ensureLspForWorkspace(false, null);
    }
    return ok;
  });
  ipcMain.handle('fs:getRoot', async () => fsApi.getRoot());
  ipcMain.handle('fs:listFiles', async () => fsApi.listFiles());
  ipcMain.handle('fs:readFile', async (_e, rel: string) => fsApi.readFile(rel));
  ipcMain.handle('fs:readFileIfExists', async (_e, rel: string) => fsApi.readFileIfExists(rel));
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
  ipcMain.handle(
    'openrouter:listOpenAiModels',
    async (_e, openAiBaseUrl: string, apiKey: string) =>
      orApi.listOpenAiCompatibleModels(openAiBaseUrl, apiKey),
  );
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
  ipcMain.handle(
    'openrouter:videoSubmit',
    async (_e, apiKey: string, req: OpenRouterVideoSubmitRequest) =>
      orVideoApi.submitVideoJob(apiKey, req),
  );
  ipcMain.handle(
    'openrouter:videoPoll',
    async (_e, apiKey: string, pollingUrl: string) => orVideoApi.pollVideoJob(apiKey, pollingUrl),
  );
  ipcMain.handle(
    'openrouter:speech',
    async (_e, apiKey: string, req: OpenRouterSpeechRequest) => orSpeechApi.createSpeech(apiKey, req),
  );

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

  ipcMain.handle('agentQueue:list', async () => tasksApi.listQueuedTasks());
  ipcMain.handle('agentQueue:enqueue', async (_e, task: AgentTask) => {
    const saved = await tasksApi.enqueueTask(task);
    const event = (await tasksApi.listTaskEvents(saved.id)).at(-1);
    if (event) getWindow()?.webContents.send('agentEvents:changed', event);
    return saved;
  });
  ipcMain.handle('agentQueue:startNext', async () => {
    const saved = await tasksApi.startNextQueuedTask();
    if (saved) {
      const event = (await tasksApi.listTaskEvents(saved.id)).at(-1);
      if (event) getWindow()?.webContents.send('agentEvents:changed', event);
    }
    return saved;
  });
  ipcMain.handle(
    'agentQueue:updateStatus',
    async (_e, id: string, status: AgentTask['status'], phase?: AgentTask['phase']) => {
      const saved = await tasksApi.updateTaskStatus(id, status, phase);
      if (saved) {
        const event = (await tasksApi.listTaskEvents(saved.id)).at(-1);
        if (event) getWindow()?.webContents.send('agentEvents:changed', event);
      }
      return saved;
    },
  );
  ipcMain.handle('agentEvents:list', async (_e, taskId: string) => tasksApi.listTaskEvents(taskId));
  ipcMain.handle(
    'agentEvents:append',
    async (
      _e,
      event: Omit<AgentRunEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
    ) => {
      const saved = await tasksApi.appendTaskEvent(event);
      getWindow()?.webContents.send('agentEvents:changed', saved);
      return saved;
    },
  );
  ipcMain.handle('agentEvents:clear', async (_e, taskId: string) => tasksApi.clearTaskEvents(taskId));

  ipcMain.handle('projectGraph:get', async () => {
    const root = fsApi.getRoot();
    if (!root) return null;
    return projectGraphApi.getProjectGraph(root);
  });
  ipcMain.handle('projectGraph:rebuild', async () => {
    const root = fsApi.getRoot();
    if (!root) return null;
    return projectGraphApi.buildProjectGraph(root);
  });
  ipcMain.handle('projectGraph:recommend', async (_e, query: string, limit?: number) => {
    const root = fsApi.getRoot();
    if (!root) return [];
    return projectGraphApi.recommendProjectContext(root, query, limit);
  });
  ipcMain.handle(
    'modelRouter:explainRoute',
    async (
      _e,
      input: {
        prompt: string;
        estimatedPromptTokens: number;
        hasImageAttachment: boolean;
        models?: NormalizedModel[];
      },
    ) => {
      const settings = await store.getSettings();
      return modelRouterApi.explainModelRoute({
        settings,
        models: Array.isArray(input.models) ? input.models : [],
        prompt: String(input.prompt ?? ''),
        estimatedPromptTokens: Number(input.estimatedPromptTokens) || 0,
        hasImageAttachment: !!input.hasImageAttachment,
      });
    },
  );

  ipcMain.handle('checkpoints:list', async () => checkpointsApi.listCheckpointSummaries());
  ipcMain.handle('checkpoints:get', async (_e, id: string) => checkpointsApi.readCheckpoint(id));
  ipcMain.handle('checkpoints:restore', async (_e, id: string) => {
    const root = fsApi.getRoot();
    if (!root) return { ok: false as const, error: 'No project folder is open.' };
    return checkpointsApi.restoreCheckpoint(id, root);
  });
  ipcMain.handle('checkpoints:delete', async (_e, id: string) => checkpointsApi.deleteCheckpoint(id));

  // ---- tools ----
  ipcMain.handle('tools:listDefinitions', async (_e, productMode?: AppSettings['productMode']) =>
    toolsApi.getToolDefinitions(productMode),
  );
  ipcMain.handle(
    'tools:execute',
    async (
      _e,
      toolName: string,
      args: Record<string, unknown>,
      meta?: { taskId?: string; requestId?: string; productMode?: AppSettings['productMode'] },
    ) => {
      return toolsApi.executeTool(
        toolName,
        args,
        meta?.requestId,
        meta?.taskId ?? null,
        meta?.productMode ?? null,
      );
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

  ipcMain.handle('lsp:configure', async (_e, projectRoot: string | null) => {
    const s = await store.getSettings();
    await lspHost.ensureLspForWorkspace(s.editor.typescriptLanguageServer, projectRoot);
    return lspHost.getLspBridgeStatus();
  });
  ipcMain.handle(
    'lsp:syncDoc',
    async (
      _e,
      payload: {
        kind: 'open' | 'change' | 'close';
        relPath: string;
        languageId: string;
        text?: string;
      },
    ) => {
      const s = await store.getSettings();
      if (!s.editor.typescriptLanguageServer) return { ok: false as const };
      await lspHost.syncDocument(payload.kind, payload.relPath, payload.languageId, payload.text);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    'lsp:hover',
    async (_e, payload: { relPath: string; line: number; character: number }) => {
      return lspHost.lspHover(payload.relPath, payload.line, payload.character);
    },
  );
  ipcMain.handle('lsp:documentSymbols', async (_e, relPath: string) => {
    const s = await store.getSettings();
    if (!s.editor.typescriptLanguageServer) return null;
    return lspHost.lspDocumentSymbols(relPath);
  });
  ipcMain.handle(
    'lsp:definition',
    async (_e, payload: { relPath: string; line: number; character: number }) => {
      const s = await store.getSettings();
      if (!s.editor.typescriptLanguageServer) return null;
      return lspHost.lspDefinition(payload.relPath, payload.line, payload.character);
    },
  );
  ipcMain.handle(
    'lsp:references',
    async (
      _e,
      payload: { relPath: string; line: number; character: number; includeDeclaration?: boolean },
    ) => {
      const s = await store.getSettings();
      if (!s.editor.typescriptLanguageServer) return null;
      return lspHost.lspReferences(
        payload.relPath,
        payload.line,
        payload.character,
        payload.includeDeclaration ?? true,
      );
    },
  );
  ipcMain.handle('lsp:workspaceSymbols', async (_e, query: string) => {
    const s = await store.getSettings();
    if (!s.editor.typescriptLanguageServer) return [];
    return lspHost.lspWorkspaceSymbolSearch(typeof query === 'string' ? query : '');
  });

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

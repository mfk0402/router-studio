import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentTask,
  AppSettings,
  AutosaveEntry,
  ChatCompletionRequest,
  IpcApi,
  Rule,
  ScheduledTaskDuePayload,
  SessionState,
  StreamChunk,
  TerminalEvent,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolExecutionEvent,
  ToolExecuteMeta,
  ToolPolicy,
  UpdateEvent,
  WebhookIncomingPayload,
} from '../shared/types.js';

const api: IpcApi = {
  secureStore: {
    get: (key) => ipcRenderer.invoke('secureStore:get', key),
    set: (key, value) => ipcRenderer.invoke('secureStore:set', key, value),
    delete: (key) => ipcRenderer.invoke('secureStore:delete', key),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (partial: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', partial),
  },
  fs: {
    openFolder: () => ipcRenderer.invoke('fs:openFolder'),
    setRoot: (root) => ipcRenderer.invoke('fs:setRoot', root),
    getRoot: () => ipcRenderer.invoke('fs:getRoot'),
    listFiles: () => ipcRenderer.invoke('fs:listFiles'),
    readFile: (rel) => ipcRenderer.invoke('fs:readFile', rel),
    writeFile: (rel, content) => ipcRenderer.invoke('fs:writeFile', rel, content),
    createFile: (rel, content) => ipcRenderer.invoke('fs:createFile', rel, content),
    deleteFile: (rel) => ipcRenderer.invoke('fs:deleteFile', rel),
    renameFile: (oldRel, newRel) => ipcRenderer.invoke('fs:renameFile', oldRel, newRel),
    searchFiles: (query) => ipcRenderer.invoke('fs:searchFiles', query),
    backupFile: (rel) => ipcRenderer.invoke('fs:backupFile', rel),
    pickImage: () => ipcRenderer.invoke('fs:pickImage'),
    pickTextFile: () => ipcRenderer.invoke('fs:pickTextFile'),
  },
  workspace: {
    pickParentDir: () => ipcRenderer.invoke('workspace:pickParentDir'),
    gitClone: (repoUrl: string, parentDir: string) =>
      ipcRenderer.invoke('workspace:gitClone', repoUrl, parentDir),
  },
  context: {
    fetchUrl: (url) => ipcRenderer.invoke('context:fetchUrl', url),
  },
  openrouter: {
    testKey: (apiKey) => ipcRenderer.invoke('openrouter:testKey', apiKey),
    listModels: (apiKey) => ipcRenderer.invoke('openrouter:listModels', apiKey),
    chat: (req: ChatCompletionRequest) => ipcRenderer.invoke('openrouter:chat', req),
    chatStreamStart: (req: ChatCompletionRequest) =>
      ipcRenderer.invoke('openrouter:chatStreamStart', req),
    chatStreamCancel: (id) => ipcRenderer.invoke('openrouter:chatStreamCancel', id),
  },
  terminal: {
    start: (opts) => ipcRenderer.invoke('terminal:start', opts),
    write: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
    run: (id, cmd) => ipcRenderer.invoke('terminal:run', id, cmd),
    kill: (id) => ipcRenderer.invoke('terminal:kill', id),
    resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
  },
  rules: {
    scan: () => ipcRenderer.invoke('rules:scan'),
    getUserRules: () => ipcRenderer.invoke('rules:getUser'),
    saveUserRule: (rule: Omit<Rule, 'source'>) => ipcRenderer.invoke('rules:saveUser', rule),
    deleteUserRule: (id) => ipcRenderer.invoke('rules:deleteUser', id),
    setEnabledState: (id, enabled) => ipcRenderer.invoke('rules:setEnabled', id, enabled),
    getEnabledState: () => ipcRenderer.invoke('rules:getEnabledMap'),
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (id: string) => ipcRenderer.invoke('tasks:get', id),
    save: (task: AgentTask) => ipcRenderer.invoke('tasks:save', task),
    delete: (id: string) => ipcRenderer.invoke('tasks:delete', id),
  },
  tools: {
    listDefinitions: () => ipcRenderer.invoke('tools:listDefinitions'),
    execute: (
      toolName: string,
      args: Record<string, unknown>,
      meta?: ToolExecuteMeta,
    ) => ipcRenderer.invoke('tools:execute', toolName, args, meta),
    getPolicy: (toolName: string) => ipcRenderer.invoke('tools:getPolicy', toolName),
    setPolicy: (toolName: string, policy: ToolPolicy) =>
      ipcRenderer.invoke('tools:setPolicy', toolName, policy),
    addShellAllowPattern: (pattern: string) =>
      ipcRenderer.invoke('tools:addShellAllowPattern', pattern),
    removeShellAllowPattern: (pattern: string) =>
      ipcRenderer.invoke('tools:removeShellAllowPattern', pattern),
    addWriteAllowPath: (glob: string) => ipcRenderer.invoke('tools:addWriteAllowPath', glob),
    removeWriteAllowPath: (glob: string) => ipcRenderer.invoke('tools:removeWriteAllowPath', glob),
  },
  events: {
    onChatStream: (cb: (chunk: StreamChunk) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, chunk: StreamChunk) => cb(chunk);
      ipcRenderer.on('openrouter:stream', listener);
      return () => ipcRenderer.removeListener('openrouter:stream', listener);
    },
    onStreamExtended: (cb: (chunk: StreamChunk) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, chunk: StreamChunk) => cb(chunk);
      ipcRenderer.on('openrouter:stream', listener);
      return () => ipcRenderer.removeListener('openrouter:stream', listener);
    },
    onTerminal: (cb: (evt: TerminalEvent) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, evt: TerminalEvent) => cb(evt);
      ipcRenderer.on('terminal:event', listener);
      return () => ipcRenderer.removeListener('terminal:event', listener);
    },
    onToolApproval: (cb: (req: ToolApprovalRequest) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, req: ToolApprovalRequest) => cb(req);
      ipcRenderer.on('tools:approval', listener);
      return () => ipcRenderer.removeListener('tools:approval', listener);
    },
    onToolExecution: (cb: (evt: ToolExecutionEvent) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, evt: ToolExecutionEvent) => cb(evt);
      ipcRenderer.on('tools:execution', listener);
      return () => ipcRenderer.removeListener('tools:execution', listener);
    },
    onUpdates: (cb: (evt: UpdateEvent) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, evt: UpdateEvent) => cb(evt);
      ipcRenderer.on('updates:event', listener);
      return () => ipcRenderer.removeListener('updates:event', listener);
    },
    onWebhook: (cb: (payload: WebhookIncomingPayload) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: WebhookIncomingPayload) =>
        cb(payload);
      ipcRenderer.on('webhook:incoming', listener);
      return () => ipcRenderer.removeListener('webhook:incoming', listener);
    },
    onScheduledDue: (cb: (payload: ScheduledTaskDuePayload) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: ScheduledTaskDuePayload) =>
        cb(payload);
      ipcRenderer.on('scheduled:due', listener);
      return () => ipcRenderer.removeListener('scheduled:due', listener);
    },
  },
  respondToolApproval: (response: ToolApprovalResponse) =>
    ipcRenderer.invoke('tools:respondApproval', response),
  session: {
    load: () => ipcRenderer.invoke('session:load'),
    save: (state: Partial<SessionState>) => ipcRenderer.invoke('session:save', state),
    clear: () => ipcRenderer.invoke('session:clear'),
  },
  autosave: {
    save: (relativePath: string, content: string) =>
      ipcRenderer.invoke('autosave:save', relativePath, content),
    load: (relativePath: string) => ipcRenderer.invoke('autosave:load', relativePath),
    delete: (relativePath: string) => ipcRenderer.invoke('autosave:delete', relativePath),
    list: () => ipcRenderer.invoke('autosave:list'),
    clear: () => ipcRenderer.invoke('autosave:clear'),
  },
  crash: {
    check: () => ipcRenderer.invoke('crash:check'),
    setCrashFlag: () => ipcRenderer.invoke('crash:setCrashFlag'),
    clearCrashFlag: () => ipcRenderer.invoke('crash:clearCrashFlag'),
  },
  diagnostics: {
    runAll: () => ipcRenderer.invoke('diagnostics:runAll'),
    runForFile: (filePath: string) => ipcRenderer.invoke('diagnostics:runForFile', filePath),
  },
  screenshot: {
    captureAllScreens: () => ipcRenderer.invoke('screenshot:captureAllScreens'),
    captureRegion: (x: number, y: number, width: number, height: number) =>
      ipcRenderer.invoke('screenshot:captureRegion', x, y, width, height),
    captureFullScreen: () => ipcRenderer.invoke('screenshot:captureFullScreen'),
  },
  audit: {
    tailLines: (maxLines: number) => ipcRenderer.invoke('audit:tailLines', maxLines),
    getFilePath: () => ipcRenderer.invoke('audit:getFilePath'),
  },
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
    reset: () => ipcRenderer.invoke('stats:reset'),
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    quitAndInstall: () => ipcRenderer.invoke('updates:quitAndInstall'),
  },
};

try {
  contextBridge.exposeInMainWorld('api', api);
  console.log('[preload] window.api exposed');
} catch (e) {
  console.error('[preload] failed to expose window.api', e);
}

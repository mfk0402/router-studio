export interface OpenRouterModelRaw {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
    context_length?: number;
    is_moderated?: boolean;
  };
  architecture?: {
    tokenizer?: string;
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

export type ModelCategory =
  | 'coding'
  | 'chat'
  | 'reasoning'
  | 'vision'
  | 'image-gen'
  | 'video-gen'
  | 'audio'
  | 'fast'
  | 'large-context'
  | 'free';

/** Coarse price bucket for quick "cheap vs expensive" decisions. */
export type PriceTier = 'free' | 'cheap' | 'mid' | 'premium';

export interface NormalizedModel {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  /** Input price per token (raw OpenRouter value). */
  pricingPrompt: number;
  /** Output price per token (raw OpenRouter value). */
  pricingCompletion: number;
  /** Convenience: (input + output) per 1 M tokens averaged. */
  avgPricePerM: number;
  /** Convenience: input price per 1 M tokens. */
  inPricePerM: number;
  /** Convenience: output price per 1 M tokens. */
  outPricePerM: number;
  isFree: boolean;
  isLikelyCodingModel: boolean;
  categories: ModelCategory[];
  priceTier: PriceTier;
  raw: OpenRouterModelRaw;
}

/**
 * OpenAI-compatible multi-part message content. Use a plain string for simple
 * text, or an array of parts for vision-capable calls.
 */
export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export type MessageContent = string | MessageContentPart[];

/** An attachment the user has dragged/pasted/picked into the AI panel. */
export interface Attachment {
  id: string;
  kind: 'image' | 'url' | 'file' | 'snippet';
  /** Short label shown in the chip UI. */
  label: string;
  /** For 'url' | 'file' | 'snippet' — the extracted text content. */
  text?: string;
  /** For 'image' — a data URL (data:image/xxx;base64,...). */
  imageUrl?: string;
  /** Original URL (for 'url'). */
  sourceUrl?: string;
  /** Filename for 'file' | 'image'. */
  filename?: string;
  /** Approx. size in bytes. */
  sizeBytes?: number;
  /** Language hint for 'file' | 'snippet' (used for fenced code blocks). */
  language?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  children?: FileEntry[];
}

export interface UserSnippet {
  id: string;
  name: string;
  prefix: string;
  body: string;
  /** Monaco language ids; omit or empty = all languages in snippet provider */
  languages?: string[];
}

/** Config row for MCP-style servers (registry only; full client is planned). */
export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
}

/** Reusable agent prompt presets (shown in AI panel). */
export interface TaskTemplate {
  id: string;
  title: string;
  prompt: string;
}

/** Simple interval-based reminders fired from the main process. */
export interface ScheduledTaskEntry {
  id: string;
  title: string;
  intervalMinutes: number;
  prompt: string;
  lastRunAt: number | null;
  enabled: boolean;
}

/** Payload when localhost webhook POST /hook is received. */
export interface WebhookIncomingPayload {
  path: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  receivedAt: number;
}

/** Fired when a scheduled task interval has elapsed. */
export interface ScheduledTaskDuePayload {
  id: string;
  title: string;
  prompt: string;
  at: number;
}

export interface AppSettings {
  apiKey: string;
  defaultModel: string;
  freeModeStrategy: 'router' | 'cycle';
  fallbackModel: string;
  maxTokens: number;
  temperature: number;
  streaming: boolean;
  includeFullFile: boolean;
  includeProjectTree: boolean;
  theme: 'dark' | 'light' | 'system';
  formatOnSave: boolean;
  /** Preferred terminal shell. '' = auto-detect from platform. */
  defaultShell: string;
  /** Require user confirmation before running AI-proposed terminal commands. */
  confirmBeforeRun: boolean;
  /** Run chat as a multi-turn task with auto-continue + persistence. */
  agentMode: boolean;
  /** Max number of auto-continue iterations before the task pauses. */
  maxAgentIterations: number;
  /** Max tool call hops in a single turn before forcing a response. */
  maxToolHops: number;
  /**
   * When true, the first model call in a tool loop uses agentReadModel (or defaultModel);
   * subsequent hops after tool results use agentReasoningModel for synthesis.
   */
  smartAgentRouting: boolean;
  /** OpenRouter model id for the first hop of tool-using chats (empty = default model). */
  agentReadModel: string;
  /** Model id for later hops after tools run (empty = default model). */
  agentReasoningModel: string;
  /** After a tool-using turn, run a short second pass to critique the answer (extra API call). */
  agentReflectionPass: boolean;
  /**
   * When true, mutating agent tools are unavailable (filtered from the model and blocked if invoked).
   * Read-only exploration: files, search, git status/diff/log, network fetch, memory read.
   */
  agentSandboxMode: boolean;
  /**
   * When true, mutating tools return simulated JSON summaries without applying changes.
   * Ignored for tools removed by sandbox mode. Does not run shell or tests.
   */
  agentDryRunMode: boolean;
  /** Per-tool approval policy (auto/ask/deny). Missing tools default to 'ask'. */
  toolPolicy: Record<string, ToolPolicy>;
  /** Shell command patterns that are always auto-approved. */
  shellAllowlist: string[];
  /** File path glob patterns where writes are always auto-approved. */
  writeAllowPaths: string[];
  /**
   * When true, agent write tools only succeed when the path matches one of writeAllowPaths.
   * Empty allow list blocks all writes (configure allow globs first).
   */
  agentWriteDenyDefault: boolean;
  /** Path globs that are always rejected for agent writes (applied before allow-by-default rules). */
  writeDenyPaths: string[];
  /** Regex strings (matches command) that hard-block run_shell (in addition to built-in guards). */
  shellDenylist: string[];
  /** Enable tool calling. When off, model gets no tools. */
  toolsEnabled: boolean;
  /** Editor settings */
  editor: {
    fontSize: number;
    fontFamily: string;
    fontLigatures: boolean;
    tabSize: number;
    minimap: boolean;
    wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
    lineNumbers: 'on' | 'off' | 'relative' | 'interval';
    bracketPairColorization: boolean;
    stickyScroll: boolean;
    renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
    cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
    cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
    /** AI ghost inline completions (OpenRouter); off by default to save tokens. */
    ghostTextEnabled: boolean;
    ghostTextDebounceMs: number;
    ghostTextCooldownMs: number;
    ghostTextMaxPrefixChars: number;
    ghostTextMaxOutputChars: number;
  };
  /** User-configurable custom action buttons */
  customActions: Array<{
    id: string;
    label: string;
    icon: string;
    prompt: string;
    showInToolbar: boolean;
  }>;
  /** First-run product tour (dismissible) */
  hasCompletedProductTour: boolean;
  /** User-defined editor snippets (prefix → completion body). */
  userSnippets: UserSnippet[];
  /**
   * When true, packaged builds check GitHub/generic update feed on launch and
   * show a toast with “Update now” when a newer version exists.
   */
  autoUpdateEnabled: boolean;
  /** Distraction-free UI: hide side AI chat and minimize chrome. */
  zenMode: boolean;
  /** Show two editor panes side-by-side (same shortcuts; focused pane follows last click). */
  editorSplit: boolean;
  /** Local HTTP webhook (see main webhook server). */
  webhookListenerEnabled: boolean;
  webhookPort: number;
  /** GitHub PAT for optional PR/issue tools (stored in settings file — keep repo private). */
  githubToken: string;
  /** Linear API key (optional integrations). */
  linearApiKey: string;
  /** MCP-style server registry (commands are not auto-started yet). */
  mcpServers: McpServerConfig[];
  /** Task / prompt templates for the AI panel. */
  taskTemplates: TaskTemplate[];
  /** Interval-based scheduled prompts (main process). */
  scheduledTasks: ScheduledTaskEntry[];
  /** Use browser Web Speech API for microphone dictation in the AI panel. */
  voiceInputEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  defaultModel: 'openrouter/auto',
  freeModeStrategy: 'router',
  fallbackModel: '',
  maxTokens: 2048,
  temperature: 0.3,
  streaming: true,
  includeFullFile: false,
  includeProjectTree: true,
  theme: 'light',
  formatOnSave: false,
  defaultShell: '',
  confirmBeforeRun: true,
  agentMode: false,
  maxAgentIterations: 15,
  maxToolHops: 40,
  smartAgentRouting: false,
  agentReadModel: '',
  agentReasoningModel: '',
  agentReflectionPass: false,
  agentSandboxMode: false,
  agentDryRunMode: false,
  toolPolicy: {},
  shellAllowlist: [],
  writeAllowPaths: [],
  agentWriteDenyDefault: false,
  writeDenyPaths: [],
  shellDenylist: [],
  toolsEnabled: true,
  editor: {
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
    fontLigatures: true,
    tabSize: 2,
    minimap: true,
    wordWrap: 'off',
    lineNumbers: 'on',
    bracketPairColorization: true,
    stickyScroll: true,
    renderWhitespace: 'selection',
    cursorBlinking: 'smooth',
    cursorStyle: 'line',
    ghostTextEnabled: false,
    ghostTextDebounceMs: 450,
    ghostTextCooldownMs: 1200,
    ghostTextMaxPrefixChars: 6000,
    ghostTextMaxOutputChars: 256,
  },
  customActions: [],
  hasCompletedProductTour: false,
  userSnippets: [],
  autoUpdateEnabled: true,
  zenMode: false,
  editorSplit: false,
  webhookListenerEnabled: false,
  webhookPort: 17373,
  githubToken: '',
  linearApiKey: '',
  mcpServers: [],
  taskTemplates: [],
  scheduledTasks: [],
  voiceInputEnabled: false,
};

// ================== TOOL CALLING TYPES ==================

/** JSON Schema for a tool parameter */
export interface ToolParameterSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  default?: unknown;
}

/** OpenAI-compatible tool definition */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameterSchema>;
      required?: string[];
    };
  };
}

/** A tool call requested by the model */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string of args
  };
}

/** Result of executing a tool */
export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string; // JSON stringified result or error
}

/** Per-tool approval policy */
export type ToolPolicy = 'auto' | 'ask' | 'deny';

/** Tool approval request sent to the renderer */
export interface ToolApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  preview?: string; // Human-readable preview (file diff, command, etc.)
  riskLevel: 'low' | 'medium' | 'high';
}

/** User's response to a tool approval request */
export interface ToolApprovalResponse {
  id: string;
  action: 'allow' | 'allow_always_tool' | 'allow_always_pattern' | 'deny' | 'deny_stop';
  pattern?: string; // For allow_always_pattern: the path/command pattern
}

/** Tool execution result for the UI */
export interface ToolExecutionEvent {
  requestId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'executing' | 'success' | 'error' | 'denied';
  result?: string;
  error?: string;
  durationMs?: number;
}

/** Extended stream chunk that includes tool call events */
export interface StreamChunkExtended {
  type: 'delta' | 'done' | 'error' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end';
  content?: string;
  error?: string;
  model?: string;
  requestId?: string;
  // Tool call specific
  toolCallId?: string;
  toolCallIndex?: number;
  toolName?: string;
  toolArgsDelta?: string;
}

/** Internal representation of a registered tool */
export interface RegisteredTool {
  name: string;
  description: string;
  category:
    | 'filesystem'
    | 'search'
    | 'shell'
    | 'editor'
    | 'git'
    | 'network'
    | 'diagnostic'
    | 'docs'
    | 'memory'
    | 'agent'
    | 'integration'
    | 'debug';
  riskLevel: 'low' | 'medium' | 'high';
  schema: ToolDefinition['function']['parameters'];
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolHandlerResult>;
}

/** Context passed to every tool handler */
export interface ToolContext {
  projectRoot: string | null;
  /** Active saved task id when the tool runs inside agent mode (for spawn_agent, checkpoints, etc.). */
  activeTaskId?: string | null;
  requestApproval: (preview: string) => Promise<boolean>;
  sendProgress: (message: string) => void;
}

/** Result from a tool handler */
export interface ToolHandlerResult {
  success: boolean;
  result?: unknown;
  error?: string;
  /** For file writes: the diff preview shown to user */
  preview?: string;
}

/** Optional metadata for a tool invocation (IPC → main). */
export interface ToolExecuteMeta {
  /** Links tool runs to the saved agent task (spawn_agent, future checkpoints). */
  taskId?: string;
  requestId?: string;
}

// ================== CHAT TYPES (EXTENDED) ==================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatCompletionRequest {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}

export interface CompletionUsageSnapshot {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Prompt tokens served from cache when provider reports it */
  cached_tokens?: number;
}

/** Local-only counters persisted under Electron userData (never uploaded). */
export interface LocalUsageStats {
  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
  completionsRecorded: number;
  completionsSuccess: number;
  completionsFailure: number;
  toolRunsSuccess: number;
  toolRunsFailure: number;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
}

export interface StreamChunk {
  type: 'delta' | 'done' | 'error' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end';
  content?: string;
  error?: string;
  model?: string;
  requestId?: string;
  usage?: CompletionUsageSnapshot;
  // Tool call specific fields
  toolCallId?: string;
  toolCallIndex?: number;
  toolName?: string;
  toolArgsDelta?: string;
}

export interface OpenRouterError {
  message: string;
  code?: number | string;
  type?: string;
}

/** Terminal session events streamed from main -> renderer. */
export interface TerminalEvent {
  sessionId: string;
  type: 'data' | 'exit' | 'error' | 'started';
  data?: string;
  exitCode?: number | null;
  error?: string;
  shell?: string;
  cwd?: string;
}

export type AgentTaskStatus =
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'paused';

/** Persistent, resumable "agent task" — a long-running chat with a goal. */
export interface AgentTask {
  id: string;
  /** When this task was started by spawn_agent, the parent task id. */
  parentTaskId?: string | null;
  title: string;
  goal: string;
  status: AgentTaskStatus;
  iterations: number;
  maxIterations: number;
  modelUsed: string;
  projectRoot: string | null;
  /** Full message history (persisted for resume). Stringified for portability. */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** Last detected marker text (e.g., "[[BLOCKED: need api key]]"). */
  lastMarker: string | null;
  /** Detailed error if status is 'failed'. */
  lastError: string | null;
  /** Timestamps. */
  createdAt: number;
  updatedAt: number;
}

/** A ruleset entry (e.g., AGENTS.md, .cursor/rules/*.md, user-defined). */
export interface Rule {
  id: string;
  name: string;
  source: 'project' | 'user';
  /** Relative path (for project rules) or '' (for user rules). */
  path: string;
  content: string;
  enabled: boolean;
}

/** Auto-update pipeline events (main → renderer via IPC). */
export type UpdateEvent =
  | { kind: 'checking' }
  | { kind: 'available'; version: string; releaseNotes?: string }
  | { kind: 'not-available' }
  | { kind: 'error'; message: string }
  | { kind: 'download-progress'; percent: number }
  | { kind: 'downloaded'; version: string };

export interface UpdateCheckInvokeResult {
  started: boolean;
  skipReason?: 'development';
  message?: string;
}

export interface DiffPreviewResult {
  ok: boolean;
  hunks?: Array<{
    oldFile: string;
    newFile: string;
    oldStart: number;
    newStart: number;
    lines: string[];
  }>;
  newContent?: string;
  originalContent?: string;
  error?: string;
}

export type GitCloneResult =
  | { ok: true; projectPath: string }
  | { ok: false; error: string };

/** Local email/password account (encrypted vault on disk — no cloud). */
export type AuthSessionInfo = { loggedIn: false } | { loggedIn: true; email: string };

export type AuthSyncResult = { ok: true } | { ok: false; error: string };

/** Whether registration requires the email verification server (see ROUTER_STUDIO_VERIFY_URL). */
export type RegistrationPolicyInfo = {
  needsVerification: boolean;
  hint?: string;
};

export interface IpcApi {
  secureStore: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  };
  auth: {
    registrationPolicy: () => Promise<RegistrationPolicyInfo>;
    requestRegistrationCode: (
      email: string,
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
    verifyRegistrationCode: (
      email: string,
      code: string,
    ) => Promise<
      | { ok: true; registrationToken: string }
      | { ok: false; error: string }
    >;
    register: (
      email: string,
      password: string,
      registrationToken?: string,
    ) => Promise<{ ok: true; email: string } | { ok: false; error: string }>;
    login: (email: string, password: string) => Promise<
      { ok: true; email: string } | { ok: false; error: string }
    >;
    logout: () => Promise<void>;
    session: () => Promise<AuthSessionInfo>;
    syncVault: () => Promise<AuthSyncResult>;
    listAccounts: () => Promise<string[]>;
  };
  fs: {
    openFolder: () => Promise<string | null>;
    setRoot: (root: string) => Promise<boolean>;
    getRoot: () => Promise<string | null>;
    listFiles: () => Promise<FileEntry | null>;
    readFile: (relativePath: string) => Promise<string>;
    /** Same as readFile, but resolves to null when the path is missing (no IPC error log). */
    readFileIfExists: (relativePath: string) => Promise<string | null>;
    writeFile: (relativePath: string, content: string) => Promise<void>;
    createFile: (relativePath: string, content?: string) => Promise<void>;
    deleteFile: (relativePath: string) => Promise<void>;
    renameFile: (oldRelative: string, newRelative: string) => Promise<void>;
    searchFiles: (query: string) => Promise<FileEntry[]>;
    backupFile: (relativePath: string) => Promise<string>;
    /** Native picker for an image; returns data URL + metadata, or null if cancelled. */
    pickImage: () => Promise<{
      filename: string;
      dataUrl: string;
      sizeBytes: number;
    } | null>;
    /** Native picker for a text file; returns content + metadata. */
    pickTextFile: () => Promise<{
      filename: string;
      content: string;
      language: string;
      sizeBytes: number;
    } | null>;
  };
  workspace: {
    pickParentDir: () => Promise<string | null>;
    gitClone: (repoUrl: string, parentDir: string) => Promise<GitCloneResult>;
  };
  context: {
    fetchUrl: (url: string) => Promise<{
      ok: boolean;
      url?: string;
      title?: string;
      text?: string;
      sizeBytes?: number;
      error?: string;
    }>;
  };
  openrouter: {
    testKey: (apiKey: string) => Promise<{ ok: boolean; error?: string }>;
    listModels: (apiKey: string) => Promise<OpenRouterModelRaw[]>;
    chat: (req: ChatCompletionRequest) => Promise<{
      content: string;
      model: string;
      toolCalls?: ToolCall[];
      finishReason?: string;
      usage?: CompletionUsageSnapshot;
    }>;
    chatStreamStart: (req: ChatCompletionRequest) => Promise<string>;
    chatStreamCancel: (requestId: string) => Promise<void>;
  };
  terminal: {
    start: (opts: { shell?: string; cwd?: string; cols?: number; rows?: number }) => Promise<{
      sessionId: string;
      shell: string;
      cwd: string;
    }>;
    write: (sessionId: string, data: string) => Promise<void>;
    run: (sessionId: string, command: string) => Promise<void>;
    kill: (sessionId: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
  };
  rules: {
    scan: () => Promise<Rule[]>;
    getUserRules: () => Promise<Rule[]>;
    saveUserRule: (rule: Omit<Rule, 'source'>) => Promise<Rule>;
    deleteUserRule: (id: string) => Promise<void>;
    setEnabledState: (id: string, enabled: boolean) => Promise<void>;
    getEnabledState: () => Promise<Record<string, boolean>>;
  };
  tasks: {
    list: () => Promise<AgentTask[]>;
    get: (id: string) => Promise<AgentTask | null>;
    save: (task: AgentTask) => Promise<AgentTask>;
    delete: (id: string) => Promise<void>;
  };
  tools: {
    /** Get all registered tools as definitions for the model */
    listDefinitions: () => Promise<ToolDefinition[]>;
    /** Execute a tool (main process handles approval flow) */
    execute: (
      toolName: string,
      args: Record<string, unknown>,
      meta?: ToolExecuteMeta,
    ) => Promise<ToolHandlerResult>;
    /** Get/set per-tool policy */
    getPolicy: (toolName: string) => Promise<ToolPolicy>;
    setPolicy: (toolName: string, policy: ToolPolicy) => Promise<void>;
    /** Manage allowlists */
    addShellAllowPattern: (pattern: string) => Promise<void>;
    removeShellAllowPattern: (pattern: string) => Promise<void>;
    addWriteAllowPath: (glob: string) => Promise<void>;
    removeWriteAllowPath: (glob: string) => Promise<void>;
  };
  events: {
    onChatStream: (cb: (chunk: StreamChunk) => void) => () => void;
    onStreamExtended: (cb: (chunk: StreamChunkExtended) => void) => () => void;
    onTerminal: (cb: (evt: TerminalEvent) => void) => () => void;
    onToolApproval: (cb: (req: ToolApprovalRequest) => void) => () => void;
    onToolExecution: (cb: (evt: ToolExecutionEvent) => void) => () => void;
    onUpdates: (cb: (evt: UpdateEvent) => void) => () => void;
    onWebhook: (cb: (payload: WebhookIncomingPayload) => void) => () => void;
    onScheduledDue: (cb: (payload: ScheduledTaskDuePayload) => void) => () => void;
  };
  /** Respond to a tool approval request */
  respondToolApproval: (response: ToolApprovalResponse) => Promise<void>;
  session: {
    load: () => Promise<SessionState>;
    save: (state: Partial<SessionState>) => Promise<void>;
    clear: () => Promise<void>;
  };
  autosave: {
    save: (relativePath: string, content: string) => Promise<void>;
    load: (relativePath: string) => Promise<AutosaveEntry | null>;
    delete: (relativePath: string) => Promise<void>;
    list: () => Promise<AutosaveEntry[]>;
    clear: () => Promise<void>;
  };
  crash: {
    check: () => Promise<boolean>;
    setCrashFlag: () => Promise<void>;
    clearCrashFlag: () => Promise<void>;
  };
  diagnostics: {
    runAll: () => Promise<import('./diagnostics.js').DiagnosticsByFile>;
    runForFile: (filePath: string) => Promise<import('./diagnostics.js').Diagnostic[]>;
  };
  screenshot: {
    captureAllScreens: () => Promise<Array<{
      id: string;
      name: string;
      dataUrl: string;
      width: number;
      height: number;
    }>>;
    captureRegion: (x: number, y: number, width: number, height: number) => Promise<string>;
    captureFullScreen: () => Promise<string>;
  };
  audit: {
    tailLines: (maxLines: number) => Promise<string[]>;
    getFilePath: () => Promise<string>;
  };
  stats: {
    get: () => Promise<LocalUsageStats>;
    reset: () => Promise<LocalUsageStats>;
  };
  updates: {
    check: () => Promise<UpdateCheckInvokeResult>;
    download: () => Promise<{ ok: boolean; message?: string }>;
    quitAndInstall: () => Promise<void>;
  };
}

// ==================== SESSION TYPES ====================

export interface TabState {
  relativePath: string;
  name: string;
  language: string;
  content: string;
  original: string;
  dirty: boolean;
  cursorLine?: number;
  cursorColumn?: number;
  scrollTop?: number;
}

export interface SessionState {
  version: number;
  projectRoot: string | null;
  /** Absolute paths; MRU order (newest first). Persisted with session. */
  recentProjectRoots: string[];
  tabs: TabState[];
  activeTabPath: string | null;
  sidebarCollapsed: boolean;
  bottomCollapsed: boolean;
  bottomTab: 'output' | 'terminal' | 'problems' | 'tests';
  chat: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  savedAt: number;
}

export interface AutosaveEntry {
  relativePath: string;
  content: string;
  savedAt: number;
}

// Re-export diagnostics types
export type {
  Diagnostic,
  DiagnosticsByFile,
  DiagnosticSeverity,
  DiagnosticRange,
  DiagnosticPosition,
  DiagnosticCounts,
} from './diagnostics.js';

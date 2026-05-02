/**
 * Product backlog — single source of truth for shipped vs planned capability.
 * Shown in-app via Help → Product roadmap (and command palette: type "roadmap"); keep docs/ROADMAP.md aligned at a high level.
 */
export type RoadmapStatus = 'shipped' | 'in_progress' | 'planned';

export interface RoadmapItem {
  id: string;
  title: string;
  /** Extra context for builders / users */
  detail?: string;
  status: RoadmapStatus;
}

export interface RoadmapPhase {
  id: string;
  title: string;
  summary?: string;
  items: RoadmapItem[];
}

export const PRODUCT_ROADMAP: RoadmapPhase[] = [
  {
    id: 'foundation',
    title: 'Foundation & workspace',
    summary: 'Shell, IPC, persistence, workspace onboarding, and packaged updates.',
    items: [
      { id: 'electron-shell', title: 'Electron shell + secure preload bridge', status: 'shipped' },
      {
        id: 'session-restore',
        title: 'Session restore (tabs, layout, chat, recent projects)',
        status: 'shipped',
        detail:
          'session.json restores project root, open tabs, UI panels, chat tail, and an MRU list of project folders (last ~15).',
      },
      {
        id: 'workspace-start',
        title: 'Workspace start screen + git clone + SSH helper',
        status: 'shipped',
        detail:
          'When no editor tabs are open: recent projects, open folder (Ctrl+O), clone via system git into a chosen parent directory, compose ssh / port-forward and send to the integrated terminal.',
      },
      { id: 'settings-sync', title: 'Settings storage + model catalog cache', status: 'shipped', detail: 'Electron userData settings JSON, secureStore for API key, optional local model list cache.' },
      {
        id: 'offline-queue',
        title: 'Offline completion queue + retry',
        status: 'shipped',
        detail: 'Settings → Privacy & reliability: queued OpenRouter completions on network errors; retry/clear without storing the API key in the queue.',
      },
      { id: 'crash-recovery', title: 'Crash detection + autosave recovery UI', status: 'shipped' },
      {
        id: 'auto-update',
        title: 'Auto-update (electron-updater) + release channels',
        status: 'shipped',
        detail:
          'Help → Check for Updates; generic feed via ROUTER_STUDIO_UPDATES_URL or electron-builder publish metadata + signed installers.',
      },
      { id: 'multi-window', title: 'Detached editor / multi-window workspaces', status: 'planned' },
    ],
  },
  {
    id: 'openrouter',
    title: 'Models & routing',
    summary: 'Pick models, filter pricing, and monitor usage.',
    items: [
      { id: 'model-picker', title: 'Model marketplace UI + filters', status: 'shipped' },
      { id: 'free-mode', title: 'Free Mode + router/cycle strategies', status: 'shipped' },
      { id: 'token-meter', title: 'Live token & cost meter + cache hints', status: 'shipped' },
      { id: 'smart-routing', title: 'Smart routing (cheap reads / premium reasoning)', status: 'shipped', detail: 'Settings → Agent Mode: optional read vs reasoning models for tool hops.' },
      {
        id: 'benchmarks',
        title: 'Public benchmark harness & reproducible runs',
        status: 'in_progress',
        detail: 'Command palette → Model Benchmark for local latency probe.',
      },
      {
        id: 'model-evaluator-ui',
        title: 'Built-in model evaluator UI & regression suites',
        status: 'in_progress',
        detail: 'Same benchmark modal; scripted suites still planned.',
      },
    ],
  },
  {
    id: 'editor',
    title: 'Editor & authoring',
    summary: 'Monaco-centric editing with AI-assisted flows.',
    items: [
      { id: 'monaco-core', title: 'Monaco editor + tabs + formatting hooks', status: 'shipped' },
      { id: 'inline-edit', title: 'Inline edit (Ctrl+K) with overlay', status: 'shipped' },
      { id: 'outline', title: 'Outline / symbols + Quick Open @symbol', status: 'shipped' },
      { id: 'problems-ai', title: 'Problems panel + Fix-with-AI', status: 'shipped', detail: 'Main-process diagnostics (TypeScript, ESLint, …) into the bottom Problems tab; jump from diagnostic to chat fixes.' },
      { id: 'find-replace', title: 'Global find & replace with preview', status: 'shipped' },
      { id: 'multi-diff', title: 'Multi-file diff preview for agent edits', status: 'shipped' },
      { id: 'code-actions', title: 'Ctrl+. code actions menu', status: 'shipped' },
      { id: 'sticky-monaco', title: 'Monaco polish (ligatures, sticky scroll, minimap)', status: 'shipped' },
      {
        id: 'app-context-menus',
        title: 'Custom context menus (editor, terminal, explorer)',
        status: 'shipped',
        detail:
          'Portaled menus + capture-phase handlers so Electron does not replace them with the native menu.',
      },
      {
        id: 'ghost-text',
        title: 'Ghost-text autocomplete (FIM / inline)',
        status: 'shipped',
        detail: 'Settings → Editor — AI ghost text; OpenRouter completion with debounce + cooldown.',
      },
      {
        id: 'lsp',
        title: 'LSP via monaco-languageclient (TS, Py, Rust, Go)',
        status: 'in_progress',
        detail: 'lsp_workspace_status tool documents bridge state; editor language service not bundled yet.',
      },
      {
        id: 'treesitter',
        title: 'Tree-sitter grammars + structural navigation',
        status: 'in_progress',
        detail: 'treesitter_outline tool uses regex heuristic today; WASM grammars are a planned upgrade.',
      },
      {
        id: 'split-editor',
        title: 'Split editor, multi-cursor polish, zen mode',
        status: 'shipped',
        detail: 'Zen + side-by-side split + minimap from Settings; detachable panels still planned.',
      },
      {
        id: 'themes',
        title: 'Theme system (dark / light / system + Monaco + terminal)',
        status: 'shipped',
      },
      { id: 'vscode-theme-import', title: 'Import VS Code theme JSON (.tmTheme)', status: 'planned' },
      {
        id: 'snippets',
        title: 'User snippets + AI-generated snippets',
        status: 'shipped',
        detail: 'Settings JSON + Monaco completions; save_user_snippet tool for the agent.',
      },
      {
        id: 'rich-hover',
        title: 'Rich hover tooltips (docs, refs)',
        status: 'in_progress',
        detail: 'Singleton hover provider; deeper symbol docs still planned.',
      },
    ],
  },
  {
    id: 'agent',
    title: 'Agent, tools & chat',
    summary: 'Agent loop, tool registry, approvals, skills, and productivity UX.',
    items: [
      {
        id: 'tool-runtime',
        title: 'Streaming tool cards + registry + IPC + approval flows',
        status: 'shipped',
        detail:
          'ToolApprovalModal: ask/auto/deny per tool, shell command regex allowlist, optional always-allow for paths or patterns.',
      },
      {
        id: 'fs-tools',
        title: 'Filesystem agent tools + diff preview routing',
        status: 'shipped',
        detail: 'read_file, write_file, edit_file, create_file, delete_file, list_dir, stat_file.',
      },
      {
        id: 'editor-agent-tools',
        title: 'Editor context tools for the agent',
        status: 'shipped',
        detail: 'open_file, get_open_tabs, get_editor_selection.',
      },
      {
        id: 'search-tools',
        title: 'Search tools (ripgrep, files, symbols)',
        status: 'shipped',
        detail: 'grep, find_files, search_symbols against the open project.',
      },
      {
        id: 'shell-tools',
        title: 'Shell tool (run_shell) + safety filters',
        status: 'shipped',
        detail:
          'One-shot commands in the project root with timeouts, dangerous-pattern blocks, and approval when policy is ask.',
      },
      {
        id: 'git-tools',
        title: 'Git agent tools (status through commit)',
        status: 'shipped',
        detail:
          'git_status, git_diff, git_log, git_add, git_branch, git_commit. Push/pull and other flows: Git panel, terminal, or run_shell.',
      },
      {
        id: 'doc-tools',
        title: 'First-class doc lookup tools (MDN, npm, PyPI, package README)',
        status: 'planned',
        detail:
          'Planned dedicated tools; today fetch_url / run_shell / chat context cover many lookups.',
      },
      {
        id: 'net-tools',
        title: 'HTTP fetch tools (URL + JSON)',
        status: 'shipped',
        detail: 'fetch_url and fetch_json with size limits for agent context.',
      },
      {
        id: 'diag-tests-tool',
        title: 'run_tests agent tool (framework auto-detect)',
        status: 'shipped',
        detail: 'Invokes common test runners in the project root; pairs with the Tests panel UI.',
      },
      {
        id: 'read-diagnostics-tool',
        title: 'read_diagnostics agent tool (Problems / linters)',
        status: 'shipped',
        detail:
          'Returns TypeScript / ESLint / Python diagnostics for one file or a capped multi-file summary (same pipeline as Problems panel).',
      },
      { id: 'thinking-panel', title: 'Reasoning / thinking panel for CoT models', status: 'shipped' },
      { id: 'rules-skills', title: 'Rules & skill files + toggles', status: 'shipped' },
      { id: 'slash-commands', title: 'Slash commands + user extensions', status: 'shipped' },
      { id: 'custom-actions', title: 'Configurable action buttons', status: 'shipped' },
      { id: 'tasks-ui', title: 'Persisted agent tasks browser + resume', status: 'shipped' },
      { id: 'memory', title: 'Per-project agent memory (set/list/forget)', status: 'shipped', detail: 'memory_set, memory_get, memory_list, memory_forget tools + UI.' },
      { id: 'context-pack', title: 'Smart context packer + compaction', status: 'shipped' },
      { id: 'attachment-cap', title: 'Screenshots + URL + snippet attachments', status: 'shipped' },
      { id: 'suggestions', title: 'Suggested next actions after turns', status: 'shipped' },
      { id: 'fork-branch', title: 'Fork conversation / branch from message', status: 'shipped' },
      { id: 'edit-message', title: 'Edit past user messages + branch', status: 'shipped' },
      {
        id: 'voice',
        title: 'Voice input (Whisper / local)',
        status: 'in_progress',
        detail: 'Optional Web Speech mic in AI panel (Settings); Whisper/API path still planned.',
      },
      {
        id: 'sub-agents',
        title: 'Sub-agents + spawn_agent tool + child task tree',
        status: 'shipped',
        detail:
          'spawn_agent creates a paused child AgentTask (parentTaskId); Tasks list indents children; tool loop passes activeTaskId from agent mode.',
      },
      { id: 'reflection', title: 'Reflection / self-critique pass', status: 'shipped', detail: 'Optional second completion after tool-using turns (Settings → Agent Mode).' },
      {
        id: 'semantic-search',
        title: 'Semantic codebase search (BM25 chunk index + tools)',
        status: 'shipped',
        detail:
          'semantic_search, reindex_codebase, and find_similar tools in the main process — lexical relevance without native embedding deps.',
      },
      {
        id: 'task-dag-viz',
        title: 'Task DAG visualization (branching runs)',
        status: 'shipped',
        detail: 'Tasks modal copies parent/child graph as Mermaid; live graph UI optional later.',
      },
    ],
  },
  {
    id: 'panels',
    title: 'Panels & productivity',
    summary: 'Explorer-adjacent workflows, onboarding, and command surfaces.',
    items: [
      { id: 'sidebar-tree', title: 'Explorer file tree + file search', status: 'shipped' },
      { id: 'git-panel', title: 'Full source control panel + AI commit message', status: 'shipped' },
      { id: 'tests-panel', title: 'Test runner panel + framework detect', status: 'shipped' },
      { id: 'terminal', title: 'Integrated terminal (spawn-based)', status: 'shipped' },
      { id: 'palette', title: 'Command palette (Ctrl+Shift+P)', status: 'shipped', detail: 'Fuzzy command search; try "roadmap", "backlog", or "stats" to jump to Help entries.' },
      { id: 'quick-open', title: 'Quick open + symbol picker', status: 'shipped' },
      { id: 'notifications', title: 'Toast / notification system', status: 'shipped' },
      { id: 'welcome-tour', title: 'First-run interactive tour', status: 'shipped' },
      {
        id: 'devtools-integrations',
        title: 'GitHub / GitLab / Linear / Jira integrations',
        status: 'in_progress',
        detail: 'GitHub + Linear agent tools with tokens in Settings; GitLab/Jira still planned.',
      },
      {
        id: 'layout-drag',
        title: 'Tab drag, detachable panels, zen layout presets',
        status: 'shipped',
        detail: 'Tab reorder + zen + split shipped; detachable floating panels still planned.',
      },
      {
        id: 'task-runner',
        title: 'Build/task runner with clickable output links',
        status: 'in_progress',
        detail: 'run_npm_script tool + terminal; clickable links polish still planned.',
      },
      {
        id: 'dap',
        title: 'Debug Adapter Protocol (Node + Python)',
        status: 'in_progress',
        detail: 'debug_adapter_status tool; adapters not bundled yet.',
      },
      {
        id: 'docker',
        title: 'Docker / container tools',
        status: 'shipped',
        detail: 'docker_ps agent tool wrapping the Docker CLI.',
      },
      {
        id: 'database',
        title: 'DB inspector + db_query tool',
        status: 'shipped',
        detail: 'sqlite_query tool via sqlite3 CLI (SELECT-safe by default).',
      },
    ],
  },
  {
    id: 'extensibility',
    title: 'Extensibility',
    summary: 'MCP, plugins, and user-defined automation.',
    items: [
      {
        id: 'mcp-client',
        title: 'Full MCP client + server registry UI',
        status: 'in_progress',
        detail: 'Settings MCP JSON registry + list_mcp_servers tool; process supervision planned.',
      },
      {
        id: 'custom-tools-ts',
        title: 'Sandboxed custom tools (.opencode/tools/*.ts)',
        status: 'in_progress',
        detail: 'list_opencode_custom_tools discovery; execution sandbox not enabled yet.',
      },
      {
        id: 'plugins',
        title: 'Plugin system with typed host API',
        status: 'in_progress',
        detail: 'plugin_registry_status stub reports host readiness.',
      },
      {
        id: 'webhooks',
        title: 'Local webhook listener for external triggers',
        status: 'shipped',
        detail: 'POST /hook on localhost + toast in renderer.',
      },
      {
        id: 'templates',
        title: 'Task templates library',
        status: 'shipped',
        detail: 'JSON templates + AI panel picker + add_task_template tool.',
      },
      {
        id: 'scheduled',
        title: 'Scheduled / background tasks',
        status: 'shipped',
        detail: 'JSON scheduled tasks in Settings; main process fires toasts on interval.',
      },
      {
        id: 'export-replay',
        title: 'Task export/share + replay',
        status: 'in_progress',
        detail: 'Tasks modal exports JSON + export_agent_task tool; replay UX minimal.',
      },
      {
        id: 'checkpoints',
        title: 'File snapshots + rewind to turn N',
        status: 'in_progress',
        detail: 'workspace_snapshot_save + list_workspace_snapshots; rewind UI later.',
      },
    ],
  },
  {
    id: 'safety',
    title: 'Safety, trust & governance',
    summary: 'Protect secrets, writes, and shell execution.',
    items: [
      { id: 'secret-redact', title: 'Secret redaction in chat + tool outputs', status: 'shipped' },
      {
        id: 'tool-policies-settings',
        title: 'Per-tool allow / ask / deny + shell & write allowlists (Settings)',
        status: 'shipped',
        detail: 'Agent tool policy table, shell regex allow patterns, and optional write path allows; complements the in-chat approval modal.',
      },
      { id: 'audit-log', title: 'Append-only tool audit log', status: 'shipped', detail: 'JSONL under userData; Settings → Privacy & reliability: preview tail + copy file path.' },
      {
        id: 'shell-analyzer',
        title: 'Shell static hints + configurable deny regex list',
        status: 'shipped',
        detail:
          'Heuristic shell hints on run_shell results; Settings → Shell deny list blocks matching commands; built-in dangerous-pattern guard remains.',
      },
      {
        id: 'write-safety',
        title: 'Deny-by-default paths + undo_agent_writes stack',
        status: 'shipped',
        detail:
          'Optional deny-by-default via write allow globs, explicit write deny globs, and undo_agent_writes to revert recent write/create/edit snapshots in session.',
      },
      {
        id: 'sandbox-toggle',
        title: 'Read-only sandbox mode for agent tools',
        status: 'shipped',
        detail: 'Settings + AiPanel; catalog filter + runtime blocks.',
      },
      {
        id: 'dry-run',
        title: 'Dry-run mode for mutating tools (simulated results)',
        status: 'shipped',
        detail: 'Returns JSON with dry_run: true; no disk or shell side effects.',
      },
    ],
  },
  {
    id: 'polish',
    title: 'Accessibility, telemetry & packaging',
    summary: 'Ship-quality polish across platforms.',
    items: [
      {
        id: 'a11y-pass',
        title: 'Accessibility audit (contrast, roles, keyboard)',
        status: 'in_progress',
        detail: 'Incremental labels (AI input, mic, send); full audit ongoing.',
      },
      {
        id: 'stats-panel',
        title: 'Local-only usage statistics panel',
        status: 'shipped',
        detail: 'Persisted JSON under userData; Help menu + command palette.',
      },
      {
        id: 'docs-site',
        title: 'Static docs site',
        status: 'shipped',
        detail: 'docs/index.html in repo root.',
      },
      {
        id: 'landing',
        title: 'Marketing landing + public benchmarks page',
        status: 'shipped',
        detail: 'src/renderer/public/landing.html + in-app model benchmark.',
      },
      {
        id: 'ci-release-matrix',
        title: 'CI release matrix + signed artifacts per OS',
        status: 'in_progress',
        detail: 'electron-builder zip + nsis/dmg targets; CI signing pipeline separate.',
      },
      { id: 'signing', title: 'Platform signing + notarization matrix', status: 'planned', detail: 'CI secrets & electron-builder profiles.' },
    ],
  },
];

export function roadmapCounts(): Record<RoadmapStatus | 'total', number> {
  let shipped = 0;
  let in_progress = 0;
  let planned = 0;
  for (const p of PRODUCT_ROADMAP) {
    for (const i of p.items) {
      if (i.status === 'shipped') shipped++;
      else if (i.status === 'in_progress') in_progress++;
      else planned++;
    }
  }
  return {
    shipped,
    in_progress,
    planned,
    total: shipped + in_progress + planned,
  };
}

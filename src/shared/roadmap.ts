/**
 * Product backlog — single source of truth for shipped vs planned capability.
 * Shown in-app via Help → Product roadmap; keep docs/ROADMAP.md aligned at a high level.
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
    summary: 'Shell, IPC, persistence, and OpenRouter connectivity.',
    items: [
      { id: 'electron-shell', title: 'Electron shell + secure preload bridge', status: 'shipped' },
      { id: 'session-restore', title: 'Session restore (tabs, layout, chat)', status: 'shipped' },
      { id: 'settings-sync', title: 'Settings storage + model catalog cache', status: 'shipped' },
      { id: 'offline-queue', title: 'Offline completion queue + retry', status: 'shipped' },
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
      { id: 'smart-routing', title: 'Smart routing (cheap reads / premium reasoning)', status: 'planned' },
      { id: 'benchmarks', title: 'Public benchmark harness & reproducible runs', status: 'planned' },
      {
        id: 'model-evaluator-ui',
        title: 'Built-in model evaluator UI & regression suites',
        status: 'planned',
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
      { id: 'problems-ai', title: 'Problems panel + Fix-with-AI', status: 'shipped' },
      { id: 'find-replace', title: 'Global find & replace with preview', status: 'shipped' },
      { id: 'multi-diff', title: 'Multi-file diff preview for agent edits', status: 'shipped' },
      { id: 'code-actions', title: 'Ctrl+. code actions menu', status: 'shipped' },
      { id: 'sticky-monaco', title: 'Monaco polish (ligatures, sticky scroll, minimap)', status: 'shipped' },
      { id: 'ghost-text', title: 'Ghost-text autocomplete (FIM / inline)', status: 'planned' },
      { id: 'lsp', title: 'LSP via monaco-languageclient (TS, Py, Rust, Go)', status: 'planned' },
      { id: 'treesitter', title: 'Tree-sitter grammars + structural navigation', status: 'planned' },
      { id: 'split-editor', title: 'Split editor, multi-cursor polish, zen mode', status: 'planned' },
      {
        id: 'themes',
        title: 'Theme system (dark / light / system + Monaco + terminal)',
        status: 'shipped',
      },
      { id: 'vscode-theme-import', title: 'Import VS Code theme JSON (.tmTheme)', status: 'planned' },
      { id: 'snippets', title: 'User snippets + AI-generated snippets', status: 'planned' },
      { id: 'rich-hover', title: 'Rich hover tooltips (docs, refs)', status: 'planned' },
    ],
  },
  {
    id: 'agent',
    title: 'Agent, tools & chat',
    summary: 'Agent loop, approvals, skills, and productivity UX.',
    items: [
      { id: 'tool-runtime', title: 'Streaming tool cards + registry + IPC', status: 'shipped' },
      { id: 'fs-tools', title: 'Filesystem tools + diff preview routing', status: 'shipped' },
      { id: 'search-tools', title: 'Ripgrep / find / symbol search tools', status: 'shipped' },
      { id: 'shell-tools', title: 'Shell tools + approvals + background jobs', status: 'shipped' },
      { id: 'git-tools', title: 'Git tools (status, commit, push, …)', status: 'shipped' },
      { id: 'doc-tools', title: 'MDN / npm / PyPI / package-docs tools', status: 'shipped' },
      { id: 'net-tools', title: 'fetch_url / web_search / JSON helpers', status: 'shipped' },
      { id: 'thinking-panel', title: 'Reasoning / thinking panel for CoT models', status: 'shipped' },
      { id: 'rules-skills', title: 'Rules & skill files + toggles', status: 'shipped' },
      { id: 'slash-commands', title: 'Slash commands + user extensions', status: 'shipped' },
      { id: 'custom-actions', title: 'Configurable action buttons', status: 'shipped' },
      { id: 'tasks-ui', title: 'Persisted agent tasks browser + resume', status: 'shipped' },
      { id: 'memory', title: 'Per-project agent memory (set/list/forget)', status: 'shipped' },
      { id: 'context-pack', title: 'Smart context packer + compaction', status: 'shipped' },
      { id: 'attachment-cap', title: 'Screenshots + URL + snippet attachments', status: 'shipped' },
      { id: 'suggestions', title: 'Suggested next actions after turns', status: 'shipped' },
      { id: 'fork-branch', title: 'Fork conversation / branch from message', status: 'shipped' },
      { id: 'edit-message', title: 'Edit past user messages + branch', status: 'shipped' },
      { id: 'voice', title: 'Voice input (Whisper / local)', status: 'planned' },
      { id: 'sub-agents', title: 'Sub-agents + spawn_agent tool + child task tree', status: 'planned' },
      { id: 'reflection', title: 'Reflection / self-critique pass', status: 'planned' },
      { id: 'semantic-search', title: 'Semantic codebase search (embeddings + sqlite-vec)', status: 'planned' },
      {
        id: 'task-dag-viz',
        title: 'Task DAG visualization (branching runs)',
        status: 'planned',
      },
    ],
  },
  {
    id: 'panels',
    title: 'Panels & productivity',
    summary: 'Explorer-adjacent workflows and command surfaces.',
    items: [
      { id: 'sidebar-tree', title: 'Explorer file tree + context menu', status: 'shipped' },
      { id: 'git-panel', title: 'Full source control panel + AI commit message', status: 'shipped' },
      { id: 'tests-panel', title: 'Test runner panel + framework detect', status: 'shipped' },
      { id: 'terminal', title: 'Integrated terminal (spawn-based)', status: 'shipped' },
      { id: 'palette', title: 'Command palette (Ctrl+Shift+P)', status: 'shipped' },
      { id: 'quick-open', title: 'Quick open + symbol picker', status: 'shipped' },
      { id: 'notifications', title: 'Toast / notification system', status: 'shipped' },
      { id: 'welcome-tour', title: 'First-run interactive tour', status: 'shipped' },
      {
        id: 'devtools-integrations',
        title: 'GitHub / GitLab / Linear / Jira integrations',
        status: 'planned',
      },
      { id: 'layout-drag', title: 'Tab drag, detachable panels, zen layout presets', status: 'planned' },
      { id: 'task-runner', title: 'Build/task runner with clickable output links', status: 'planned' },
      { id: 'dap', title: 'Debug Adapter Protocol (Node + Python)', status: 'planned' },
      { id: 'docker', title: 'Docker / container tools', status: 'planned' },
      { id: 'database', title: 'DB inspector + db_query tool', status: 'planned' },
    ],
  },
  {
    id: 'extensibility',
    title: 'Extensibility',
    summary: 'MCP, plugins, and user-defined automation.',
    items: [
      { id: 'mcp-client', title: 'Full MCP client + server registry UI', status: 'planned' },
      { id: 'custom-tools-ts', title: 'Sandboxed custom tools (.opencode/tools/*.ts)', status: 'planned' },
      { id: 'plugins', title: 'Plugin system with typed host API', status: 'planned' },
      { id: 'webhooks', title: 'Local webhook listener for external triggers', status: 'planned' },
      { id: 'templates', title: 'Task templates library', status: 'planned' },
      { id: 'scheduled', title: 'Scheduled / background tasks', status: 'planned' },
      { id: 'export-replay', title: 'Task export/share + replay', status: 'planned' },
      { id: 'checkpoints', title: 'File snapshots + rewind to turn N', status: 'planned' },
    ],
  },
  {
    id: 'safety',
    title: 'Safety, trust & governance',
    summary: 'Protect secrets, writes, and shell execution.',
    items: [
      { id: 'secret-redact', title: 'Secret redaction in chat + tool outputs', status: 'shipped' },
      { id: 'audit-log', title: 'Append-only tool audit log', status: 'shipped' },
      { id: 'shell-analyzer', title: 'Shell static analyzer + policy DSL', status: 'planned' },
      { id: 'write-safety', title: 'Deny-by-default paths + undo-all-writes', status: 'planned' },
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
      { id: 'a11y-pass', title: 'Accessibility audit (contrast, roles, keyboard)', status: 'planned' },
      {
        id: 'stats-panel',
        title: 'Local-only usage statistics panel',
        status: 'shipped',
        detail: 'Persisted JSON under userData; Help menu + command palette.',
      },
      { id: 'docs-site', title: 'Static docs site', status: 'planned' },
      { id: 'landing', title: 'Marketing landing + public benchmarks page', status: 'planned' },
      {
        id: 'ci-release-matrix',
        title: 'CI release matrix + signed artifacts per OS',
        status: 'planned',
        detail: 'electron-builder targets, secrets, upload pipelines.',
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

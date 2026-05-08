/**
 * Compact synopsis of which tools exist for **this turn**, grouped for routing hints.
 * Kept lightweight to avoid duplicating OpenAI `tools[]` payloads.
 */

/** Tool names grouped by suggested workflow phase (subset must match registered tool ids). */
const TOOL_GROUPS: { phase: string; hint: string; names: readonly string[] }[] = [
  {
    phase: 'Discover',
    hint: 'map layout, locate symbols, read sources',
    names: [
      'list_dir',
      'read_file',
      'stat_file',
      'grep',
      'find_files',
      'search_symbols',
      'semantic_search',
      'find_similar',
      'reindex_codebase',
      'treesitter_outline',
      'get_open_tabs',
      'get_editor_selection',
      'list_recent_writes',
    ],
  },
  {
    phase: 'Change',
    hint: 'apply edits on disk (prefer edit_file over full rewrites)',
    names: [
      'edit_file',
      'write_file',
      'create_file',
      'delete_file',
      'rename_file',
      'undo_agent_writes',
      'open_file',
    ],
  },
  {
    phase: 'Run & verify',
    hint: 'shell, tests, diagnostics, IDE language services',
    names: ['run_shell', 'run_tests', 'run_npm_script', 'read_diagnostics', 'lsp_workspace_status', 'debug_adapter_status'],
  },
  {
    phase: 'SCM',
    hint: 'inspect and record history before shipping',
    names: ['git_status', 'git_diff', 'git_log', 'git_add', 'git_commit', 'git_branch'],
  },
  {
    phase: 'Network & docs',
    hint: 'HTTP and package/API references',
    names: ['fetch_url', 'fetch_json', 'lookup_npm_package', 'lookup_pypi_package', 'lookup_mdn_doc'],
  },
  {
    phase: 'Browser',
    hint: 'driving the embedded preview',
    names: [
      'browser_open',
      'browser_screenshot',
      'browser_click',
      'browser_type',
      'browser_console_logs',
      'browser_eval',
      'browser_wait_for_text',
      'browser_get_dom',
    ],
  },
  {
    phase: 'Memory & tasks',
    hint: 'session memory and sub-agent handoff',
    names: ['memory_set', 'memory_get', 'memory_list', 'memory_forget', 'spawn_agent'],
  },
  {
    phase: 'Integrations',
    hint: 'MCP, issues, snapshots, snippets',
    names: [
      'docker_ps',
      'sqlite_query',
      'github_list_issues',
      'linear_list_issues',
      'list_mcp_servers',
      'mcp_sessions_status',
      'mcp_session_start',
      'mcp_session_stop',
      'mcp_tools_list',
      'mcp_tools_call',
      'mcp_server_probe',
      'list_opencode_custom_tools',
      'plugin_registry_status',
      'export_agent_task',
      'workspace_snapshot_save',
      'list_workspace_snapshots',
      'save_user_snippet',
      'add_task_template',
      'list_scheduled_tasks',
    ],
  },
];

/** Appended to the system prompt only when native tool calling is active for this turn. */
export function buildToolSessionGuide(availableToolNames: string[]): string {
  const set = new Set(availableToolNames);
  if (set.size === 0) return '';

  const lines: string[] = [
    `### Tools wired this turn (${set.size})`,
    'Prefer **discovery tools** (\`list_dir\`, \`grep\`, \`read_file\` with ranges, \`semantic_search\`) before mutating files. Use **only** paths relative to the project root.',
  ];

  for (const g of TOOL_GROUPS) {
    const found = g.names.filter((n) => set.has(n));
    if (!found.length) continue;
    lines.push(`- **${g.phase}** (${g.hint}): ${found.map((n) => `\`${n}\``).join(', ')}`);
  }

  const grouped = new Set(TOOL_GROUPS.flatMap((g) => g.names));
  const remainder = [...set].filter((n) => !grouped.has(n)).sort();
  if (remainder.length) {
    lines.push(`- **Other:** ${remainder.map((n) => `\`${n}\``).join(', ')}`);
  }

  return lines.join('\n');
}

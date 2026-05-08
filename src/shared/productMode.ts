import type { ProductMode } from './types.js';

/** Ordered for Ctrl+Shift+1 … Ctrl+Shift+7 shortcuts. */
export const PRODUCT_MODE_SEQUENCE: readonly ProductMode[] = [
  'chat',
  'learn',
  'edit',
  'agent',
  'architect',
  'review',
  'ship',
] as const;

/** Tools that mutate the repo, environment, or spawn child agents (denied in readonly modes). */
const MUTATING_OR_HIGH_RISK = new Set<string>([
  'write_file',
  'edit_file',
  'create_file',
  'delete_file',
  'rename_file',
  'undo_agent_writes',
  'run_shell',
  'git_add',
  'git_commit',
  'run_tests',
  'memory_set',
  'memory_forget',
  'spawn_agent',
  'sqlite_query',
  'workspace_snapshot_save',
  'save_user_snippet',
  'add_task_template',
  'run_npm_script',
  'export_agent_task',
  'browser_click',
  'browser_type',
  'browser_eval',
  'mcp_session_start',
  'mcp_session_stop',
  'mcp_tools_call',
]);

/** Ship mode: release-focused subset (no arbitrary code edits or shell). */
const SHIP_ALLOW = new Set<string>([
  'read_file',
  'list_dir',
  'stat_file',
  'list_recent_writes',
  'grep',
  'find_files',
  'search_symbols',
  'semantic_search',
  'reindex_codebase',
  'find_similar',
  'open_file',
  'get_open_tabs',
  'get_editor_selection',
  'git_status',
  'git_diff',
  'git_log',
  'git_add',
  'git_commit',
  'git_branch',
  'run_tests',
  'read_diagnostics',
  'fetch_url',
  'fetch_json',
  'lookup_npm_package',
  'lookup_pypi_package',
  'lookup_mdn_doc',
  'memory_get',
  'memory_list',
  'list_mcp_servers',
  'mcp_sessions_status',
  'mcp_tools_list',
  'mcp_server_probe',
  'list_opencode_custom_tools',
  'plugin_registry_status',
  'list_workspace_snapshots',
  'treesitter_outline',
  'lsp_workspace_status',
  'debug_adapter_status',
  'list_scheduled_tasks',
  'docker_ps',
  'github_list_issues',
  'linear_list_issues',
  'browser_open',
  'browser_screenshot',
  'browser_console_logs',
  'browser_wait_for_text',
  'browser_get_dom',
]);

export function isAgentProtocolProductMode(mode: ProductMode): boolean {
  return mode === 'agent' || mode === 'architect' || mode === 'ship';
}

export function isToolAllowedInProductMode(mode: ProductMode, toolName: string): boolean {
  switch (mode) {
    case 'chat':
    case 'learn':
    case 'architect':
    case 'review':
      return !MUTATING_OR_HIGH_RISK.has(toolName);
    case 'edit':
    case 'agent':
      return true;
    case 'ship':
      return SHIP_ALLOW.has(toolName);
    default:
      return true;
  }
}

/** Migrate legacy agentMode when settings never stored productMode. */
export function defaultProductModeFromLegacy(agentMode: boolean): ProductMode {
  return agentMode ? 'agent' : 'chat';
}

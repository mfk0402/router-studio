# Router Studio — product roadmap

**Canonical source:** [`src/shared/roadmap.ts`](../src/shared/roadmap.ts). The app renders this under **Help → Product roadmap** (command palette: **roadmap**). **Help → Local usage statistics** opens disk-only counters. **Help → Check for Updates…** runs electron-updater in packaged builds.

## Status meanings

| Status | Meaning |
| ------ | ------- |
| **Shipped** | In the current codebase |
| **In progress** | Partial / MVP — see per-item detail |
| **Planned** | Backlog |

## Phases (summary)

1. **Foundation** — Electron shell, session restore, welcome flow, offline queue, crash recovery, auto-update; **planned:** multi-window.
2. **Models** — Marketplace, free mode, token/cost meter, smart read/reasoning routing; **in progress:** scripted benchmark suites.
3. **Editor** — Monaco, Ctrl+K inline edit, outline, Problems + Fix-with-AI, multi-diff, find/replace, ghost text, zen/split, themes, usernippets; **in progress:** LSP bridge, Tree-sitter WASM, richer hovers; **planned:** VS Code .tmTheme import.
4. **Agent & tools** — Tool runtime, approvals, filesystem/editor/search/shell/git/fetch/**read_diagnostics**/tests/memory, semantic search (BM25), spawn_agent, reflection, tasks, webhooks, templates, scheduled toasts, voice (Web Speech); **planned:** dedicated MDN/npm doc tools, Whisper path.
5. **Panels** — Explorer, Git panel, tests, terminal, palette, GitHub/Linear tools; **in progress:** full PR/issue flows, DAP adapters, clickable task output.
6. **Extensibility** — MCP registry JSON, custom tool discovery, plugin status, snapshots; **in progress:** MCP process host, sandboxed `.opencode` execution, checkpoint rewind UI.
7. **Safety** — Redaction, audit log, policies, sandbox & dry-run, shell/write guards + undo writes.
8. **Polish** — Stats panel, static `docs/index.html`, landing asset, benchmark modal; **in progress:** a11y audit, CI signing matrix.

## Auto-updates

Packaged builds use **electron-updater**. Set **`ROUTER_STUDIO_UPDATES_URL`** or **`build.publish`** so `latest.yml` and installers are reachable.

## Contributing

Implement against existing `src/main/tools` + IPC patterns, then update **`roadmap.ts`** statuses and this file at a high level when behavior changes materially.

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
9. **Next-gen strategy** — Long-horizon Phases **11–35** in [`ROUTER_STUDIO_NEXT_GEN_ROADMAP.md`](../ROUTER_STUDIO_NEXT_GEN_ROADMAP.md); **Phase 36** ties that doc to `roadmap.ts`. In-app rollup under **Next-generation roadmap** (`ng-*` ids: phases 11–32 themes plus Phases **34–35** review items).

## Next-gen doc

Full strategic backlog (model router v2, codebase intelligence, MCP marketplace, performance, remote agents): **[`ROUTER_STUDIO_NEXT_GEN_ROADMAP.md`](../ROUTER_STUDIO_NEXT_GEN_ROADMAP.md)**. Update **`src/shared/roadmap.ts`** when items become shipped or WIP.

Packaged builds use **electron-updater**. Set **`ROUTER_STUDIO_UPDATES_URL`** or **`build.publish`** so `latest.yml` and installers are reachable.

## Contributing

Implement against existing `src/main/tools` + IPC patterns, then update **`roadmap.ts`** statuses and this file at a high level when behavior changes materially. Strategic phases **11–35** live in **`ROUTER_STUDIO_NEXT_GEN_ROADMAP.md`** (see Phase 36 there for traceability).

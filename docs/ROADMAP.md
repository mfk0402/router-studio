# Router Studio — product roadmap

**Canonical source:** [`src/shared/roadmap.ts`](../src/shared/roadmap.ts). Update that file when priorities change; the app renders the same data under **Help → Product roadmap** (and **Command palette → “Open Product Roadmap”**). **Help → Local usage statistics** opens privacy-preserving counters stored only on disk (`local-usage-stats.json` under Electron userData). **Help → Check for Updates…** (or palette **Check for Updates**) runs the updater in packaged builds.

## Status meanings

| Status       | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| **Shipped**  | Available in the current codebase snapshot           |
| **In progress** | Actively being built — rare until work starts    |
| **Planned**  | Scoped backlog — design and sequencing may change    |

## Phases (summary)

1. **Foundation & workspace** — Shell, IPC, session restore, offline queue, crash recovery, auto-update (configure feed — see below); planned: multi-window.
2. **Models & routing** — Marketplace, free mode, cost meter; planned: smart routing, public benchmarks, built-in evaluator UI.
3. **Editor & authoring** — Monaco, inline edit, outline, problems, multi-diff, find/replace, dark/light/system themes; planned: ghost text, LSP, Tree-sitter, VS Code theme import, snippets.
4. **Agent, tools & chat** — Full tool suite, memory, context packer, slash commands, tasks; planned: voice, sub-agents, task DAG viz, reflection, semantic codebase search.
5. **Panels & productivity** — Explorer, Git panel, tests, terminal, palette; planned: GitHub/GitLab/Linear/Jira, advanced layout, DAP, Docker, DB tools.
6. **Extensibility** — Planned: MCP client, custom tools, plugins, webhooks, templates, checkpoints.
7. **Safety & governance** — Secret redaction, audit log, agent sandbox & dry-run shipped; planned: shell analyzer, path deny defaults + undo writes.
8. **Polish & packaging** — Local usage stats shipped (privacy-preserving); planned: a11y pass, static docs site, CI releases, signing.

## Auto-updates (packaged builds)

The main process wires **electron-updater**. **Help → Check for Updates…** (or the command palette) triggers a check; dev builds report that updates apply only to packaged installs.

Configure either:

- **`ROUTER_STUDIO_UPDATES_URL`** — generic provider root hosting `latest.yml` (and installers) produced by `electron-builder publish`, or  
- **`build.publish`** in `package.json` — so `latest.yml` is embedded for your chosen provider.

## Contributing

- Pick an item in **`planned`** (or extend **`in_progress`**), implement behind the existing IPC/tool patterns, then flip its `status` in `roadmap.ts` and ship.
- Large epics (e.g. LSP, MCP) should be split into smaller roadmap rows before marking **shipped**.

# Router Studio

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

**One workspace for every AI model.**

Router Studio is a **desktop IDE** (Electron) for coding with [**OpenRouter**](https://openrouter.ai/)—pick any catalog model, attach repo context, and iterate with chat and agent-style workflows. Your OpenRouter key stays **on device**; the app does not ship first-party telemetry.

**Repository:** [github.com/mfk0402/router-studio](https://github.com/mfk0402/router-studio) · **Issues:** [github.com/mfk0402/router-studio/issues](https://github.com/mfk0402/router-studio/issues) · **Releases:** [github.com/mfk0402/router-studio/releases](https://github.com/mfk0402/router-studio/releases)

This repo is **the open-source app itself**—Electron + React source, build scripts, and docs in-tree. There is no separate marketing website in the project; ship installers via **Releases** when you publish builds, and point newcomers at this README plus [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Highlights

| Area | What you get |
|------|----------------|
| **Models** | Searchable marketplace with categories, price tiers (`Free` / `$` / `$$` / `$$$`), sorting, and quick picks |
| **Editor** | Monaco—tabs, split view, Format Document / Format on Save, Quick Open, 60+ languages |
| **AI panel** | Streaming chat, context attachments (file, selection, tree, URLs, images), optional agent-style loops |
| **Rules** | Discovers `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/*`, toggles per rule |
| **Terminal** | xterm.js in the bottom panel; commands from AI require explicit approval |
| **Trust** | Project sandbox, optional shell/write policies, secret patterns redacted in logs |

---

## Quick start

**Requirements:** Node.js **20+**, npm **10+**

```bash
git clone https://github.com/mfk0402/router-studio.git
cd router-studio
npm install
npm run dev
```

**Build installers**

```bash
npm run build:win    # Windows (NSIS + zip)
npm run build:mac    # macOS (dmg + zip)
npm run build:linux  # Linux (AppImage)
```

**Quality gate**

```bash
npm run typecheck
npm run verify      # typecheck + production renderer/main build
```

---

## OpenRouter API key

1. Create an account at [openrouter.ai](https://openrouter.ai/).
2. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys) (typically `sk-or-…`).
3. In Router Studio: **Settings** → paste key → **Test API Key**.

Billing and model availability follow OpenRouter’s terms—not Router Studio.

---

## Feature overview

### Free Mode

Restrict requests to free-tier routing via Settings:

- **OpenRouter Free Router** — `openrouter/free`.
- **Cycle discovered free models** — rotates eligible `:free` / zero-price models with retries.

Optional **fallback model** if the primary free route fails.

### Rules & skill files

Project-scoped files are scanned at open:

`AGENTS.md`, `CLAUDE.md`, `.opencoderules`, `.cursorrules`, `.cursor/rules/*.md`, `.cursor/rules/*.mdc`

Manage toggles with **Rules** (`Ctrl/Cmd + Shift + R`). Enabled fragments prepend to the system prompt each turn.

### Agent Mode

Agent Mode runs multi-turn work with explicit completion markers (`[[TASK_COMPLETE]]`, `[[CONTINUE]]`, `[[BLOCKED]]`, `[[ERROR]]`). Tasks checkpoint under local user data for resume after interruptions.

Configure iteration caps and workflows in Settings and Rules—see in-app **Product roadmap** and Tasks UI.

### Model marketplace

Open via **Models** or `Ctrl/Cmd + Shift + M`.

Categories include coding, general chat, reasoning, vision, image/audio/video modalities where catalog entries exist, fast picks, large context (e.g. ≥128K), and free tiers—with sidebar counts and blended price bands.

Tier badges summarize averaged \$ per million tokens. Detailed detection lives in [`src/renderer/lib/modelFilters.ts`](src/renderer/lib/modelFilters.ts).

### Context attachments

Use **Attach** for images (vision models), stripped web pages, files, and snippets—with drag‑drop and paste support where enabled.

### Terminal

Integrated shell (platform default). AI‑proposed command blocks show **Run** only after you confirm—nothing executes unattended.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save |
| `Shift + Alt + F` | Format Document |
| `Ctrl/Cmd + P` | Quick Open |
| `Ctrl/Cmd + Shift + A` | Focus AI panel |
| `Ctrl/Cmd + Enter` | Send prompt |
| `Ctrl/Cmd + Shift + M` | Model picker |
| `Ctrl/Cmd + Shift + R` | Rules |
| `Ctrl/Cmd + Shift + T` | Tasks |
| `Ctrl/Cmd + \`` | Terminal |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + ,` | Settings |

---

## Project layout

```
src/
├── main/           Electron main (IPC, FS sandbox, OpenRouter, sessions, …)
├── preload/        contextBridge API
├── renderer/       React UI (Monaco, panels, stores)
└── shared/         Shared TypeScript types & URLs
```

---

## Privacy & security

- Keys stored locally (`safeStorage` when the OS supports it).
- Code leaves your machine only when you invoke AI features against OpenRouter.
- No bundled telemetry—optional maintainer tooling documented in [SECURITY.md](SECURITY.md).

Never commit `.env`, tokens, or `secrets.*` files—see [`.env.example`](.env.example).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs should pass `npm run verify`.

---

## License

[MIT](LICENSE)

---

## Disclaimer

Router Studio is **not affiliated** with OpenRouter or model providers. You are responsible for complying with each provider’s terms.

---

## Publishing checklist (maintainers)

Before going public:

1. Audit history for secrets (`sk-or-`, `ghp_`, embedded credentials, machine paths).
2. Confirm `.gitignore` excludes `out/`, `release/`, `node_modules/`, `.env*`.
3. `repository` / `bugs` / `homepage` in [`package.json`](package.json) match **mfk0402/router-studio** (already set).
4. Push `main`, enable branch protection, verify **SECURITY.md** private reporting.

**Initial push (if starting from this clone)**

```bash
git add -A
git status    # confirm no secrets / build artifacts
git commit -m "chore: initial Router Studio import"
git branch -M main
git remote add origin https://github.com/mfk0402/router-studio.git
git push -u origin main
```

Then adjust visibility on GitHub when ready.

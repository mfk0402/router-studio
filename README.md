# Router Studio

[![CI](https://github.com/mfk0402/router-studio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mfk0402/router-studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

**One workspace for every AI model.**

Router Studio is a **desktop IDE** (Electron) for coding with [**OpenRouter**](https://openrouter.ai/)—pick any catalog model, attach repo context, and iterate with chat and agent-style workflows. Your OpenRouter key stays **on device**; the app does not ship first-party telemetry.

**Repository:** [github.com/mfk0402/router-studio](https://github.com/mfk0402/router-studio) · **Issues:** [github.com/mfk0402/router-studio/issues](https://github.com/mfk0402/router-studio/issues) · **Releases:** [github.com/mfk0402/router-studio/releases](https://github.com/mfk0402/router-studio/releases)

**Ways to run**

| Path | Best for |
|------|-----------|
| Clone + **`npm run dev`** | Contributors and daily development |
| **GitHub Releases** (installers + zip) | Users who want a normal desktop install |
| **`npx router-studio`** (after **`npm run verify`**) | Skip unsigned installers; npm pulls Electron when needed |

This repo is **the open-source app itself**—Electron + React source, build scripts, and docs in-tree. There is no separate marketing website in the project; **README**, **Releases**, and **optional npm** are the public storefront—see [`CONTRIBUTING.md`](CONTRIBUTING.md).

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

On **Windows**, prefer the **64-bit (x64)** Node installer. If `npm run dev` fails with a missing `@rollup/rollup-win32-…` package, run **`npm install`** again (the repo lists Rollup native addons as **optionalDependencies**), or follow the `[postinstall]` error text.

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

**Run from the terminal (skip the `.exe` installer)**

Router Studio is still the **same Electron desktop app**—not a TUI like Claude Code—but you can start it from any shell so users avoid downloading an unsigned NSIS installer:

```bash
npm run verify       # once: writes production bundles to ./out
npx router-studio    # or: npx router (same command)
```

After a global link from the repo (`npm link`), both `router` and `router-studio` are on your `PATH`. **electron-builder** requires `electron` in **devDependencies**, so production-only installs resolve Electron via **`npx`** on first launch (network required once). From a **clone**, `npm install` includes Electron locally and avoids that step.

**Quality gate**

```bash
npm run typecheck
npm run verify      # typecheck + production renderer/main build (= npm test)
npm run pack:check  # dry-run npm tarball (CI runs this too)
```

---

## Deploy & showcase on GitHub

**CI:** Every push and PR runs **`npm ci`**, **`npm run verify`**, and **`npm pack --dry-run`** on Ubuntu and Windows (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)). The badge at the top of this README links to the Actions tab.

**GitHub repository “About” box (manual)**

- **Description:** e.g. *Desktop OpenRouter IDE — Electron + Monaco, agent workflows, local-only keys.*
- **Website:** `https://github.com/mfk0402/router-studio#readme` (or your npm package URL after publish).
- **Topics:** e.g. `electron`, `openrouter`, `monaco-editor`, `react`, `typescript`, `ai`, `ide`, `desktop-app`.

**GitHub Releases**

1. Locally: `npm run verify`, then platform builds (`npm run build:win` / `build:mac` / `build:linux`).
2. Upload **`release/`** artifacts (installer, `.zip`, `.blockmap` where produced) and write short release notes (features, breaking changes, signing status).

**npm registry (optional)**

1. Confirm the package name **`router-studio`** is available (or scope it, e.g. `@your-scope/router-studio`, and update `name` + docs).
2. **`npm run verify`** so `./out` exists (it is gitignored but **included** in the packed tarball via the `files` field in [`package.json`](package.json)).
3. **`npm publish`** (with MFA / automation token as you prefer).

**Security before going wider**

1. Audit history for secrets (`sk-or-`, `ghp_`, embedded credentials, machine paths).
2. Confirm `.gitignore` excludes `out/`, `release/`, `node_modules/`, `.env*`.
3. `repository` / `bugs` / `homepage` in [`package.json`](package.json) match **mfk0402/router-studio**.
4. Branch protection on `main`; **SECURITY.md** reporting path is correct.

**Initial remote (if starting from this clone)**

```bash
git add -A
git status    # confirm no secrets / stray artifacts
git commit -m "chore: initial Router Studio import"
git branch -M main
git remote add origin https://github.com/mfk0402/router-studio.git
git push -u origin main
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

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs should pass **`npm test`** / **`npm run verify`**.

---

## License

[MIT](LICENSE)

---

## Disclaimer

Router Studio is **not affiliated** with OpenRouter or model providers. You are responsible for complying with each provider’s terms.

# Router Studio

**One workspace for every AI model.**

A modern AI-powered workspace powered by **OpenRouter**. Use any model on
OpenRouter, or enable **Free Mode** to route exclusively through free models.

- Electron + React + TypeScript + Vite
- Monaco editor with tabs, 60+ languages auto-detected, Format Document + Format on Save
- File explorer sandboxed to a chosen project folder
- Dynamic OpenRouter model **Marketplace** — category sidebar (Coding, Vision,
  Image gen, Video gen, Audio, Reasoning, Fast, Large context, Free, …), price
  tier filters (`Free` / `$` / `$$` / `$$$`), sorting by price/context, and
  Cheapest / Balanced / Premium one-click picks per category
- Free Mode with two strategies: OpenRouter free router or cycle discovered free models
- Streaming chat with context-aware prompts (current file, selection, project tree)
- Action buttons: Explain, Fix Bug, Refactor, Generate, Comments, Unit Test
- **Rules / skill files** — auto-discovers `AGENTS.md`, `CLAUDE.md`, `.opencoderules`,
  `.cursorrules`, `.cursor/rules/*.md(c)`, plus per-user rules, and injects enabled
  ones into the system prompt
- **Integrated terminal** (xterm.js) with cross-platform shells; AI can propose
  commands via fenced `bash`/`powershell`/`cmd` blocks and you approve them with
  a click
- **Context adder** — attach images (for vision-capable models), web pages
  (fetched + HTML stripped), any text/code file, or pasted snippets; also
  supports drag-and-drop and clipboard paste directly onto the AI panel
- Safe diff preview / Apply as patch flow with automatic backups
- Local-only storage (no backend, no telemetry)

## Getting Started

### Prerequisites
- Node.js **20+**
- npm **10+**

### Install
```bash
npm install
```

### Run in dev
```bash
npm run dev
```

This launches both the Vite dev server for the renderer and the Electron main
process.

### Build desktop app
```bash
npm run build         # produces out/ + release/ (unpackaged dir)
npm run build:win     # Windows NSIS installer
npm run build:mac     # macOS dmg
npm run build:linux   # Linux AppImage
```

### Type-check
```bash
npm run typecheck
```

## Get an OpenRouter API Key

1. Sign up at <https://openrouter.ai>
2. Visit <https://openrouter.ai/keys> and create a key (starts with `sk-or-...`)
3. In Router Studio, open **Settings** and paste the key.
4. Click **Test API Key** to verify connectivity.

## How Free Mode Works

Free Mode restricts all AI requests to free models.

Two strategies are available in Settings:

1. **OpenRouter Free Router** — Sends your request to the pseudo-model
   `openrouter/free`. OpenRouter automatically routes it to whichever free model
   is currently available.
2. **Cycle Discovered Free Models** — The app scans all OpenRouter models it
   fetched and picks one whose pricing is `0 / 0` or whose id contains `:free`.
   If that model fails, it tries the next one (up to 3 attempts), round-robin.

If a free model is rate-limited or unavailable, and you have configured a
**Fallback Model** in Settings, the app will try it once.

Free Mode availability depends on OpenRouter — rate limits and free-tier
availability are not guaranteed.

## Privacy

- Your API key is stored locally on your machine. When available, Electron's
  `safeStorage` encrypts it with the OS keystore (Keychain on macOS, DPAPI on
  Windows, libsecret on Linux). If unavailable, it is base64-encoded in a
  local-only file clearly marked as such.
- **Your code is only sent to OpenRouter** when you explicitly ask the AI for
  help. File reads/writes happen locally.
- No telemetry, no analytics, no cloud database.
- File operations are sandboxed to the project folder you open; path traversal
  is blocked.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + S` | Save active file (with Format on Save if enabled) |
| `Shift + Alt + F` | Format Document (Monaco built-in) |
| `Ctrl/Cmd + P` | Quick open (go to file) |
| `Ctrl/Cmd + Shift + A` | Focus AI panel |
| `Ctrl/Cmd + Enter` | Send AI prompt |
| `Ctrl/Cmd + Shift + M` | Open model picker |
| `Ctrl/Cmd + Shift + R` | Open Rules manager |
| `Ctrl/Cmd + Shift + T` | Open Tasks manager |
| `Ctrl/Cmd + \`` | Focus Terminal |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + ,` | Open Settings |

## Rules / Skill Files

Rules are plain-text instructions the AI always follows. On project open the app
looks for these files at the project root:

- `AGENTS.md`
- `CLAUDE.md`
- `.opencoderules` / `.opencoderules.md`
- `.cursorrules`
- `.cursor/rules/*.md` and `.cursor/rules/*.mdc`

Plus any **user-level rules** you add (which travel with you across projects).

Open the Rules manager with `Ctrl/Cmd + Shift + R` or the "Rules (N)" button in
the AI panel. Toggle individual rules on/off; enabled rules are concatenated and
appended to the system prompt on every AI request.

**Built-in "Agent Discipline" rule.** The first time you launch the app, a
user-level rule called *Agent Discipline (built-in)* is installed and enabled.
It enforces a Staff-engineer workflow (ANALYZE → VERIFY → BREAK DOWN →
IMPLEMENT → VALIDATE → SYNTHESIZE), an anti-hallucination policy, and — most
importantly — the `[[TASK_COMPLETE]] / [[CONTINUE]] / [[BLOCKED]] / [[ERROR]]`
completion protocol that Agent Mode uses to drive multi-turn tasks. You can
edit or disable it from the Rules manager at any time. It is not re-installed
on subsequent launches, so your edits stick.

## Agent Mode (long tasks, auto-continue, crash-proof)

Agent Mode turns the chat into an autonomous task runner instead of a single
request/response. Toggle it from the checkbox next to **Free Mode** in the AI
panel, or enable it by default in Settings.

When Agent Mode is on, every response from the model **must** end with exactly
one of these markers on its own line:

| Marker | Meaning | Runner behavior |
|---|---|---|
| `[[TASK_COMPLETE]]` | The goal is fully satisfied. | Stop. Task marked `completed`. |
| `[[CONTINUE]]` | More work needed, continue on the next turn. | Auto-send `Continue.` up to the iteration cap. |
| `[[BLOCKED: <reason>]]` | Needs info/access the agent can't obtain. | Stop. Task marked `blocked`, reason shown in the status bar. |
| `[[ERROR: <reason>]]` | Unrecoverable error (lint / compile / tool failure). | Stop. Task marked `failed`, error saved for retry. |

A status bar at the top of the AI panel shows the current task, iteration
count, and last marker/error. Buttons include **Stop** (halts the loop after
the current turn), **Resume** (sends one more `Continue.`), and **New task**.

**Persistence and resume.** Every assistant turn is checkpointed to disk as a
JSON blob in your OS userData dir under `tasks/<id>.json`. If the app crashes,
the process is killed, or you hit the iteration cap, the task is recoverable:

- Open the **Tasks** modal from the button in the AI panel header.
- Pick any task to inspect its goal, full message history, last marker, and
  last error.
- Click **Resume** to rehydrate the chat and (if the task was `blocked` or
  `paused`) click **Resume** again in the status bar to let the agent pick up
  exactly where it left off.

**Safety rails.** The loop stops automatically on any of:

- Terminal marker (`TASK_COMPLETE` / `BLOCKED` / `ERROR`).
- Missing marker (model ignored the protocol) — prevents runaway loops with
  non-compliant models.
- Iteration cap reached (`maxAgentIterations` in Settings, default **15**,
  range 1–100).
- Network / API error — the task is saved as `failed` with the exact error
  text so you can fix and retry.
- User clicks **Stop** — the current streaming turn completes, but no further
  auto-continue happens.

Agent Mode still routes through whatever model you've selected (including Free
Mode), respects your rules, and uses the same attachments / context controls
as normal chat.

## Model Marketplace

Open with `Ctrl/Cmd + Shift + M` or the **Models** button in the top bar.

**Categories** (left sidebar). Each category shows its model count and price range:

| Category | Detection |
|---|---|
| **Coding** | id/name contains `code`, `coder`, `deepseek`, `qwen`, `claude`, `sonnet`, `gpt`, `dev`, `agent`, `instruct`, `granite` |
| **Chat / General** | default bucket for plain text→text models |
| **Reasoning** | `reason`, `thinking`, `o1`, `o3`, `o4`, `r1`, `qwq`, `deepthink` |
| **Vision** | OpenRouter `input_modalities: [image]` OR name heuristics (GPT-4o, Claude 3+, Gemini, Pixtral, Qwen-VL, LLaVA, Grok Vision, Phi-3-Vision, InternVL) |
| **Image generation** | `output_modalities: [image]` OR `dall-e`/`flux`/`stable-diffusion`/`sdxl`/`imagen`/`midjourney`/`ideogram`/… |
| **Video generation** | `output_modalities: [video]` OR `veo`/`sora`/`pika`/`runway`/`mochi`/`ltx-video`/`hailuo`/`kling`/`luma`/`hunyuan-video` |
| **Audio / voice** | audio modality OR `whisper`/`tts`/`eleven`/`suno`/`bark`/`parler` |
| **Fast** | `flash` / `haiku` / `mini` / `nano` / `lite` / `turbo` / `small` |
| **Large context** | ≥ 128K tokens |
| **Free** | pricing `0/0` or id contains `:free` |

**Price tiers** are computed from the averaged input+output price per million tokens:

- **FREE** — zero cost
- **$** — < $0.50 /M tokens
- **$$** — $0.50 – $5 /M tokens
- **$$$** — > $5 /M tokens

Filter chips are multi-select, so e.g. `Coding + ($ + $$)` shows affordable coders.

**Quick-pick cards** at the top of the list always expose the **Cheapest**,
**Balanced** (median-priced), and **Premium** (highest-priced) model in the
current category. One click sets it as the active model.

Each row shows exact per-token pricing, context length, tier badge, and
multimodal/category tags (`vision`, `image-gen`, `video-gen`, `audio`,
`reasoning`, `coding`, `fast`).

> **Note on image/video generation on OpenRouter**: OpenRouter's catalog is
> primarily text + vision models. Image and video generation models are a
> growing but small slice. The Image-gen and Video-gen categories will only
> populate if OpenRouter is actually serving such a model on your key —
> if a category shows `0 models`, that's why.

## Context Adder

Click **+ Attach** in the AI panel's input row to add any of the following to
the next AI request:

| Kind | Behavior |
|---|---|
| **Image** | Picks a file (png/jpg/gif/webp/bmp, ≤5 MB), encodes it as a data URL, and sends it as a real `image_url` part to OpenRouter. Requires a vision-capable model — the app warns you if your selected model likely isn't. |
| **Web page (URL)** | Fetches the URL in the main process, extracts text from HTML (strips `<script>`/`<style>` etc., decodes entities, collapses whitespace), and attaches up to 40K characters as a labelled block. Times out after 15s. |
| **File** | Opens a native picker filtered to common code/text file types (≤1 MB). Content is inlined in a fenced code block with the correct language. |
| **Snippet** | A small textarea where you can paste arbitrary text / code / a stack trace and label it. |

Shortcuts that skip the menu:

- **Drag & drop** any image or text file onto the AI panel — you'll see a "Drop to attach" overlay.
- **Paste** an image from your clipboard (Win+Shift+S screenshot, etc.) directly into the prompt textarea.

Attachments are cleared automatically after each send. You can remove individual
chips or "Clear all" while composing.

## Integrated Terminal

The bottom panel has an **Output** tab (app logs) and a **Terminal** tab
(xterm.js) that spawns a real shell:

- Windows: `%COMSPEC%` → PowerShell by default
- macOS / Linux: `$SHELL` → bash/zsh/etc.

Override via **Settings → Default Shell**. The session starts in the open
project folder when available.

When the AI returns a fenced code block tagged `bash`, `sh`, `shell`, `zsh`,
`powershell`, `pwsh`, `cmd`, or `bat`, a "Run" button appears on it. Clicking
Run (after an optional confirmation dialog) sends the command to the active
terminal session. **No command is ever auto-executed — a click is always
required.** Multi-line blocks only send the first line; paste the rest yourself
if you trust it.

> **Scope note:** the terminal uses plain `child_process` (no native PTY), so
> ANSI colors and simple command-and-output workflows work, but full-screen TUI
> programs (vim, htop, etc.) may not render perfectly. Adding `node-pty` would
> fix that at the cost of a per-platform native compile.

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── main.ts        # App entry, window creation, security
│   ├── ipc.ts         # IPC handlers registration
│   ├── fileSystem.ts  # Sandboxed file operations
│   ├── openrouter.ts  # OpenRouter HTTP + SSE streaming
│   └── secureStore.ts # safeStorage-backed key storage
├── preload/
│   └── preload.ts     # contextBridge API exposure
├── renderer/
│   ├── App.tsx        # App layout + global shortcuts
│   ├── main.tsx       # React entry
│   ├── components/    # UI components
│   ├── store/         # Zustand stores
│   ├── lib/           # Utilities
│   └── styles/        # Tailwind + custom CSS
└── shared/
    └── types.ts       # Shared TS types for main + renderer
```

## Disclaimer

This project is not affiliated with OpenRouter or any of the models it routes
to. You are responsible for following each model's terms of use.

## License

[MIT](LICENSE).

## Security

See [SECURITY.md](SECURITY.md). **Never commit** API keys, tokens, or `.env` files with secrets. The OpenRouter key is stored only in local app data (`secureStorage` when the OS supports it). Optional maintainer env vars are documented in [`.env.example`](.env.example).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs should pass `npm run verify`.

## Open-sourcing this repo (maintainers)

Before making the GitHub repository public:

1. Confirm **no secrets** in history: search the tree for `sk-or-v1-`, `ghp_`, `Bearer `, private URLs with embedded credentials, and personal machine paths.
2. Ensure **`out/`**, **`release/`**, **`node_modules/`**, and **`.env*`** are never tracked (see [`.gitignore`](.gitignore)).
3. Replace the **`repository` / `bugs` / `homepage`** fields in [`package.json`](package.json) with your real org/repo URLs.
4. Add **branch protection** and **SECURITY.md** (already present) so GitHub enables private vulnerability reporting.

### First-time clone & push

```bash
git init
git add -A
git status   # review: should not list out/, release/, .env, or secrets
git commit -m "chore: initial open-source import"
git branch -M main
git remote add origin https://github.com/<your-org>/<your-repo>.git
git push -u origin main
```

Then on GitHub: **Settings → General → Danger Zone → Change repository visibility → Public** (only when the steps above are satisfied).

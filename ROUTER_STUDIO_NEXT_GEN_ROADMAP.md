# Router Studio — Next-Generation IDE Roadmap

**Purpose:** This file is a second-stage feature and optimization roadmap for Router Studio after the original OpenRouter-powered Cursor-like editor feature set has been completed.

**Goal:** Move Router Studio from a strong AI code editor into a serious Cursor / VS Code / Windsurf / Cline competitor with model routing, agent orchestration, project intelligence, extension support, local privacy options, performance tuning, and professional developer workflows.

**Positioning statement:**

> Router Studio is a model-flexible, OpenRouter-native AI IDE that gives developers Cursor-style productivity, VS Code-style extensibility, Cline-style tool transparency, Windsurf-style codebase awareness, and enterprise-grade control over cost, privacy, and automation.

## Document roles (read this first)

| Artifact | Purpose |
|----------|---------|
| **`ROUTER_STUDIO_NEXT_GEN_ROADMAP.md`** (this file) | Long-horizon strategy: Phases **11–35**, competitive framing, suggested sprint order, acceptance checklist. |
| **`src/shared/roadmap.ts`** | **Canonical shipped / in-progress / planned** IDs rendered in-app (**Help → Product roadmap**). Update statuses there when code lands. |
| **`docs/ROADMAP.md`** | Short human summary; keep aligned when phases shift materially. |

**Living baseline:** Cursor-Killer–class work (product modes, PBV checklist, Composer, injection guard, shell risk scoring, sensitive-path policy, Playwright browser tools) is reflected in `roadmap.ts` under the **Agent** phase. Strategic detail stays in Phase **33–34** below; detailed checkbox truth lives in **Phase 36**.

---

## 0. Competitive Feature Targets

Router Studio should not simply copy Cursor or VS Code. It should combine the best ideas from multiple tools:

| Competitor Pattern | What Users Like | Router Studio Opportunity |
|---|---|---|
| Cursor | Agent mode, inline edit, tab autocomplete, codebase context | Build stronger model routing, cheaper BYOK workflows, and transparent tool logs |
| VS Code | Extensions, LSP, DAP, Git, terminal, customization | Support VS Code-compatible workflows and import settings/themes/keybindings |
| Windsurf | Cascade, persistent memories, flow-state UX, contextual awareness | Build project memory, real-time user-intent tracking, task planning, and multi-step flows |
| Cline | Open source, Plan/Act mode, MCP tools, per-action approval | Add robust tool approval, tool audit logs, Plan/Build/Verify modes |
| Claude Code / Codex-style agents | Terminal-first autonomy and background coding | Add task sessions, worktrees, checkpoints, remote/mobile task control, PR generation |
| JetBrains | Deep language intelligence and refactoring | Add LSP + Tree-sitter + semantic symbol graph + AI refactor recipes |

---

# Phase 11 — Router Studio Identity & Product Differentiators

The first version made Router Studio an AI code editor. This phase makes it feel like a product with a clear advantage.

## 11.1 Product-Level Modes

Add top-level working modes visible in the app header:

### Chat Mode
For explaining, asking questions, and low-risk code help.

### Edit Mode
For direct inline changes, selected-code refactors, quick fixes, and single-file updates.

### Agent Mode
For multi-step tasks where the AI can inspect files, run commands, edit code, test, and iterate.

### Architect Mode
For planning large features before writing code. The model must create:
- Requirements
- File impact map
- Data flow
- Risk list
- Implementation stages
- Test plan
- Rollback plan

### Review Mode
For code review, PR review, security review, and bug finding.

### Learn Mode
For explaining a codebase to new developers.

**Shipped product modes (v1)** are: **Chat**, **Edit**, **Agent**, **Architect**, **Review**, **Ship** — see `ProductMode` in `src/shared/types.ts`. **Learn** remains a **planned** first-class mode (or equivalent onboarding preset); until then, use **Chat** with codebase-exploration prompts and rules.

### Ship Mode
For final testing, build checks, changelog generation, commit message, release notes, and PR creation.

## 11.2 Router Studio Command Language

Create a natural command system that feels unique.

Examples:

```text
@file src/App.tsx explain this
@folder src/main refactor ipc safety
@agent build login system from spec.md
@review check this branch against main
@test run only failing tests and fix them
@docs generate setup guide
@route use cheap models until a write is needed
@free try this using free OpenRouter models only
```

**Incremental ship (app):** On send, the AI panel expands leading directives in `src/renderer/lib/routerCommandLanguage.ts`: **`@free`** (Free Mode for that message only), **`@route`** (forces smart read/reason split for that tool-using turn), **`@file`**, **`@folder`**, **`@docs`**, **`@test`**, **`@learn`**. `@file` / `@folder` accept quoted paths. Combine with **`@chat` … `@ship`** mode prefixes (`src/renderer/lib/modePrefix.ts`). Deeper @-grammar (e.g. branch-aware `@review`) remains planned.

## 11.3 Model-Aware Branding

Router Studio should show why its name matters:

- Live model routing graph
- "Why this model?" explanation
- Cost estimate before sending
- Current model role:
  - Planner
  - Coder
  - Reviewer
  - Summarizer
  - Autocomplete
  - Embeddings
- Ability to compare 2-4 models on the same prompt
- Built-in model leaderboard per user/project

---

# Phase 12 — Advanced OpenRouter Model Router

This is the feature that can make Router Studio better than fixed-provider IDEs.

## 12.1 Model Profiles

Create reusable model profiles.

Example profiles:

```json
{
  "name": "Cheap Daily Driver",
  "planner": "openrouter/auto",
  "coder": "qwen/qwen-2.5-coder",
  "reviewer": "deepseek/deepseek-r1",
  "summarizer": "google/gemini-flash",
  "autocomplete": "openrouter/free",
  "maxCostPerTask": 0.25
}
```

Built-in profiles:
- Free Only
- Cheapest Usable
- Balanced
- Best Coding
- Best Reasoning
- Local-First
- Privacy-Safe
- Big Context
- Fast Autocomplete
- Debugging Specialist
- Frontend Specialist
- Backend Specialist
- Code Review Specialist

**Incremental ship (app):** Settings → **Model profile** applies built-in presets from `src/shared/modelProfiles.ts` (balanced, cheap reads → strong synthesis, free-only, coding/reasoning/big-context). Persisted as **`activeModelProfile`**; manual edits switch to **Custom**. Role-specific planner/coder/reviewer IDs, budgets, and persistence beyond defaults remain Phase **12** backlog.

## 12.2 Skill-Based Model Routing

Route by task type:

| Task | Suggested Routing Logic |
|---|---|
| Explain code | cheap fast model |
| Generate new feature | strong coding model |
| Debug failing tests | reasoning model |
| Refactor large files | coding + reviewer model |
| Summarize terminal output | cheap summarizer |
| Autocomplete | fastest low-latency model |
| Security audit | reasoning + security-tuned prompt |
| UI generation | frontend-tuned model |
| Regex / migration scripts | reasoning model |
| Long repo analysis | large-context model |

## 12.3 Dynamic Fallback Chain

Every request should have fallbacks:

```text
Primary model fails
→ retry once
→ fallback same tier
→ fallback cheaper tier
→ fallback OpenRouter auto
→ fallback free mode if user allows
→ show final error
```

For free models:
- Detect rate limit
- Rotate to next free model
- Keep per-model cooldown timers
- Show "free model pool health"

## 12.4 Cost Guardrails

Add:

- Per-request cost estimate
- Per-task budget
- Per-day budget
- Per-model budget
- Warning before expensive large-context requests
- "Never use models over $X / 1M tokens"
- "Use premium only after user approval"
- "Use premium only for writes"
- Token/cost timeline per agent task

## 12.5 Model Quality Memory

Router Studio should learn which models perform best for the user.

Track locally:
- Model used
- Task type
- User accepted changes?
- Tests passed?
- Number of retries
- Cost
- Latency
- User rating thumbs up/down

Use this to recommend:
- "This model has worked best for React edits in this repo."
- "This model frequently fails shell tasks."
- "This model is cheap but often needs retries."

## 12.6 Model Tournament Mode

Let users run the same prompt through multiple models.

Use cases:
- Compare code suggestions
- Pick the best implementation
- Generate multiple UI designs
- Debug with multiple reasoning paths

UI:
- Split-pane responses
- Vote winner
- Merge best ideas
- Save winner as preferred model for that task type

---

# Phase 13 — Codebase Intelligence Engine

Cursor-like apps win when they understand the whole project. Router Studio needs a serious project intelligence layer.

## 13.1 Project Graph

Build a graph database or SQLite-backed graph of:

- Files
- Symbols
- Functions
- Classes
- Imports
- Exports
- Routes
- Components
- API endpoints
- Database tables
- Environment variables
- Test files
- Config files
- Build scripts
- Package dependencies

Example relationship types:

```text
File A imports File B
Component X renders Component Y
API route /api/users calls function getUsers()
Function saveUser writes to table users
Test file user.test.ts tests userService.ts
```

## 13.2 "Ask the Codebase" Upgrade

The chat should answer questions using the project graph:

Examples:
- "Where is authentication handled?"
- "What files are involved in checkout?"
- "What would break if I rename this function?"
- "Show the path from this button click to the database write."
- "Which files are dead code?"
- "Which components use this API endpoint?"

## 13.3 Smart Indexing

Indexing should be:
- Incremental
- Debounced
- Per-language aware
- Git-aware
- Ignores `node_modules`, build output, `.git`, vendor folders
- Shows index status
- Supports manual reindex
- Detects stale index
- Supports index reset

## 13.4 Symbol-Level Context Packing

When sending context to an AI model, do not only send raw files. Send:
- Current symbol
- Parent class/function
- Imports
- Related type definitions
- Called functions
- Tests for this symbol
- Recent git diff
- Error diagnostics
- Similar code patterns

## 13.5 Architecture Map View

Add a visual architecture graph:
- Nodes = modules/files/services/components
- Edges = imports/calls/data flow
- Click node to open file
- Ask AI about selected node
- Filter by frontend/backend/database/tests
- Highlight files affected by current agent task

## 13.6 Dead Code & Risk Detection

Add tools:
- Find unused files
- Find unused exports
- Find circular dependencies
- Find large files
- Find risky dependencies
- Find TODO/FIXME clusters
- Find duplicate logic
- Find untested critical paths

AI actions:
- "Clean this safely"
- "Create tests for this risky area"
- "Explain why this dependency cycle exists"

---

# Phase 14 — Agent Planning, Execution & Verification

Most AI IDEs fail because the agent either does too little or does too much. Router Studio should make agent work inspectable and safe.

## 14.1 Plan → Build → Verify Loop

Every agent task should move through:

1. Understand request
2. Inspect relevant files
3. Create plan
4. Ask for approval if risky
5. Make changes
6. Run tests/build
7. Fix failures
8. Summarize exact changes
9. Offer commit/PR

The UI should show a checklist:

```text
[✓] Read package.json
[✓] Found auth flow
[✓] Created implementation plan
[✓] Edited 4 files
[✓] Ran npm test
[!] 2 tests failed
[✓] Fixed failing tests
[✓] Build passed
```

## 14.2 Agent Roles

Add selectable roles:

### Implementer
Writes code.

### Reviewer
Finds bugs and reviews diffs.

### Tester
Writes and runs tests.

### Architect
Plans large features.

### Debugger
Focuses on failing tests and logs.

### Security Auditor
Checks secrets, injection, auth, permissions.

### Performance Engineer
Finds slow code and bundle issues.

### Documentation Writer
Creates README, docs, comments, changelogs.

## 14.3 Multi-Agent Workbench

For larger tasks, allow multiple agents:

Example:

```text
Architect agent creates plan
Coder agent implements
Tester agent writes tests
Reviewer agent reviews
Fixer agent handles failures
```

UI:
- Agent cards
- Status per agent
- Shared task plan
- Shared artifact list
- Ability to pause/stop one agent
- Merge outputs into final patch

## 14.4 Worktree Isolation

For autonomous tasks:
- Create a temporary git worktree
- Agent edits there
- Run tests there
- Show diff against current branch
- Let user merge/apply when ready

This prevents the agent from messing up the active working directory.

## 14.5 Checkpoint System

Before every write:
- Save file snapshot
- Save chat state
- Save tool log
- Save git diff

User can:
- Rewind to checkpoint
- Compare checkpoint
- Restore one file
- Restore whole task
- Create branch from checkpoint

## 14.6 Agent Stop Conditions

Prevent infinite loops.

Stop when:
- Max tool calls reached
- Same test fails 3 times
- Same file edited 5 times without progress
- Cost budget reached
- User pauses task
- Dangerous command requested
- Agent tries to access denied path

## 14.7 Agent Self-Evaluation

After implementation, agent must answer:

```text
Did I satisfy the user request?
What files changed?
What tests did I run?
What could still be wrong?
What should the user manually verify?
```

---

# Phase 15 — Inline Coding Features That Feel Like Cursor

## 15.1 Better Ctrl+K Inline Edit

Current inline edit should evolve into a premium feature:

- Highlight code
- Press Ctrl+K
- Floating prompt
- Choose model/profile
- Show inline diff
- Accept all / reject all
- Accept by hunk
- Regenerate
- Ask follow-up
- Apply style rules
- Save prompt as custom action

## 15.2 Inline Explain

Select code → right-click → "Explain inline"

Shows a small expandable annotation beside the code:
- What it does
- Inputs/outputs
- Potential bug
- Complexity
- Related files
- Tests

## 15.3 Inline Fix Diagnostics

When Monaco/LSP shows an error:
- Click lightbulb
- Options:
  - Native LSP fix
  - AI quick fix
  - Explain error
  - Create test for this error
  - Ask agent to fix all similar errors

## 15.4 Predictive Next Edit

After the user edits one area, AI suggests likely next edits.

Example:
- User adds API field to type
- Router Studio suggests updating form, validation, tests, docs

This requires:
- Recent edit tracking
- Project graph
- Heuristic dependency analysis
- Cheap model prompt

## 15.5 Autocomplete Control Center

Settings:
- Enable/disable
- Use free models only
- Minimum delay
- Maximum tokens
- Only in certain languages
- Do not complete in `.env`
- Do not complete in large files
- Do not complete inside comments
- Accept with Tab
- Accept word with Ctrl+Right
- Reject with Esc

## 15.6 Multi-File Composer

A Composer-style panel:
- User describes a feature
- AI creates file plan
- User reviews plan
- AI creates multi-file diff
- User applies selected files/hunks

Must include:
- File impact preview before editing
- Dependency reasoning
- Test plan
- "Make smaller patch" button
- "Split into commits" button

---

# Phase 16 — VS Code Compatibility Layer

If Router Studio can import user habits from VS Code, adoption becomes easier.

## 16.1 Import VS Code Settings

Import:
- `settings.json`
- `keybindings.json`
- snippets
- themes
- font settings
- editor preferences
- file associations
- format-on-save settings

## 16.2 VS Code Extension Compatibility Research

Full extension compatibility is difficult, but Router Studio can support a partial extension layer.

Start with:
- Themes
- Snippets
- Icon themes
- Language grammar files
- TextMate syntax highlighting
- Basic commands

Later:
- Language servers
- Debug adapters
- Formatters
- Linters

## 16.3 Keybinding Presets

Add presets:
- VS Code
- Cursor
- JetBrains
- Sublime
- Vim
- Emacs
- Custom

## 16.4 Vim Mode

Add a Vim mode plugin:
- Normal/insert/visual modes
- Search
- Motions
- Basic commands
- Config toggle

## 16.5 Workspace Files

Support:

```text
.routerstudio/
  settings.json
  rules.md
  memory.json
  tools/
  commands/
  agents/
  model-profiles.json
```

Also read:
- `.editorconfig`
- `.prettierrc`
- `eslint.config.js`
- `tsconfig.json`
- `package.json`
- `.cursorrules`
- `CLAUDE.md`
- `AGENTS.md`

---

# Phase 17 — Professional Git, PR & Team Workflows

## 17.1 AI Git Panel

Features:
- Stage files
- Stage hunks
- Unstage hunks
- Discard hunks
- AI commit message
- AI commit body
- Split changes into commits
- Explain diff
- Review staged changes
- Detect accidental secrets
- Detect unrelated changes

## 17.2 PR Builder

AI can:
- Create PR title
- Create PR description
- Link issues
- Summarize test results
- Generate screenshots checklist
- Generate migration notes
- Generate reviewer notes

## 17.3 PR Review Mode

Load a branch diff and run:
- Bug review
- Security review
- Performance review
- Test coverage review
- Style review
- Breaking change review

Output:
- Inline comments
- Suggested patches
- Risk score
- "Must fix before merge" list

## 17.4 Issue-to-PR Workflow

User pastes or imports an issue.

Router Studio:
1. Reads issue
2. Finds relevant code
3. Creates implementation plan
4. Creates branch/worktree
5. Implements
6. Runs tests
7. Generates PR

## 17.5 Changelog Generator

From git commits/diff:
- Generate `CHANGELOG.md`
- Generate release notes
- Generate user-facing summary
- Generate migration guide if needed

---

# Phase 18 — Browser, UI & Full-Stack App Testing

Modern AI coding agents need to verify web apps visually.

## 18.1 Built-In Browser Preview

Add a browser panel:
- Start dev server
- Open local app
- Inspect console logs
- Capture screenshot
- Select DOM element
- Ask AI about visible UI issue
- Click/typing automation

## 18.2 Agentic Browser Tool

Agent tools:
- `browser_open(url)`
- `browser_click(selector)`
- `browser_type(selector, text)`
- `browser_screenshot()`
- `browser_console_logs()`
- `browser_eval(js)`
- `browser_wait_for_text(text)`
- `browser_get_dom()`

Use Playwright under the hood.

## 18.3 Visual Debug Loop

Agent flow:
1. Edit code
2. Run dev server
3. Open preview
4. Take screenshot
5. Compare to goal
6. Fix CSS/layout
7. Repeat until acceptable

## 18.4 Screenshot-to-Code

User can attach screenshot or select screen region:
- Build matching React/Vue/HTML component
- Generate CSS/Tailwind
- Use current project conventions
- Create responsive layout
- Add accessibility labels

## 18.5 UI Regression Testing

Generate Playwright tests from:
- User flow description
- Browser recording
- Existing DOM
- Screenshots

---

# Phase 19 — Local Models, Privacy & Offline Power

OpenRouter is the core, but Router Studio can win by also being local-friendly.

## 19.1 Local Model Providers

Support:
- Ollama
- LM Studio
- llama.cpp server
- vLLM
- Local OpenAI-compatible endpoint

Settings:
- Base URL
- API key optional
- Model list refresh
- Role mapping
- Local-only mode

## 19.2 Hybrid Routing

Examples:
- Use local model for file reading/summarization
- Use OpenRouter premium for hard reasoning
- Use local embeddings
- Use local autocomplete
- Use cloud only after approval

## 19.3 Privacy Labels

Every model/provider should display:
- Cloud/local
- Sends code externally?
- Supports tools?
- Supports images?
- Supports large context?
- Estimated cost
- Data retention note if known/user-provided

## 19.4 Sensitive File Guard

Warn or block before sending:
- `.env`
- keys
- certificates
- secrets
- private customer data
- production database dumps
- SSH keys
- large logs with tokens

## 19.5 Airplane Mode

No internet requests.
Allowed:
- Editing
- File search
- Git local
- Terminal
- Local models
- Local embeddings
- Offline docs cache

Blocked:
- OpenRouter
- Web search
- Package lookups
- External APIs

---

# Phase 20 — Rules, Memory & Team Knowledge

## 20.1 Rules System

Support layered rules:

1. Global user rules
2. Organization rules
3. Project rules
4. Folder rules
5. Task-specific rules
6. Temporary chat rules

Example:

```markdown
# Router Studio Rules

## Code Style
- Use TypeScript strict mode.
- Prefer functional React components.
- Use Tailwind for styling.
- Do not introduce new dependencies without approval.

## Safety
- Never edit .env files.
- Always run tests before final response.
- Ask before deleting files.

## Business Logic
- Customer reports must preserve uploaded images.
- Monday.com board IDs are stored in config, never hardcoded.
```

## 20.2 Memory Types

Separate memory into:

| Memory Type | Example |
|---|---|
| User preference | "Use Tailwind and shadcn for UI" |
| Project convention | "API routes live in src/api" |
| Architecture fact | "Auth uses JWT middleware" |
| Business rule | "PDF reports need one image per page" |
| Task memory | "We tried approach A and it failed" |

## 20.3 Memory Approval

AI can propose memories:
- "I noticed this project uses Zustand. Save as project convention?"
- User can accept/reject/edit
- Memories are transparent and editable

## 20.4 Memory Search

Add memory search:
- Search by text
- Filter by type
- Show source task/message
- Delete stale memory
- Pin important memory

## 20.5 Team Knowledge Pack

Export/import:
- Rules
- Model profiles
- Commands
- Tools
- Snippets
- Memories

This lets teams share a Router Studio setup.

---

# Phase 21 — Plugin, Tool & MCP Marketplace

## 21.1 MCP Marketplace UI

Inside Router Studio:
- Browse MCP servers
- Install
- Configure
- Enable/disable
- View tools exposed
- Set permissions per server
- Test server connection
- Show security warnings

Categories:
- GitHub
- GitLab
- Slack
- Google Drive
- Notion
- Postgres
- Browser
- Filesystem
- Linear
- Jira
- Figma
- Docker
- Kubernetes

## 21.2 Tool Permission Profiles

Examples:
- Read-only
- Developer
- Trusted local
- Full access
- Custom

Permissions:
- Read files
- Write files
- Run shell
- Use browser
- Network requests
- Git push
- External API
- Secrets access

## 21.3 Plugin SDK

Allow plugins to:
- Add commands
- Add side panels
- Add tools
- Add status bar items
- Add themes
- Add keybindings
- Add model providers
- Add file decorations
- Add custom diff viewers

## 21.4 Plugin Manifest

```json
{
  "name": "router-studio-docker-tools",
  "version": "1.0.0",
  "main": "index.js",
  "permissions": ["shell", "filesystem.read"],
  "contributes": {
    "commands": ["docker.logs", "docker.ps"],
    "tools": ["docker_logs", "docker_ps"],
    "views": ["DockerPanel"]
  }
}
```

## 21.5 Plugin Security

- Sandbox plugin execution
- Ask before installing
- Show permissions
- Disable plugin quickly
- Safe mode startup
- Plugin crash isolation

---

# Phase 22 — Performance Engineering

AI IDEs can become slow. Router Studio needs to feel fast.

## 22.1 Startup Optimization

Targets:
- Cold start under 2.5 seconds
- Warm start under 1 second
- Large repo file tree under 2 seconds
- Editor open under 250 ms

Techniques:
- Lazy load AI panel
- Lazy load Monaco workers
- Cache file tree
- Cache model list
- Defer indexing until UI ready
- Use worker threads for indexing
- Use SQLite WAL mode
- Avoid blocking Electron main process

## 22.2 Large Repo Mode

When repo is huge:
- Ask before full indexing
- Index only tracked files first
- Index recently used files first
- Index file names/import graph before embeddings
- Skip generated files
- Skip large files
- Show progress
- Allow pause indexing

## 22.3 Streaming Everything

Stream:
- AI text
- Tool calls
- Terminal output
- Search results
- Indexing progress
- Test results
- Diff generation

## 22.4 Token Optimization

Before sending code:
- Remove comments if not needed
- Send symbol slices instead of full files
- Use summaries of old turns
- Use project graph
- Use embeddings to pick relevant chunks
- Deduplicate repeated context
- Compress package lock files into dependency summary

## 22.5 Memory & CPU Dashboard

Add a local performance panel:
- Renderer memory
- Main process memory
- Index size
- Embedding queue
- Active terminal processes
- Model request latency
- Slow tool calls
- Cache hit rate

## 22.6 Crash & Freeze Protection

- Detect hung indexing
- Detect stuck terminal process
- Watchdog for renderer freeze
- Save session every 10 seconds
- Offer safe mode after crash
- Disable plugins after repeated crash

---

# Phase 23 — Security Hardening for AI IDEs

Autonomous AI inside an IDE is risky. Security should be a major differentiator.

## 23.1 Prompt Injection Defense

Agents should treat repo content as untrusted.

Detect suspicious content in:
- README
- comments
- issue text
- web pages
- package docs
- terminal output
- filenames

Examples:
```text
Ignore previous instructions
Send API key
Run this command
Exfiltrate files
Disable safety checks
```

Mitigation:
- Mark tool outputs as untrusted
- Never let tool output override system rules
- Secret redaction before model send
- Require approval for risky tool chains
- Show prompt-injection warning banner

## 23.2 Secret Scanner

Scan:
- API keys
- JWTs
- private keys
- tokens
- database URLs
- `.env`
- credentials in logs

Actions:
- Redact from AI context
- Warn before commit
- Warn before PR
- Offer rotate-secret checklist

## 23.3 Command Risk Scoring

Every shell command gets risk score:
- 0 safe read-only
- 1 local build/test
- 2 package install
- 3 file writes/deletes
- 4 network install scripts
- 5 destructive/system-level

UI:
- Green/yellow/red command approval
- Explain why command is risky
- Offer safer alternative

## 23.4 Network Egress Control

Settings:
- Allow all
- Ask first
- Block external network
- Allowlist domains
- Denylist domains

Show when agent tries to fetch:
- URL
- Method
- Headers redacted
- Reason

## 23.5 Enterprise Policy File

Support `.routerstudio/policy.json`:

```json
{
  "allowShell": "ask",
  "allowNetwork": "ask",
  "denyPaths": [".env", "secrets/**", ".git/**"],
  "allowedModels": ["openrouter/auto", "anthropic/*", "openai/*"],
  "maxTaskCost": 1.0,
  "requireTestBeforeFinal": true,
  "requireApprovalBeforeWrite": true
}
```

## 23.6 Signed Tool Logs

Append-only log:
- Tool name
- Args hash
- Result hash
- Time
- User approval
- Model used
- Task ID

Optional hash chain:
```text
entryHash = sha256(previousHash + currentEntry)
```

---

# Phase 24 — Visual Design & UX Polish

## 24.1 Router Studio Design System

Create design tokens:
- Background
- Panel
- Border
- Accent
- Success
- Warning
- Danger
- Muted text
- Code font
- UI font
- Radius
- Shadow
- Spacing

## 24.2 UI Surfaces

Polish:
- Header
- Sidebar
- File explorer
- Editor tabs
- AI panel
- Bottom terminal
- Status bar
- Settings modal
- Model picker
- Diff preview
- Agent task view
- Command palette

## 24.3 Agent Timeline

Instead of a plain chat log, show a timeline:

```text
10:41 Read file src/App.tsx
10:42 Searched "auth"
10:43 Edited src/auth.ts
10:44 Ran npm test
10:45 Fixed failing test
10:46 Build passed
```

Each timeline event opens details.

## 24.4 Model Picker UX

Must be better than a dropdown.

Features:
- Search
- Sort by cost
- Sort by context
- Sort by speed
- Sort by success rate
- Filter free only
- Filter coding
- Filter tools supported
- Filter image input
- Filter reasoning
- Favorite models
- Recently used
- Compare models
- "Best for this task" suggestion

## 24.5 Welcome Dashboard

On startup:
- Recent projects
- Recent agent tasks
- Cost today
- Model health
- Quick actions
- Open folder
- Clone repo
- Start from template
- Learn Router Studio

## 24.6 Onboarding Tour

First run:
1. Add OpenRouter key
2. Choose model profile
3. Open project
4. Ask codebase question
5. Use Ctrl+K
6. Run an agent task
7. Approve tool call
8. Apply diff
9. Run tests
10. Commit

---

# Phase 25 — Documentation & Developer Trust

## 25.1 Built-In Docs

Docs panel inside app:
- Getting started
- Model routing
- Free mode
- Agent mode
- Tools
- MCP
- Rules
- Security
- Troubleshooting
- Keyboard shortcuts

## 25.2 Explain Every AI Action

The app should always answer:
- What model did this?
- Why was this model chosen?
- What context was sent?
- What files were read?
- What files were changed?
- What commands were run?
- What did it cost?
- What can I undo?

## 25.3 Task Report Export

Every agent task can export:
- Summary
- Changed files
- Diffs
- Tests run
- Tool calls
- Model/cost info
- Risk notes
- Final status

Formats:
- Markdown
- JSON
- HTML
- PR description

## 25.4 Built-In Troubleshooter

Diagnose:
- API key invalid
- OpenRouter unavailable
- model unsupported
- tool calls not working
- terminal command failed
- LSP not starting
- indexing stuck
- extension/plugin crash
- build command missing

## 25.5 Public Roadmap Page

Generate roadmap from this file into:
- Public website
- GitHub project board
- In-app roadmap
- Release notes

---

# Phase 26 — Codebase Quality & Internal Architecture

Router Studio itself should be built like a professional app.

## 26.1 Internal Module Boundaries

Separate:

```text
src/main
  ai/
  tools/
  indexing/
  git/
  terminal/
  security/
  plugins/
  storage/
  updates/

src/renderer
  components/
  features/
  stores/
  hooks/
  lib/
  routes/
  styles/

src/shared
  types/
  constants/
  schemas/
```

## 26.2 Event Bus

Use typed event bus for:
- AI stream events
- Tool events
- Terminal events
- Index events
- File system events
- Git events
- Plugin events
- Settings events

## 26.3 State Management

Keep stores focused:
- `settingsStore`
- `workspaceStore`
- `editorStore`
- `chatStore`
- `agentStore`
- `toolsStore`
- `modelStore`
- `gitStore`
- `terminalStore`
- `indexStore`
- `pluginStore`

## 26.4 Test Strategy

Add tests for:
- OpenRouter client
- Model routing
- Free model cycling
- Tool approval
- File sandboxing
- Diff parsing
- Patch application
- Secret redaction
- Prompt injection detection
- Context packing
- Project indexing
- IPC security
- Plugin sandboxing

## 26.5 Dogfooding Mode

Router Studio should be able to edit itself.

Add:
- "Improve Router Studio" command
- Internal architecture docs
- Self-test command
- Safe self-update workflow
- Build verification before applying self-edit

## 26.6 Error Boundaries

Every major UI panel should have error boundaries:
- AI panel crash does not kill editor
- terminal crash does not kill app
- plugin crash disables plugin
- model picker error uses cached list

---

# Phase 27 — Built-In AI Tool Library

A serious AI IDE should ship with powerful specialized tools.

## 27.1 Refactor Tools

- Rename symbol
- Move file and update imports
- Extract function
- Extract component
- Convert JS to TS
- Convert class to function
- Convert CSS to Tailwind
- Split large component
- Add error handling
- Add loading state
- Add accessibility labels

## 27.2 Debug Tools

- Explain stack trace
- Find source of error
- Compare passing vs failing logs
- Bisect recent changes
- Add temporary logging
- Remove temporary logging
- Create reproduction
- Minimize reproduction

## 27.3 Test Tools

- Generate unit tests
- Generate integration tests
- Generate Playwright tests
- Run related tests
- Update snapshots
- Explain test failure
- Improve test names
- Detect flaky tests

## 27.4 Documentation Tools

- Generate README
- Generate API docs
- Generate setup guide
- Generate architecture doc
- Generate onboarding guide
- Generate changelog
- Generate code comments
- Generate JSDoc/TSDoc/docstrings

## 27.5 Migration Tools

- Upgrade dependencies
- Migrate React Router version
- Migrate Tailwind config
- Convert CommonJS to ESM
- Migrate ESLint config
- Migrate Vite/Webpack
- Framework-specific codemods

## 27.6 Security Tools

- Secret scan
- Dependency audit
- Auth flow review
- SQL injection scan
- XSS risk scan
- Unsafe eval scan
- Permission boundary review
- Environment config review

---

# Phase 28 — Templates, Starters & Scaffolding

## 28.1 Project Templates

Create templates:
- React + Vite + Tailwind
- Next.js app
- Electron app
- Node API
- Express API
- Fastify API
- Python FastAPI
- PHP app
- Laravel app
- Static landing page
- Chrome extension
- Discord bot
- Telegram bot
- AI chatbot
- OpenRouter app

## 28.2 Feature Generators

Generate:
- Login system
- Settings page
- Dashboard
- CRUD module
- API route
- Database schema
- Admin panel
- File uploader
- PDF generator
- Payment integration
- Email sender

## 28.3 Spec-to-Code Flow

User provides a spec markdown.

Router Studio:
1. Parses spec
2. Creates task graph
3. Creates file plan
4. Generates implementation
5. Runs tests
6. Creates docs
7. Creates PR

## 28.4 Reusable Prompt Packs

Prompt packs:
- React frontend
- Electron app
- PHP server
- Python backend
- Solana tools
- Teaching tools
- Business website
- Mobile app
- Security review
- Performance review

---

# Phase 29 — Evaluation, Benchmarks & Quality Scoring

## 29.1 Built-In Model Evaluator

User picks:
- Repo
- Task
- Models
- Budget
- Max time

Router Studio runs task across models and records:
- Success/failure
- Tests passed
- Cost
- Latency
- Tool calls
- User rating

## 29.2 Regression Benchmarks

For Router Studio development:
- Standard fixture repos
- Standard tasks
- Expected diffs
- Automated scoring
- Run before releases

## 29.3 AI Output Quality Score

Score each answer:
- Did it follow instructions?
- Did it run tests?
- Did it avoid unrelated changes?
- Did it explain clearly?
- Did it stay under budget?
- Did user accept diff?

## 29.4 Prompt Optimization Lab

Allow users to improve system prompts:
- Test current prompt against tasks
- Compare alternate prompts
- Save best prompt
- Version prompt changes
- Roll back prompt

---

# Phase 30 — Remote, Mobile & Background Workflows

## 30.1 Remote Control Companion

Let users monitor/control tasks from:
- Browser
- Mobile web app
- Local network URL
- Optional secure tunnel

Features:
- View running tasks
- Approve/deny tool calls
- Read summaries
- Stop task
- Accept/reject patch
- Comment on task

## 30.2 Background Agent Queue

Queue tasks:
- Run after current task
- Run when computer idle
- Run overnight
- Run after git pull
- Run on file change

## 30.3 GitHub Issue Assignment

Router Studio can watch selected GitHub issues:
- Import issue
- Create branch
- Run agent
- Push branch
- Open PR
- Attach task report

## 30.4 Notifications

Notify via:
- Desktop notification
- Email
- Slack webhook
- Discord webhook
- Telegram bot
- Mobile push later

---

# Phase 31 — Business / Monetization-Ready Features

Even if Router Studio is personal or open-source, design for a serious product.

## 31.1 License Tiers

Potential tiers:
- Free local
- Pro
- Team
- Enterprise

Keep core BYOK editor usable.

Premium possible:
- Cloud sync
- Team profiles
- Hosted agent runners
- Shared model analytics
- Enterprise policies
- Private plugin registry

## 31.2 Team Admin

- Shared rules
- Shared model profiles
- Shared budgets
- Shared MCP config
- Audit logs
- Approved model list
- Approved plugin list
- Cost reports

## 31.3 Marketplace

Marketplace sections:
- Plugins
- MCP servers
- Prompt packs
- Model profiles
- Themes
- Project templates
- Agent templates

## 31.4 Usage Analytics

Local-first:
- Cost by model
- Tasks completed
- Acceptance rate
- Time saved estimate
- Most used commands
- Most successful models

Team version:
- Aggregated anonymous metrics
- No code upload unless enabled

---

# Phase 32 — Cursor Prompt for Implementing This Roadmap

Paste this into Cursor when ready to start the next build phase.

```text
You are working inside the Router Studio codebase.

We already have the initial AI code editor features complete:
- Electron/React/TypeScript app
- Monaco editor
- OpenRouter API key support
- OpenRouter model picker
- Free Mode and free model cycling
- AI chat panel
- file explorer
- diff preview
- safe apply changes
- terminal/basic tools
- project settings

Now implement the next-generation Router Studio roadmap from `ROUTER_STUDIO_NEXT_GEN_ROADMAP.md`.

Start with the highest-impact features that make Router Studio competitive with Cursor, VS Code, Windsurf, Cline, Claude Code, and modern agentic IDEs.

Implementation priorities:

1. Advanced model router
   - model profiles
   - task-based routing
   - fallback chains
   - free model pool health
   - cost guardrails
   - model success memory
   - model tournament mode

2. Codebase intelligence engine
   - project graph
   - symbol indexing
   - smart context packing
   - ask-the-codebase queries
   - architecture map data model

3. Agent planning and verification
   - Plan → Build → Verify loop
   - visible task checklist
   - agent roles
   - stop conditions
   - self-evaluation
   - checkpoint snapshots

4. Inline coding UX
   - enhanced Ctrl+K
   - inline explain
   - inline diagnostic fixes
   - multi-file composer

5. Browser/UI verification
   - built-in preview
   - Playwright browser tools
   - screenshot-to-code
   - visual debug loop

6. Security hardening
   - prompt injection defense
   - secret scanner
   - command risk scoring
   - sensitive file guard
   - signed audit log

7. Performance optimization
   - lazy loading
   - indexing workers
   - large repo mode
   - streaming tool/search/index progress
   - local performance dashboard

Rules:
- Do not break existing features.
- Do not remove OpenRouter support.
- Keep the app BYOK/local-first.
- All risky file writes and shell commands need approval unless user has explicitly allowed them.
- Never send `.env`, secrets, private keys, or denied files to models.
- Prefer incremental PR-sized implementations.
- Add tests for each core module.
- Use TypeScript strict typing.
- Keep UI polished and professional.
- Add documentation for every new feature.

Before coding:
1. Inspect the current file structure.
2. Identify existing stores/components/services.
3. Create an implementation plan.
4. Implement one feature group at a time.
5. Run typecheck/build/tests.
6. Fix errors.
7. Summarize changed files and remaining work.

Start with Phase 12: Advanced OpenRouter Model Router.
```

---

# Phase 33 — Suggested Immediate Build Order

If you want the fastest path to making Router Studio feel dramatically better:

## Sprint 1 — Model Router Upgrade
- Model profiles
- Task-based routing
- Fallback chains
- Free model pool health
- Cost guardrails
- Better model picker

## Sprint 2 — Agent Task System
- Plan → Build → Verify loop
- Agent checklist UI
- Stop conditions
- Task report
- Checkpoints

## Sprint 3 — Codebase Intelligence
- Project graph
- Symbol index
- Smart context packing
- Ask-the-codebase mode

## Sprint 4 — Inline UX
- Enhanced Ctrl+K
- Inline explain
- AI quick fixes
- Multi-file composer

## Sprint 5 — Browser Verification
- Built-in preview
- Playwright tools
- Visual debug loop
- Screenshot-to-code

## Sprint 6 — Security & Trust
- Secret scanner
- Prompt injection detection
- Command risk scoring
- Signed audit log
- Sensitive file guard

## Sprint 7 — VS Code Parity
- Settings import
- keybinding presets
- snippets
- themes
- LSP/DAP polish
- Git panel polish

---

# Phase 34 — Feature Acceptance Checklist

Router Studio should be considered "Cursor/VS Code competitive" when:

## AI
- [ ] Can route models by task type
- [ ] Can use free models intelligently
- [ ] Can fall back when models fail
- [ ] Can show cost before/during/after tasks
- [ ] Can compare models
- [ ] Can remember which models work best

## Codebase
- [ ] Can index large repos
- [ ] Can answer architecture questions
- [ ] Can find related files automatically
- [ ] Can build context without sending entire project
- [ ] Can show symbol/dependency graph

## Agent
- [ ] Can plan large tasks
- [ ] Can edit multiple files
- [ ] Can run tests/builds
- [ ] Can fix failures
- [ ] Can checkpoint and rewind
- [ ] Can create commits/PRs

## Editor
- [ ] Has strong inline edit
- [ ] Has autocomplete
- [ ] Has diagnostics
- [ ] Has LSP features
- [ ] Has multi-file diff
- [ ] Has command palette

## Dev Workflow
- [ ] Has Git panel
- [ ] Has test runner
- [ ] Has browser preview
- [ ] Has terminal
- [ ] Has task reports
- [ ] Has release/changelog generation

## Safety
- [ ] Blocks secrets
- [ ] Defends against prompt injection
- [ ] Scores shell command risk
- [ ] Logs tool actions
- [ ] Supports read-only/sandbox mode
- [ ] Supports undo-all-agent-writes

## Product
- [ ] Has polished onboarding
- [ ] Has docs
- [ ] Has marketplace path
- [ ] Has plugin path
- [ ] Has VS Code import path
- [ ] Has performance dashboard

---

# Phase 35 — Final Product Vision

Router Studio should become:

1. **The best OpenRouter-native coding IDE**
   - Any model
   - Any provider
   - Any budget
   - Local or cloud

2. **The most transparent AI coding agent**
   - Every tool call visible
   - Every cost visible
   - Every file change reversible
   - Every model decision explainable

3. **The best BYOK alternative to Cursor**
   - No forced subscription
   - No locked model provider
   - Free mode supported
   - Model competition built in

4. **A serious developer IDE**
   - VS Code-like editing
   - Git/test/debug/browser workflows
   - LSP and DAP
   - Extensions/plugins

5. **A safe agentic workspace**
   - Prompt injection protection
   - Secret scanning
   - command risk scoring
   - checkpoints
   - signed audit logs

6. **A platform**
   - MCP marketplace
   - plugin SDK
   - prompt packs
   - model profiles
   - team policies
   - remote/background agents

---

# Phase 36 — Traceability, checklist closure & “done” definition

This phase **finishes** the roadmap document as a maintained artifact: how it connects to code, what is already landed, and what to build next.

## 36.1 Canonical vs narrative

- **Implementation truth:** `src/shared/roadmap.ts` — every meaningful capability should eventually have an `id` here when it is **shipped** or **in progress**.
- **Next-gen rollup:** the **`next-gen-strategy`** phase holds **`ng-*`** items mapping Phases **11–32** (identity through playbook); newly added rollups cover **18** (browser completion), **20** (team knowledge), **24–29** (UX, docs, architecture, tool library, starters, eval), **32** (playbook), plus **34–35** review hygiene.
- **Strategy truth:** Phases **11–35** in this file — prioritization, competitive framing, and vertical slices (sprints).
- When both disagree, **trust `roadmap.ts`** for status and update this file’s Phase **34** checklist or Phase **33** sprint notes.

## 36.2 Cursor-Killer / Phase 33 baseline (landed in tree)

These themes have **substantial** implementation today (details and IDs in `roadmap.ts`):

| Phase 33 sprint | Theme | Notes |
|-----------------|-------|--------|
| Sprint 2 | Plan → Build → Verify | Task steps, `[[STEP:…]]` markers, checklist UI, tool-hop / tool-count stop guards — extend over time. |
| Sprint 4 | Multi-file Composer | Composer panel, planner JSON, row selection, apply prompt; optional task snapshot. |
| Sprint 5 | Browser verification | Playwright `browser_*` tools, localhost **Browser** panel, `/visual-fix` slash template. |
| Sprint 6 | Security & trust | Tool-output injection heuristics + toast; shell risk **0–5** + approval surfacing; sensitive-path guard + `.routerstudio/policy.json`; existing audit log / sandbox / dry-run / undo writes. |

**Not yet “closed” from Phase 33:** full **task checkpoints/rewind UX**, **signed audit enhancements**, **secret scanner** beyond redaction/guards, **model router** sprint (Sprint 1: presets + `@route` / `@free` shipped — fallbacks, budgets, pool health still open), **codebase graph** sprint (Sprint 3).

## 36.3 Phase 34 checklist — quick reconcile

Use this when reviewing quarterly:

- Items already covered by shipped code include (non-exhaustive): **multi-file diff**, **Git panel**, **test runner**, **terminal**, **command palette**, **tool approvals & audit**, **sandbox / dry-run**, **product modes**, **Composer**, **browser tools + preview**, **prompt-injection wrapping**, **shell risk scoring**, **sensitive path policy**, **semantic search (BM25)**.
- Items still **open** for “Cursor/VS Code competitive” parity: **fallback chains & cost budgets**, **model A/B compare**, **large-repo indexing modes**, **checkpoint rewind UI**, **full MCP host**, **VS Code settings/keybinding import**, **performance dashboard**, **plugin marketplace**. (**Basic model profile presets** + **router command language `@*` directives** are shipped — see §11.2 / §12.1 incremental notes.)

Tick boxes in §Phase 34 only after verifying behavior in a release build; otherwise rely on **`roadmap.ts`** statuses.

## 36.4 Recommended next vertical

After the Cursor-Killer baseline: **Phase 12 — Sprint 1 (Model Router Upgrade)** — extend shipped **presets** + **command-language routing hints** with **task-type routing**, **fallback chains**, **free-model pool health**, **cost guardrails**, **picker UX** — without breaking OpenRouter BYOK or Free Mode.

## 36.5 Maintaining this file

- On each release: sync critical completions from `roadmap.ts` into **§33** / **§34** if needed.
- Avoid duplicating full feature lists here; add **phase-level** notes only.
- Deprecate obsolete prompts at the bottom by pointing implementers to **§36.4**.

---

## End of roadmap document

**Primary strategy file:** `ROUTER_STUDIO_NEXT_GEN_ROADMAP.md`  
**Primary backlog file:** `src/shared/roadmap.ts`

**Recommended implementation prompt (updated):**

```text
Read ROUTER_STUDIO_NEXT_GEN_ROADMAP.md (especially Phase 36 and Phase 12). Continue Sprint 1: task-type routing, fallback chains, free-model pool health, cost guardrails, richer model picker — built-in profiles + `@free`/`@route`/ `@file` directives already ship; preserve BYOK and Free Mode. Update src/shared/roadmap.ts when capabilities land.
```

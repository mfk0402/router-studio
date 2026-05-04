# Router Studio Design System

**Version:** 1.0  
**Product:** Router Studio IDE  
**Design Direction:** Premium dark-first AI code editor with neon-accented developer tooling  
**Tagline:** One workspace for every AI model.

---

## 1. Design Vision

Router Studio should feel like a high-end AI-native IDE built for developers who work across multiple models, tools, agents, and projects. The interface should combine the productivity and familiarity of VS Code/Cursor with a stronger visual identity: dark surfaces, clean neon accents, glassy panels, precise spacing, and clear agent/tool states.

The design should communicate:

- **Power:** advanced AI model routing, agent tools, code editing, terminal, Git, and diagnostics.
- **Control:** approvals, diff previews, checkpoints, model selection, sandbox/dry-run states.
- **Speed:** compact layouts, keyboard-first actions, command palette, inline prompts.
- **Trust:** readable states, safe tool execution, clear logs, no hidden actions.
- **Modern identity:** dark-first UI, electric gradients, subtle glow, rounded cards, polished shadows.

---

## 2. Core Design Principles

### Dark First
Router Studio should be designed for dark mode as the primary experience. Light mode can exist later, but every component should be optimized for long coding sessions in a dark IDE.

### Keyboard First
Every major action should be accessible through shortcuts, command palette, or slash commands. Buttons should help discovery, but power users should not depend on the mouse.

### Agent Transparency
When the AI takes action, the user should see exactly what happened. Tool calls, file edits, shell commands, model switches, and cost should be visible through clear cards and logs.

### Safe by Default
Dangerous actions should have confirmation modals. File writes should go through diff preview. Shell commands should be categorized by risk. The UI should make approval and rollback easy.

### Compact but Legible
The IDE should fit a lot of information on screen without feeling crowded. Use clear spacing, strong hierarchy, and muted secondary text.

### Accent With Purpose
Bright colors should not be everywhere. Use accent colors for primary actions, active states, important tool feedback, and brand emphasis.

---

## 3. Brand Identity

### Logo
Use a hexagon or rounded shield mark with an `R` monogram inside. The logo should feel technical, secure, and AI-native.

Recommended logo style:

- Hexagon outer shape
- Electric cyan/blue/violet gradient border
- Dark inner fill
- White or light text `R`
- Optional subtle glow

### Wordmark
Use `Router Studio` in a clean modern sans-serif. The wordmark should be white or near-white on dark backgrounds.

### Tagline
Use the tagline:

> One workspace for every AI model.

Optional alternate taglines:

- Build, ship, and iterate faster.
- Route every task to the right model.
- Code with agents, models, and tools in one workspace.

---

## 4. Color System

Use the following token-based color palette.

### Brand and Accent Colors

| Token | Hex | Usage |
|---|---:|---|
| `--color-primary` | `#6366FF` | Primary buttons, active states, focus rings, important CTAs |
| `--color-accent` | `#22D3EE` | Secondary brand accent, model routing highlights, links |
| `--color-violet` | `#A855F7` | AI/agent emphasis, gradients, badges |
| `--color-cyan` | `#06B6D4` | Information states, active navigation, code/tool highlights |
| `--color-success` | `#22C55E` | Passed tests, successful tool calls, saved states |
| `--color-warning` | `#F59E0B` | Risky actions, warnings, partial failures |
| `--color-danger` | `#EF4444` | Delete, destructive actions, errors |

### Surface and Neutral Colors

| Token | Hex | Usage |
|---|---:|---|
| `--color-bg` | `#060B12` | App background |
| `--color-surface` | `#0B1220` | Main panels, cards |
| `--color-surface-2` | `#111827` | Elevated panels, input backgrounds |
| `--color-surface-3` | `#161C2A` | Hover cards, selected rows, modals |
| `--color-border` | `#263043` | Panel borders, input borders |
| `--color-border-soft` | `rgba(148, 163, 184, 0.16)` | Subtle borders |
| `--color-muted` | `#6B7280` | Secondary labels, disabled text |
| `--color-text` | `#E6E8EB` | Primary text |
| `--color-text-soft` | `#A7B0C0` | Supporting text |
| `--color-text-faint` | `#748094` | Captions and metadata |

### Gradients

Use gradients sparingly for brand and primary actions.

```css
--gradient-brand: linear-gradient(135deg, #6366FF 0%, #22D3EE 50%, #A855F7 100%);
--gradient-primary: linear-gradient(135deg, #4F46E5 0%, #6366FF 45%, #22D3EE 100%);
--gradient-danger: linear-gradient(135deg, #EF4444 0%, #B91C1C 100%);
--gradient-surface: linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(11, 18, 32, 0.96));
```

---

## 5. Typography

### Font Stack

Use Inter for UI and JetBrains Mono for code.

```css
--font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", "Fira Code", Consolas, "SF Mono", monospace;
```

### Type Scale

| Style | Size | Weight | Line Height | Usage |
|---|---:|---:|---:|---|
| Display | 58px | 700 | 1.05 | Marketing headers, design boards |
| H1 | 28px | 650 | 1.15 | Page titles, major modal titles |
| H2 | 20px | 600 | 1.25 | Panel titles, settings groups |
| H3 | 16px | 600 | 1.35 | Card titles, section labels |
| Body | 14px | 400 | 1.5 | Default UI text |
| Body Medium | 14px | 500 | 1.5 | Buttons, active nav, important labels |
| Caption | 12px | 400 | 1.4 | Metadata, descriptions, timestamps |
| Label | 11px | 600 | 1.25 | Uppercase section labels |
| Mono | 13px | 400 | 1.5 | Code, terminal, model IDs |

### Label Style

Use uppercase labels with letter spacing for panel section headers.

```css
.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8EA0BF;
}
```

---

## 6. Spacing System

Use a 4px base spacing grid.

| Token | Value | Usage |
|---|---:|---|
| `--space-1` | 4px | Tiny gaps, icon spacing |
| `--space-2` | 8px | Compact component gaps |
| `--space-3` | 12px | Input padding, card internal spacing |
| `--space-4` | 16px | Standard panel padding |
| `--space-5` | 20px | Large component spacing |
| `--space-6` | 24px | Section padding |
| `--space-8` | 32px | Page-level spacing |
| `--space-10` | 40px | Large layout gaps |
| `--space-12` | 48px | Hero and major separation |

---

## 7. Radius System

| Token | Value | Usage |
|---|---:|---|
| `--radius-xs` | 4px | Small chips, tiny controls |
| `--radius-sm` | 8px | Inputs, compact buttons |
| `--radius-md` | 12px | Standard buttons/cards |
| `--radius-lg` | 16px | Panels, modals |
| `--radius-xl` | 24px | Hero cards, large empty states |
| `--radius-full` | 999px | Pills, toggles, round buttons |

Default component radius should be **12px**. Large panels should use **16px**.

---

## 8. Shadow and Glow System

Use subtle shadows for elevation and neon glow only for active/brand moments.

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.28);
--shadow-md: 0 8px 24px rgba(0, 0, 0, 0.30);
--shadow-lg: 0 18px 48px rgba(0, 0, 0, 0.36);
--shadow-xl: 0 28px 80px rgba(0, 0, 0, 0.45);
--glow-primary: 0 0 0 1px rgba(99, 102, 255, 0.35), 0 0 24px rgba(99, 102, 255, 0.24);
--glow-cyan: 0 0 0 1px rgba(34, 211, 238, 0.30), 0 0 22px rgba(34, 211, 238, 0.18);
--glow-danger: 0 0 0 1px rgba(239, 68, 68, 0.35), 0 0 20px rgba(239, 68, 68, 0.18);
```

Rules:

- Normal panels use subtle border + low shadow.
- Active AI/tool states can use a soft glow.
- Destructive states use red border/glow only when needed.
- Avoid heavy blur on dense IDE surfaces.

---

## 9. Layout Architecture

Router Studio should preserve a familiar IDE structure.

### Main Regions

1. **Top App Bar**
   - App logo
   - Menu items
   - Workspace/project path
   - Quick actions
   - Agent/model status

2. **Left Activity Bar**
   - Explorer
   - Search
   - Source control
   - Tests
   - Extensions/tools
   - Settings

3. **Left Sidebar Panel**
   - File tree
   - Symbols
   - Project search
   - Agent memory/rules

4. **Center Editor**
   - Monaco editor
   - Tabs
   - Breadcrumbs
   - Inline AI actions

5. **Right AI Panel**
   - Chat
   - Agent mode
   - Model picker
   - Context chips
   - Tool-call cards
   - Action buttons

6. **Bottom Panel**
   - Terminal
   - Output
   - Problems
   - Tests
   - Tasks
   - Logs

### Panel Proportions

| Area | Suggested Width/Height |
|---|---:|
| Activity bar | 48px |
| Sidebar | 240–320px |
| AI panel | 360–480px |
| Bottom panel | 180–320px |
| Top bar | 48–56px |

---

## 10. Buttons

### Button Types

Use the following button variants:

- Primary
- Secondary
- Ghost
- Subtle
- Danger
- Icon
- Split button
- Toolbar button

### Button CSS Tokens

```css
.button {
  height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  transition: background 160ms ease-out, border-color 160ms ease-out, transform 120ms ease-out, box-shadow 160ms ease-out;
}

.button-primary {
  color: white;
  background: var(--gradient-primary);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: var(--glow-primary);
}

.button-primary:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.button-primary:active {
  transform: translateY(0);
  filter: brightness(0.96);
}

.button-secondary {
  color: var(--color-text);
  background: rgba(17, 24, 39, 0.72);
  border: 1px solid var(--color-border);
}

.button-secondary:hover {
  background: rgba(31, 41, 55, 0.78);
  border-color: rgba(99, 102, 255, 0.45);
}

.button-ghost {
  color: var(--color-text-soft);
  background: transparent;
  border: 1px solid transparent;
}

.button-ghost:hover {
  color: var(--color-text);
  background: rgba(148, 163, 184, 0.08);
}

.button-danger {
  color: #FFECEC;
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.45);
}

.button-danger:hover {
  background: rgba(239, 68, 68, 0.22);
  box-shadow: var(--glow-danger);
}
```

### Button Rules

- Use **primary** only for the main action in a panel/modal.
- Use **secondary** for common actions such as `Open Folder`, `View Diff`, `Save Settings`.
- Use **ghost** for toolbar actions and low-priority controls.
- Use **danger** for destructive actions only.
- Disabled buttons should reduce opacity to 45% and remove glow.

---

## 11. Inputs

### Input Types

Include these input templates:

- Search field
- Prompt field
- Text input
- Textarea
- Select dropdown
- Combobox
- Model picker field
- Segmented control
- Toggle
- Checkbox
- Radio

### Input CSS

```css
.input {
  height: 34px;
  width: 100%;
  border-radius: 10px;
  padding: 0 12px;
  background: rgba(11, 18, 32, 0.82);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 13px;
  outline: none;
  transition: border-color 160ms ease-out, box-shadow 160ms ease-out, background 160ms ease-out;
}

.input::placeholder {
  color: var(--color-text-faint);
}

.input:hover {
  border-color: rgba(99, 102, 255, 0.34);
}

.input:focus {
  border-color: rgba(99, 102, 255, 0.82);
  box-shadow: 0 0 0 3px rgba(99, 102, 255, 0.18);
}

.textarea {
  min-height: 92px;
  padding: 10px 12px;
  resize: vertical;
}
```

### Prompt Input

The AI prompt input should feel more elevated than normal inputs.

```css
.prompt-box {
  min-height: 92px;
  border-radius: 16px;
  padding: 14px;
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(11, 18, 32, 0.98));
  border: 1px solid rgba(99, 102, 255, 0.22);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), var(--shadow-md);
}
```

---

## 12. Segmented Controls

Use segmented controls for context selectors such as:

- File
- Selection
- Tree
- Docs
- Full file
- Terminal

```css
.segmented {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: rgba(11, 18, 32, 0.92);
  border: 1px solid var(--color-border);
}

.segmented button {
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  color: var(--color-text-soft);
}

.segmented button[data-active="true"] {
  color: white;
  background: var(--gradient-primary);
  box-shadow: 0 0 18px rgba(99, 102, 255, 0.24);
}
```

---

## 13. Chips and Badges

### Chip Types

- Model badge
- Free mode badge
- Tool count badge
- Status pill
- Rule chip
- Inline file chip
- Risk chip
- Cost chip

### Chip CSS

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-soft);
  background: rgba(17, 24, 39, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.chip-primary {
  color: #DBEAFE;
  background: rgba(99, 102, 255, 0.18);
  border-color: rgba(99, 102, 255, 0.38);
}

.chip-free {
  color: #CFFAFE;
  background: rgba(34, 211, 238, 0.12);
  border-color: rgba(34, 211, 238, 0.32);
}

.chip-success {
  color: #BBF7D0;
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.32);
}

.chip-warning {
  color: #FDE68A;
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.34);
}

.chip-danger {
  color: #FECACA;
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.34);
}
```

---

## 14. Cards and Panels

### Base Panel

```css
.panel {
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.88), rgba(11, 18, 32, 0.94));
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.panel-header {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.panel-body {
  padding: 14px;
}
```

### Card Templates

Create reusable templates for:

1. **Settings Card**
   - Title
   - Form controls
   - Toggle
   - Save action

2. **Assistant Response Card**
   - Avatar/icon
   - Model name
   - Timestamp
   - Summary text
   - Action buttons

3. **Tool Call Card**
   - Tool name
   - Args preview
   - Status
   - Runtime
   - Output preview
   - View details button

4. **Diff Summary Card**
   - Number of files changed
   - Added/removed line count
   - File list
   - View diff button

5. **Metric Card**
   - Label
   - Large number
   - Mini chart
   - Trend indicator

---

## 15. Navigation Components

### Top Tabs

```css
.editor-tab {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  color: var(--color-text-soft);
  background: transparent;
  border-right: 1px solid rgba(148, 163, 184, 0.10);
}

.editor-tab[data-active="true"] {
  color: var(--color-text);
  background: rgba(99, 102, 255, 0.12);
  box-shadow: inset 0 -2px 0 #22D3EE;
}
```

### Sidebar Item

```css
.sidebar-item {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--color-text-soft);
}

.sidebar-item:hover {
  background: rgba(148, 163, 184, 0.08);
  color: var(--color-text);
}

.sidebar-item[data-active="true"] {
  background: rgba(99, 102, 255, 0.16);
  color: white;
}
```

### Breadcrumbs

Breadcrumbs should be compact and clickable.

Example:

```text
router-studio > src > server > router.ts
```

Use muted text for folders and accent color for the active file.

---

## 16. Modals and Overlays

### Approval Modal

Used when an AI tool wants to edit files, run shell commands, use network, or perform destructive actions.

Content should include:

- Tool name
- Risk level
- What will happen
- Files/commands involved
- Buttons:
  - Cancel
  - Allow once
  - Always allow
  - Deny

### Confirmation Dialog

Used for destructive actions.

Visual treatment:

- Danger icon
- Red accent border
- Clear destructive button
- Plain-language warning

### Toasts

Toast types:

- Success
- Info
- Warning
- Error

Toasts should appear in a stack and auto-dismiss after 4–6 seconds unless critical.

---

## 17. Tables and Lists

### File List Row

Fields:

- File icon/type
- Filename
- Status marker
- Time updated

### Model List Row

Fields:

- Model name
- Provider
- Context size
- Pricing/free badge
- Tool support badge
- Latency indicator

### Task Row

Fields:

- Task name
- Status
- Progress percentage
- Running model
- Stop/retry button

### Table Styling

```css
.table-row {
  min-height: 34px;
  display: grid;
  align-items: center;
  padding: 0 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.table-row:hover {
  background: rgba(148, 163, 184, 0.06);
}
```

---

## 18. Iconography

### Style

Use a consistent 24px outline icon set.

Recommended:

- Lucide icons
- 2px stroke
- Rounded caps and joins
- No filled icons unless indicating active state

### Important Icons

| Purpose | Suggested Icon |
|---|---|
| Agent | Bot / Sparkles |
| Model | Brain / Network |
| Files | File / Folder |
| Terminal | Square terminal |
| Git | Git branch |
| Tests | Flask / CheckCircle |
| Settings | Gear |
| Security | Shield |
| Run | Play |
| Stop | Square |
| Error | AlertTriangle |
| Success | CheckCircle |
| Warning | TriangleAlert |
| Search | Search |
| Command | Terminal / Command |

---

## 19. AI-Specific Components

### AI Action Toolbar

Actions:

- Explain
- Refactor
- Fix
- Docs
- Tests
- Commit
- Review
- Generate

Toolbar buttons should be compact with icon + label.

### Tool Call Card

Every agent tool call should render as a card.

Required fields:

- Tool icon
- Tool name
- Status: pending, running, success, failed, denied
- Summary of action
- Runtime
- Output preview
- Expand details
- Rollback action when applicable

Status colors:

| Status | Color |
|---|---|
| Pending | Muted |
| Running | Primary/Cyan |
| Success | Success green |
| Failed | Danger red |
| Denied | Warning orange |

### Model Picker

The model picker should include:

- Search input
- Provider filter
- Free models filter
- Tool support filter
- Coding model filter
- Reasoning model filter
- Context length label
- Pricing label
- Default model star

### Slash Command Menu

Commands:

```text
/explain
/refactor
/fix
/test
/commit
/review
/docs
/generate
/terminal
/search
```

Menu should support fuzzy search and keyboard navigation.

---

## 20. IDE-Specific Templates

### Terminal Card

Use JetBrains Mono, compact line height, and color-coded status markers.

Status colors:

- Success commands: green
- Running commands: cyan
- Errors: red
- Warnings: orange
- Timestamps: muted slate

### Problems Panel

Problem rows should show:

- File
- Severity
- Message
- Line/column
- Fix with AI button

### Diff Preview

Use classic red/green diff colors but soften them for dark mode.

```css
--diff-add-bg: rgba(34, 197, 94, 0.16);
--diff-add-border: rgba(34, 197, 94, 0.38);
--diff-remove-bg: rgba(239, 68, 68, 0.14);
--diff-remove-border: rgba(239, 68, 68, 0.34);
```

### Empty State Card

Use empty states for:

- No files open
- No model selected
- No tasks running
- No diagnostics
- No search results

Each empty state should include:

- Simple icon
- Short title
- One sentence explanation
- One primary action

---

## 21. State System

Every interactive component needs these states:

- Default
- Hover
- Focus
- Pressed
- Disabled
- Loading
- Error
- Success

### Focus Ring

```css
.focus-ring:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(99, 102, 255, 0.90), 0 0 0 5px rgba(99, 102, 255, 0.18);
}
```

### Loading

Use subtle animated shimmer or spinner. Avoid excessive animation inside dense editor areas.

---

## 22. Motion Guidelines

Motion should feel fast and quiet.

| Motion | Duration | Easing |
|---|---:|---|
| Hover transition | 120–160ms | ease-out |
| Modal open | 180–220ms | cubic-bezier(0.16, 1, 0.3, 1) |
| Toast enter | 180ms | ease-out |
| Panel resize | 120ms | ease-out |
| Tool-call status update | 160ms | ease-out |

Rules:

- Do not animate code/editor content heavily.
- Use motion to clarify state changes.
- Respect reduced-motion settings.

---

## 23. Accessibility Requirements

Router Studio should meet WCAG AA contrast minimums.

Required:

- Keyboard navigation for all menus/modals/toolbars
- Visible focus ring
- ARIA labels on icon-only buttons
- High contrast status colors plus icons/text labels
- Never rely on color alone
- Minimum text size of 12px for UI labels
- Configurable editor and UI font size

---

## 24. Implementation CSS Starter

```css
:root {
  --color-bg: #060B12;
  --color-surface: #0B1220;
  --color-surface-2: #111827;
  --color-surface-3: #161C2A;
  --color-border: #263043;
  --color-border-soft: rgba(148, 163, 184, 0.16);
  --color-text: #E6E8EB;
  --color-text-soft: #A7B0C0;
  --color-text-faint: #748094;
  --color-muted: #6B7280;

  --color-primary: #6366FF;
  --color-accent: #22D3EE;
  --color-violet: #A855F7;
  --color-cyan: #06B6D4;
  --color-success: #22C55E;
  --color-warning: #F59E0B;
  --color-danger: #EF4444;

  --gradient-brand: linear-gradient(135deg, #6366FF 0%, #22D3EE 50%, #A855F7 100%);
  --gradient-primary: linear-gradient(135deg, #4F46E5 0%, #6366FF 45%, #22D3EE 100%);

  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", Consolas, "SF Mono", monospace;

  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 999px;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.28);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.30);
  --shadow-lg: 0 18px 48px rgba(0, 0, 0, 0.36);
  --shadow-xl: 0 28px 80px rgba(0, 0, 0, 0.45);
  --glow-primary: 0 0 0 1px rgba(99, 102, 255, 0.35), 0 0 24px rgba(99, 102, 255, 0.24);
}

body {
  margin: 0;
  font-family: var(--font-sans);
  color: var(--color-text);
  background:
    radial-gradient(circle at top left, rgba(99, 102, 255, 0.15), transparent 35%),
    radial-gradient(circle at top right, rgba(34, 211, 238, 0.10), transparent 30%),
    var(--color-bg);
}
```

---

## 25. Tailwind Theme Starter

Use this in `tailwind.config.ts`.

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#060B12',
        surface: '#0B1220',
        surface2: '#111827',
        surface3: '#161C2A',
        border: '#263043',
        text: '#E6E8EB',
        textSoft: '#A7B0C0',
        textFaint: '#748094',
        primary: '#6366FF',
        accent: '#22D3EE',
        violet: '#A855F7',
        cyan: '#06B6D4',
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 8px 24px rgba(0, 0, 0, 0.30)',
        modal: '0 28px 80px rgba(0, 0, 0, 0.45)',
        glow: '0 0 0 1px rgba(99,102,255,.35), 0 0 24px rgba(99,102,255,.24)',
      },
      backgroundImage: {
        brand: 'linear-gradient(135deg, #6366FF 0%, #22D3EE 50%, #A855F7 100%)',
        primary: 'linear-gradient(135deg, #4F46E5 0%, #6366FF 45%, #22D3EE 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## 26. Component Checklist

Build the design system in this order:

1. Tokens: colors, typography, spacing, radius, shadows
2. Base shell: app background, panel, toolbar, divider
3. Buttons
4. Inputs
5. Chips and badges
6. Tabs and sidebar items
7. Cards and panels
8. Modals and toast system
9. Tables/lists
10. AI-specific components
11. Terminal/problems/diff templates
12. Accessibility pass
13. Responsive layout testing
14. Theme polish

---

## 27. Cursor Implementation Prompt

Paste this into Cursor when implementing the design system.

```text
Implement the Router Studio dark neon design system described in DESIGN.md.

Goals:
- Replace the current light/plain UI with a premium dark-first IDE interface.
- Use the exact design tokens from DESIGN.md for colors, spacing, radius, shadows, typography, and gradients.
- Create reusable components for buttons, inputs, chips, panels, tabs, modals, tool-call cards, model picker rows, terminal cards, problems rows, and empty states.
- Keep the app usable and readable. Do not overuse glow.
- Make the design feel like a polished AI IDE comparable to Cursor or VS Code, but with Router Studio’s own dark gradient identity.

Required implementation steps:
1. Add CSS variables to the global stylesheet.
2. Update Tailwind config with the Router Studio theme tokens.
3. Create or refactor shared UI components:
   - Button
   - IconButton
   - Input
   - Textarea
   - Select
   - Toggle
   - Checkbox
   - Radio
   - SegmentedControl
   - Chip
   - Panel
   - Modal
   - Toast
   - Tabs
   - SidebarItem
   - ToolCallCard
   - MetricCard
   - EmptyState
4. Apply the new components across the app shell, file explorer, editor tabs, AI panel, settings modal, model picker, task cards, terminal, and bottom panels.
5. Add focus-visible states and ARIA labels to icon-only buttons.
6. Add hover, pressed, disabled, loading, success, warning, and danger states where appropriate.
7. Ensure Monaco editor remains readable and uses a compatible dark theme.
8. Audit contrast and spacing after implementation.

Do not remove existing functionality. Only improve styling, layout, and reusable component structure.
```

---

## 28. Final Visual Direction Summary

Router Studio should look like a serious developer tool, not a generic chatbot wrapper. The final design should feel:

- Dark
- Fast
- Technical
- Polished
- Agent-aware
- Safe
- Multi-model native
- Keyboard-first
- Professional enough for public launch

Use the design system as the foundation for every new Router Studio screen and feature.

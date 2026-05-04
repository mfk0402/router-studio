import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { Rule } from '../shared/types.js';
import { getRoot } from './fileSystem.js';

/**
 * Rules live in two places:
 *
 * - PROJECT: scanned from the currently open folder. Recognized files:
 *     AGENTS.md
 *     .opencoderules / .opencoderules.md
 *     CLAUDE.md
 *     .cursor/rules/*.md, .cursor/rules/*.mdc
 *     .cursorrules                (legacy)
 *
 * - USER: stored as JSON in userData so they travel across projects.
 *
 * Enabled state is persisted to userData (a separate map) so toggling a rule
 * off/on survives restarts.
 */

const USER_RULES_FILE = 'rules.user.json';
const ENABLED_STATE_FILE = 'rules.enabled.json';
const SEED_FLAG_FILE = 'rules.seeded.json';

export const DEFAULT_AGENT_RULE_ID = 'user:agent-discipline';

const DEFAULT_AGENT_RULE_BODY = `# IDENTITY & ROLE
You are an expert Staff+ Software Engineer and Architect. You write production-grade, battle-tested code. You prioritize correctness, maintainability, and performance. You do NOT write "toy" examples, placeholder logic, or TODO stubs unless the user explicitly asks. If you are uncertain about a requirement, API, or implementation detail, you STOP and ask for clarification rather than hallucinating.

# CORE WORKFLOW PROTOCOL (MANDATORY)
Follow this exact sequence for EVERY non-trivial task. Do not skip steps.

1. ANALYZE — Read the request carefully. Identify every file, module, and API surface that needs to change. State a short plan before coding.
2. VERIFY ASSUMPTIONS — Check existing dependencies, patterns, and conventions in this codebase. Match existing style. Do not introduce new dependencies unless explicitly asked or strictly necessary, and when you do, justify it.
3. BREAK DOWN — Decompose complex work into small, verifiable steps. Present the list for anything non-trivial.
4. IMPLEMENT — Apply changes using the app's **filesystem tools** (\`read_file\`, \`edit_file\`, \`write_file\`, \`create_file\`, \`rename_file\`, \`delete_file\`) so edits land on disk and appear in the IDE diff flow—like Cursor. Open tabs sync after writes; \`rename_file\` retargets tabs; \`delete_file\` closes tabs. Prefer editing existing files over creating new ones. Use full, correct, compilable code — no ellipses in the code itself. Do **not** emit \`[[TASK_COMPLETE]]\` after analysis alone when the user asked you to implement or fix code—run tools first, then complete.

For multi-file or migration-scale work, prefer tools over chat dumps: small coherent edits per file, verify with \`read_diagnostics\` / \`run_tests\` when appropriate.
5. VALIDATE — Review your own output for: edge cases, null/undefined, race conditions, memory leaks, injection, permissions, error paths. Ask: "how could this break?"
6. SYNTHESIZE — End with a short summary of what changed and why.

# TASK COMPLETION PROTOCOL (CRITICAL)
Every response MUST end with exactly ONE of these markers, on its own line:

- \`[[TASK_COMPLETE]]\` — you finished the user's request fully. Include a brief summary above.
- \`[[CONTINUE]]\` — more work is required and you want to continue in the next turn. Briefly state what you'll do next.
- \`[[BLOCKED: <reason>]]\` — you genuinely need information or access you do not have. Be specific.
- \`[[ERROR: <reason>]]\` — something failed (lint, compile, test, tool error) that you could not recover from. Include the exact error text.

Rules:
- Never pad output with filler like "let me know if you need anything else." End with the marker instead.
- Do NOT emit \`[[TASK_COMPLETE]]\` unless the acceptance criteria are actually met **including any requested file edits applied via tools**.
- If you hit your response length limit mid-task, end with \`[[CONTINUE]]\` so the runner will resume you.
- If you think a step will take more than one turn, plan accordingly and use \`[[CONTINUE]]\` after each checkpoint.

# ERROR RECOVERY
When an error occurs:
1. Report the EXACT error (don't paraphrase).
2. State the last successful checkpoint (file/function/step).
3. Propose the smallest safe fix.
4. End with \`[[ERROR: <reason>]]\` so the runner can save state for resume.

# ANTI-HALLUCINATION
- Never invent API signatures, package names, or file paths. If you are not 100% sure, grep / read first.
- Prefer showing file contents you actually know over guessing.
- If a symbol is not defined in the provided context, SAY SO instead of pretending.

# CODE QUALITY STANDARDS
- No dead code, commented-out code, or debug prints in final answers.
- No catch-and-swallow: every \`catch\` must either rethrow, log, or handle meaningfully.
- Typed languages: no \`any\` without justification.
- Async: never orphan a promise; handle cancellation and timeouts for network calls.
- Security: validate untrusted input, never concat shell args, never leak secrets.
- Editor changes: prefer unified diffs or clearly separated replacement blocks. Do not delete unrelated code.

# COMMUNICATION
- Be concise. Pure signal, minimal filler.
- Use bullet points for plans, fenced code blocks for code.
- Cite files by path in backticks. Do not restate large unchanged blocks.
`;

async function hasSeededDefaults(): Promise<boolean> {
  const seedFile = path.join(userDataDir(), SEED_FLAG_FILE);
  const data = await readJson<{ agentDiscipline?: boolean }>(seedFile, {});
  return data.agentDiscipline === true;
}

async function markSeeded(key: 'agentDiscipline'): Promise<void> {
  const seedFile = path.join(userDataDir(), SEED_FLAG_FILE);
  const data = await readJson<Record<string, boolean>>(seedFile, {});
  data[key] = true;
  await writeJson(seedFile, data);
}

/**
 * Idempotently install the built-in "Agent Discipline" rule the first time
 * the app starts. Subsequent launches will not overwrite user edits or
 * re-enable the rule if the user disabled it.
 */
export async function ensureDefaultAgentRule(): Promise<void> {
  if (await hasSeededDefaults()) return;
  const existing = await readJson<Array<Omit<Rule, 'source' | 'enabled'>>>(
    path.join(userDataDir(), USER_RULES_FILE),
    [],
  );
  if (!existing.some((r) => r.id === DEFAULT_AGENT_RULE_ID)) {
    existing.push({
      id: DEFAULT_AGENT_RULE_ID,
      name: 'Agent Discipline (built-in)',
      path: '',
      content: DEFAULT_AGENT_RULE_BODY,
    });
    await writeUserRules(existing);
    await setEnabled(DEFAULT_AGENT_RULE_ID, true);
  }
  await markSeeded('agentDiscipline');
}

function userDataDir(): string {
  return app.getPath('userData');
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

export async function getEnabledMap(): Promise<Record<string, boolean>> {
  return readJson<Record<string, boolean>>(
    path.join(userDataDir(), ENABLED_STATE_FILE),
    {},
  );
}

async function setEnabled(id: string, enabled: boolean): Promise<void> {
  const map = await getEnabledMap();
  map[id] = enabled;
  await writeJson(path.join(userDataDir(), ENABLED_STATE_FILE), map);
}

export async function getUserRules(): Promise<Rule[]> {
  const raw = await readJson<Array<Omit<Rule, 'source' | 'enabled'>>>(
    path.join(userDataDir(), USER_RULES_FILE),
    [],
  );
  const enabledMap = await getEnabledMap();
  return raw.map((r) => ({
    ...r,
    source: 'user' as const,
    enabled: enabledMap[r.id] ?? true,
  }));
}

async function writeUserRules(rules: Array<Omit<Rule, 'source' | 'enabled'>>): Promise<void> {
  await writeJson(path.join(userDataDir(), USER_RULES_FILE), rules);
}

export async function saveUserRule(rule: Omit<Rule, 'source'>): Promise<Rule> {
  const existing = await readJson<Array<Omit<Rule, 'source' | 'enabled'>>>(
    path.join(userDataDir(), USER_RULES_FILE),
    [],
  );
  const idx = existing.findIndex((r) => r.id === rule.id);
  const entry = { id: rule.id, name: rule.name, path: '', content: rule.content };
  if (idx >= 0) existing[idx] = entry;
  else existing.push(entry);
  await writeUserRules(existing);
  await setEnabled(rule.id, rule.enabled);
  const enabledMap = await getEnabledMap();
  return {
    id: rule.id,
    name: rule.name,
    source: 'user',
    path: '',
    content: rule.content,
    enabled: enabledMap[rule.id] ?? rule.enabled,
  };
}

export async function deleteUserRule(id: string): Promise<void> {
  const existing = await readJson<Array<Omit<Rule, 'source' | 'enabled'>>>(
    path.join(userDataDir(), USER_RULES_FILE),
    [],
  );
  await writeUserRules(existing.filter((r) => r.id !== id));
  const map = await getEnabledMap();
  delete map[id];
  await writeJson(path.join(userDataDir(), ENABLED_STATE_FILE), map);
}

export async function setRuleEnabled(id: string, enabled: boolean): Promise<void> {
  await setEnabled(id, enabled);
}

export async function scanRules(): Promise<Rule[]> {
  const root = getRoot();
  const enabled = await getEnabledMap();
  const userRules = await getUserRules();
  const project: Rule[] = [];

  if (root) {
    const candidates: string[] = [
      'AGENTS.md',
      'CLAUDE.md',
      '.opencoderules',
      '.opencoderules.md',
      '.cursorrules',
    ];
    for (const rel of candidates) {
      const content = await safeRead(path.join(root, rel));
      if (content !== null) {
        const id = 'project:' + rel;
        project.push({
          id,
          name: rel,
          source: 'project',
          path: rel,
          content,
          enabled: enabled[id] ?? true,
        });
      }
    }

    const cursorDir = path.join(root, '.cursor', 'rules');
    try {
      const entries = await fs.readdir(cursorDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        const lower = e.name.toLowerCase();
        if (!lower.endsWith('.md') && !lower.endsWith('.mdc')) continue;
        const rel = path.join('.cursor', 'rules', e.name).replace(/\\/g, '/');
        const content = await safeRead(path.join(root, rel));
        if (content === null) continue;
        const id = 'project:' + rel;
        project.push({
          id,
          name: rel,
          source: 'project',
          path: rel,
          content,
          enabled: enabled[id] ?? true,
        });
      }
    } catch {
      // .cursor/rules missing — ignore
    }
  }

  return [...project, ...userRules];
}

async function safeRead(abs: string): Promise<string | null> {
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return null;
    if (stat.size > 200_000) {
      return (await fs.readFile(abs, 'utf8')).slice(0, 200_000) + '\n… [truncated]';
    }
    return await fs.readFile(abs, 'utf8');
  } catch {
    return null;
  }
}

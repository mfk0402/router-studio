/** Multi-file Composer helpers — prompts + optional JSON parsing from the planner model. */

export type ComposerAction = 'create' | 'edit' | 'delete' | 'rename';

export interface ComposerImpactRow {
  path: string;
  action: ComposerAction;
  reason: string;
  /** UI toggle — whether this row is included in the apply prompt */
  selected?: boolean;
}

/** Starter prompt for “impact preview” — sent to chat so the model returns JSON. */
export function buildComposerPreviewPrompt(goal: string): string {
  const g = goal.trim();
  return [
    'Use Composer-style workflow:',
    '',
    `Goal: ${g}`,
    '',
    'Respond with **structured JSON only** (no prose outside JSON):',
    '',
    '{',
    '  "files": [',
    '    { "path": "relative/path.ext", "action": "edit"|"create"|"delete"|"rename", "reason": "why" }',
    '  ],',
    '  "deps": ["optional paths"],',
    '  "testPlan": ["optional bullets"],',
    '  "risks": ["optional bullets"]',
    '}',
    '',
    'Do **not** write patch bodies here — after the user confirms file rows in the Composer UI, use tools (`read_file`, then `edit_file` / `write_file`) for real edits.',
  ].join('\n');
}

function stripCodeFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '');
    const idx = s.lastIndexOf('```');
    if (idx >= 0) s = s.slice(0, idx);
  }
  return s.trim();
}

function normalizeAction(a: string): ComposerAction | null {
  const x = a.toLowerCase();
  if (x === 'create' || x === 'edit' || x === 'delete' || x === 'rename') return x;
  return null;
}

/** Parse planner JSON from model output or pasted text. */
export function parseComposerImpactJson(raw: string): ComposerImpactRow[] | null {
  const text = stripCodeFences(raw);
  try {
    const j = JSON.parse(text) as {
      files?: Array<{ path?: string; action?: string; reason?: string }>;
    };
    if (!j.files || !Array.isArray(j.files)) return null;
    const rows: ComposerImpactRow[] = [];
    for (const f of j.files) {
      const path = String(f.path ?? '').trim();
      const act = normalizeAction(String(f.action ?? ''));
      if (!path || !act) continue;
      rows.push({
        path,
        action: act,
        reason: String(f.reason ?? '').trim() || '(no reason)',
        selected: true,
      });
    }
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

export function buildComposerApplyPrompt(rows: ComposerImpactRow[]): string {
  const picked = rows.filter((r) => r.selected !== false);
  const lines = picked.map(
    (r) => `- ${r.action.toUpperCase()} \`${r.path}\`: ${r.reason}`,
  );
  return [
    'The user confirmed these Composer impact rows. Implement them with tools:',
    '',
    ...lines,
    '',
    'Use `read_file` first where needed, then `edit_file` / `write_file` / `rename_file` / `delete_file`.',
    'Stage multi-file changes through the normal agent diff flow.',
  ].join('\n');
}

export function buildSmallerPatchPrompt(goal: string): string {
  return `${buildComposerPreviewPrompt(goal)}\n\nConstraint: propose the **smallest** set of file touches — omit nice-to-haves.`;
}

export function buildSplitCommitsPrompt(goal: string): string {
  return [
    `Goal: ${goal.trim()}`,
    '',
    'Reply with JSON only describing how to split changes into commits:',
    '{ "commits": [ { "message": "conventional subject", "paths": ["relative/path"] } ] }',
    '',
    'Then use `git_add` + `git_commit` per group when executing.',
  ].join('\n');
}

/**
 * Phase 11.2 — Router Studio command language (@file, @route, @free, …).
 * Parsed on send in AiPanel; expands into prompt text + per-turn routing flags.
 */

export interface RouterCommandExpansion {
  /** Message text after stripping leading directives. */
  userText: string;
  /** Markdown appended to the user message for the model (file bodies, hints). */
  injectedMarkdown: string;
  /** Enable Free Mode for this message only (does not toggle global UI). */
  ephemeralFreeMode: boolean;
  /** Force smart read/reason routing for this tool-using turn. */
  ephemeralSmartRouting: boolean;
  /** Short lines for activity log. */
  directiveNotes: string[];
}

interface PeelResult {
  rest: string;
  files: string[];
  folders: string[];
  hints: string[];
  ephemeralFreeMode: boolean;
  ephemeralSmartRouting: boolean;
  directiveNotes: string[];
}

const FILE_RE = /^@file\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*/i;
const FOLDER_RE = /^@folder\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*/i;

function peelRouterDirectives(input: string): PeelResult {
  let rest = input.trimStart();
  const files: string[] = [];
  const folders: string[] = [];
  const hints: string[] = [];
  const directiveNotes: string[] = [];
  let ephemeralFreeMode = false;
  let ephemeralSmartRouting = false;

  for (;;) {
    let consumed = false;

    if (/^@free\b/i.test(rest)) {
      rest = rest.replace(/^@free\b\s*/i, '');
      ephemeralFreeMode = true;
      directiveNotes.push('@free — Free Mode for this message only.');
      consumed = true;
    } else if (/^@route\b/i.test(rest)) {
      rest = rest.replace(/^@route\b\s*/i, '');
      ephemeralSmartRouting = true;
      directiveNotes.push('@route — cheap read hop + reasoning hop for this tool-using turn.');
      consumed = true;
    } else if (/^@docs\b/i.test(rest)) {
      rest = rest.replace(/^@docs\b\s*/i, '');
      hints.push('Prefer official docs, README, and `/docs` when explaining APIs or setup.');
      directiveNotes.push('@docs — documentation-first tone.');
      consumed = true;
    } else if (/^@test\b/i.test(rest)) {
      rest = rest.replace(/^@test\b\s*/i, '');
      hints.push('Focus on tests: propose cases, edge cases, and use `run_tests` when it helps.');
      directiveNotes.push('@test — test-centric request.');
      consumed = true;
    } else if (/^@learn\b/i.test(rest)) {
      rest = rest.replace(/^@learn\b\s*/i, '');
      hints.push('Explain as for someone onboarding: define terms, name entry files, and avoid jargon without definitions.');
      directiveNotes.push('@learn — onboarding / teaching tone.');
      consumed = true;
    } else {
      const fm = rest.match(FILE_RE);
      if (fm) {
        const p = fm[1] || fm[2] || fm[3];
        if (p) files.push(p.replace(/\\/g, '/'));
        rest = rest.slice(fm[0].length);
        directiveNotes.push(`@file — attaching \`${p}\`.`);
        consumed = true;
      } else {
        const dm = rest.match(FOLDER_RE);
        if (dm) {
          const p = dm[1] || dm[2] || dm[3];
          if (p) folders.push(p.replace(/\\/g, '/'));
          rest = rest.slice(dm[0].length);
          directiveNotes.push(`@folder — scoped to \`${p}\`.`);
          consumed = true;
        }
      }
    }

    if (!consumed) break;
  }

  return {
    rest: rest.trimStart(),
    files,
    folders,
    hints,
    ephemeralFreeMode,
    ephemeralSmartRouting,
    directiveNotes,
  };
}

const MAX_FILE_INJECT = 120_000;

/**
 * Expand leading @-directives and inline file attachments for one chat turn.
 */
export async function expandRouterCommandLanguage(raw: string): Promise<RouterCommandExpansion> {
  const peeled = peelRouterDirectives(raw);
  const chunks: string[] = [];

  if (peeled.hints.length > 0) {
    chunks.push(
      '### Router Studio directives\n' + peeled.hints.map((h) => `- ${h}`).join('\n'),
    );
  }

  for (const rel of peeled.files) {
    try {
      const body = await window.api.fs.readFileIfExists(rel);
      if (body === null) {
        chunks.push(`\n### @file \`${rel}\`\n_(File not found or unreadable.)_`);
      } else {
        const truncated = body.length > MAX_FILE_INJECT;
        const text = truncated ? `${body.slice(0, MAX_FILE_INJECT)}\n… _(truncated)_` : body;
        chunks.push(`\n### @file \`${rel}\`\n\`\`\`\n${text}\n\`\`\``);
      }
    } catch (e) {
      chunks.push(
        `\n### @file \`${rel}\`\n_(Read failed: ${(e as Error).message})_`,
      );
    }
  }

  for (const rel of peeled.folders) {
    chunks.push(
      `\n### @folder \`${rel}\`\n_Scope the work to this path — prefer \`list_dir\` / \`grep\` starting here unless the user says otherwise._`,
    );
  }

  const injectedMarkdown = chunks.join('\n').trim();
  return {
    userText: peeled.rest,
    injectedMarkdown,
    ephemeralFreeMode: peeled.ephemeralFreeMode,
    ephemeralSmartRouting: peeled.ephemeralSmartRouting,
    directiveNotes: peeled.directiveNotes,
  };
}

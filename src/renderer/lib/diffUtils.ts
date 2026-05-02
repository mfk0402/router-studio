import { applyPatch, parsePatch, createTwoFilesPatch } from 'diff';
import type { DiffPreviewResult } from '../../shared/types';

/**
 * Try to extract a unified diff from a raw AI response. AI models usually
 * return the diff inside a fenced code block. Accept either:
 *   ```diff ... ``` / ```patch ... ```
 *   or the raw --- / +++ / @@ sequence embedded in text.
 */
export function extractUnifiedDiff(raw: string): string | null {
  const fences = [
    /```(?:diff|patch)\s*\n([\s\S]*?)```/i,
    /```\s*\n(---[\s\S]*?\+\+\+[\s\S]*?)```/,
  ];
  for (const re of fences) {
    const m = raw.match(re);
    if (m && m[1]) return m[1].trim();
  }
  const loose = raw.match(/(^|\n)(---[^\n]*\n\+\+\+[^\n]*\n@@[\s\S]+)/);
  if (loose && loose[2]) return loose[2].trim();
  return null;
}

/**
 * Try to apply a unified diff to the given original content.
 * Returns a DiffPreviewResult describing success or failure.
 */
export function previewDiff(original: string, patch: string): DiffPreviewResult {
  try {
    const parsed = parsePatch(patch);
    if (!parsed.length) {
      return { ok: false, error: 'No diff hunks were found.' };
    }
    const newContent = applyPatch(original, patch, { fuzzFactor: 2 });
    if (newContent === false) {
      return {
        ok: false,
        originalContent: original,
        error: 'Diff could not be applied cleanly. Please review manually.',
      };
    }
    const hunks = parsed.flatMap((p) =>
      (p.hunks ?? []).map((h) => ({
        oldFile: p.oldFileName ?? '',
        newFile: p.newFileName ?? '',
        oldStart: h.oldStart,
        newStart: h.newStart,
        lines: h.lines,
      })),
    );
    return { ok: true, hunks, newContent, originalContent: original };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function makePatch(
  oldPath: string,
  newPath: string,
  oldContent: string,
  newContent: string,
): string {
  return createTwoFilesPatch(oldPath, newPath, oldContent, newContent);
}

/**
 * Extract plain code blocks from AI output, returning [language, code] tuples.
 */
export function extractCodeBlocks(raw: string): Array<{ lang: string; code: string }> {
  const blocks: Array<{ lang: string; code: string }> = [];
  const re = /```([a-zA-Z0-9_+\-.]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    blocks.push({ lang: m[1] || 'plaintext', code: m[2] });
  }
  return blocks;
}

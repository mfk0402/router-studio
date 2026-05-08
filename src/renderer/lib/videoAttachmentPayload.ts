import type {
  Attachment,
  OpenRouterVideoSubmitRequest,
} from '../../shared/types';

/**
 * Last path segment of an absolute project root — shown to the video model as workspace context.
 */
export function workspaceFolderDisplayName(projectRootAbsolute: string | null | undefined): string | null {
  const s = (projectRootAbsolute ?? '').trim().replace(/[/\\]+$/, '');
  if (!s) return null;
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * Map composer image attachments into OpenRouter `frame_images` for /video and modal jobs.
 * First image → first_frame; second → last_frame (if present).
 */
export function frameImagesFromComposerAttachments(
  attachments: Attachment[],
): Pick<OpenRouterVideoSubmitRequest, 'frame_images' | 'input_references'> {
  const imgs = attachments
    .filter((a) => a.kind === 'image' && (a.imageUrl ?? '').trim())
    .map((a) => a.imageUrl!.trim());
  if (imgs.length === 0) return {};

  const frame_images: NonNullable<OpenRouterVideoSubmitRequest['frame_images']> = [];
  frame_images.push({
    type: 'image_url',
    image_url: { url: imgs[0]! },
    frame_type: 'first_frame',
  });
  if (imgs.length >= 2) {
    frame_images.push({
      type: 'image_url',
      image_url: { url: imgs[1]! },
      frame_type: 'last_frame',
    });
  }
  return { frame_images };
}

export interface VideoPromptContextOptions {
  /** `folderName` from workspace root, e.g. `rpc` */
  projectFolderLabel: string | null;
  /** Relative path of the active editor tab, if any */
  activeRelativeFile: string | null;
  hasFirstFrame: boolean;
  hasLastFrame: boolean;
  /** `input_references` only — no conditioning frames */
  referenceOnlyVisual: boolean;
  /** Request includes `generate_audio: false` */
  silentVideoDesired: boolean;
}

/**
 * Prefix the user’s video prompt so OpenRouter models interpret “this project” / “Router Studio”
 * as the open workspace and the Router Studio IDE—not consumer Wi‑Fi hardware.
 *
 * Frames: strongly anchor first-frame fidelity and discourage hallucinated IDE text (“gibberish code”).
 */
export function enrichVideoPromptForApi(
  userPrompt: string,
  opts: VideoPromptContextOptions,
): string {
  const base = userPrompt.trim();
  if (!base) return base;

  const lines: string[] = [];
  lines.push('Below is a video generation brief. Follow the user’s creative direction.');

  const folder = opts.projectFolderLabel?.trim();
  if (folder) {
    lines.push(
      `- Open workspace folder: "${folder}". When they say "this project", "the app", or "our product", assume they mean the software in this repository/workspace unless they explicitly say otherwise.`,
    );
  } else {
    lines.push(
      `- No project folder is open; interpret product names from the brief only.`,
    );
  }

  if (opts.activeRelativeFile?.trim()) {
    lines.push(
      `- Currently focused file in the IDE: \`${opts.activeRelativeFile.trim()}\` (editor context only; the video may depict the whole app).`,
    );
  }

  lines.push(
    `- Product identity: "**Router Studio**" is Router Studio — a desktop **code editor / AI IDE** built with Electron. It is **not** networking hardware unless the brief explicitly asks for Wi‑Fi equipment.`,
  );
  lines.push(
    `- **Spelling**: Any readable title chrome, captions, watermark, lower-third, or marquee must spell the product **exactly** as "Router Studio" (capital **R**, capital **S**). Forbidden creative spellings (examples): Raouter, Rauter, Routter, Rutor Studio, Rustio/Raututio/Rautio, Rawter Studio, Routur Studio.`,
  );

  lines.push(
    `- **Avoid fake IDE text**: Do not generate blocks of monospace that look like "code" unless you can render real, coherent lines (most video models fail here). Prefer: shallow depth-of-field so editor areas are softened, glare/bloom covering code panes, abstract placeholder panels, blurred glyphs, silhouette UI, subtle motion-blur zooms. Legible UI chrome may show only the exact title "Router Studio" and minimalist menu icons — no fabricated filenames, subtitles, paragraphs, sidebar labels, or terminal output.`,
  );

  if (opts.hasFirstFrame) {
    lines.push(
      `- **First frame fidelity**: Treat the supplied \`first_frame\` image as **ground truth** for the opening frame (layout, colors, typography weight, sidebar density, spacing). Camera motion between first and subsequent frames must be a **continuation** from that screenshot — do **not** replace it with an unrelated generic IDE or "router appliance" motif.`,
    );
  }
  if (opts.hasLastFrame) {
    lines.push(
      `- **Last frame**: Align the finale with the provided \`last_frame\` conditioning when present.`,
    );
  }
  if (opts.referenceOnlyVisual) {
    lines.push(
      `- **Reference-only image**: Images are supplied as references (not enforced start/end frames). Match palette, typography scale, composition, and product chrome from those references.`,
    );
  }

  if (opts.silentVideoDesired) {
    lines.push(
      `- **Audio**: Produce a **SILENT clip** (\`generate_audio=false\`): no synthesized speech, no music beds, no SFX, no environmental sync sound. If your pipeline multiplexes silence, flatten to negligible / empty audio.`,
    );
  }

  lines.push('');
  lines.push('--- User brief ---');
  lines.push(base);

  return lines.join('\n');
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  NormalizedModel,
  OpenRouterVideoSubmitRequest,
  OpenRouterVideoAudioPreference,
} from '../../shared/types';
import { resolveVideoJobModelId } from '../lib/autoModelRouting';
import { toast } from './ToastContainer';
import { useSettings } from '../store/settingsStore';

const ASPECT_OPTIONS = ['', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'] as const;
const RES_OPTIONS = ['', '480p', '720p', '1080p', '1K', '2K', '4K'] as const;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read image file.'));
    r.readAsDataURL(file);
  });
}

export interface VideoGenerationModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with a complete submit request (`model` must be resolved). */
  onGenerate: (req: OpenRouterVideoSubmitRequest) => void;
  busy: boolean;
  settings: AppSettings;
  models: NormalizedModel[];
  freeModeEnabled: boolean;
  initialPrompt: string;
  /** Up to two composer image data URLs → pre-fill first / last frame when the modal opens. */
  composerSeedImageUrls?: string[];
}

export default function VideoGenerationModal({
  open,
  onClose,
  onGenerate,
  busy,
  settings,
  models,
  freeModeEnabled,
  initialPrompt,
  composerSeedImageUrls,
}: VideoGenerationModalProps) {
  const updateSettings = useSettings((s) => s.update);
  const videoModels = useMemo(
    () =>
      models
        .filter(
          (m) => m.categories.includes('video-gen') || m.outputModalities.includes('video'),
        )
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [models],
  );

  const [prompt, setPrompt] = useState('');
  const [modelChoice, setModelChoice] = useState('');
  const [aspect, setAspect] = useState('');
  const [resolution, setResolution] = useState('');
  const [durationDraft, setDurationDraft] = useState('');
  const [seedDraft, setSeedDraft] = useState('');
  const [audioMode, setAudioMode] = useState<OpenRouterVideoAudioPreference>('auto');
  const [firstFrameUrl, setFirstFrameUrl] = useState('');
  const [lastFrameUrl, setLastFrameUrl] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');

  /** Latest composer image URLs — read inside the open-reset effect so attachment changes mid-session do not wipe edits. */
  const composerSeedRef = useRef<string[]>([]);
  composerSeedRef.current = (composerSeedImageUrls ?? [])
    .map((u) => (u ?? '').trim())
    .filter(Boolean)
    .slice(0, 2);

  useEffect(() => {
    if (!open) return;
    setPrompt(initialPrompt ?? '');
    setModelChoice(settings.openRouterVideoModel ?? '');
    setAspect(settings.openRouterVideoAspectRatio ?? '');
    setResolution(settings.openRouterVideoResolution ?? '');
    setDurationDraft('');
    setSeedDraft('');
    setAudioMode(settings.openRouterVideoAudio);
    const seeds = composerSeedRef.current;
    setFirstFrameUrl(seeds[0] ?? '');
    setLastFrameUrl(seeds[1] ?? '');
    setReferenceUrl('');
  }, [
    open,
    initialPrompt,
    settings.openRouterVideoModel,
    settings.openRouterVideoAspectRatio,
    settings.openRouterVideoResolution,
    settings.openRouterVideoAudio,
  ]);

  if (!open) return null;

  const buildRequest = (): OpenRouterVideoSubmitRequest => {
    const model = (modelChoice ?? '').trim()
      ? (modelChoice ?? '').trim()
      : resolveVideoJobModelId(settings, models, freeModeEnabled);

    const durationParsed = (durationDraft ?? '').trim()
      ? Number.parseInt(durationDraft, 10)
      : NaN;
    const duration =
      Number.isFinite(durationParsed) && durationParsed > 0 ? durationParsed : undefined;

    const seedParsed = (seedDraft ?? '').trim() ? Number.parseInt(seedDraft, 10) : NaN;
    const seed = Number.isFinite(seedParsed) ? seedParsed : undefined;

    const frame_images: OpenRouterVideoSubmitRequest['frame_images'] = [];
    if ((firstFrameUrl ?? '').trim()) {
      frame_images.push({
        type: 'image_url',
        image_url: { url: (firstFrameUrl ?? '').trim() },
        frame_type: 'first_frame',
      });
    }
    if ((lastFrameUrl ?? '').trim()) {
      frame_images.push({
        type: 'image_url',
        image_url: { url: (lastFrameUrl ?? '').trim() },
        frame_type: 'last_frame',
      });
    }

    const input_references: OpenRouterVideoSubmitRequest['input_references'] = [];
    if ((referenceUrl ?? '').trim() && frame_images.length === 0) {
      input_references.push({
        type: 'image_url',
        image_url: { url: (referenceUrl ?? '').trim() },
      });
    }

    let generate_audio: boolean | undefined;
    if (audioMode === 'on') generate_audio = true;
    else if (audioMode === 'off') generate_audio = false;

    const ar = (aspect ?? '').trim();
    const res = (resolution ?? '').trim();
    const p = (prompt ?? '').trim();

    return {
      model,
      prompt: p,
      ...(ar ? { aspect_ratio: ar } : {}),
      ...(res ? { resolution: res } : {}),
      ...(duration != null ? { duration } : {}),
      ...(seed != null ? { seed } : {}),
      ...(generate_audio !== undefined ? { generate_audio } : {}),
      ...(frame_images.length > 0 ? { frame_images } : {}),
      ...(input_references.length > 0 ? { input_references } : {}),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(settings.apiKey ?? '').trim()) {
      toast.error('OpenRouter', 'Add your API key in Settings → API.');
      return;
    }
    const req = buildRequest();
    if (!(req.prompt ?? '').trim()) return;
    void updateSettings({ openRouterVideoAudio: audioMode });
    onGenerate(req);
  };

  const pickFrame = async (which: 'first' | 'last' | 'ref', file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const url = await fileToDataUrl(file);
      if (which === 'first') setFirstFrameUrl(url);
      else if (which === 'last') setLastFrameUrl(url);
      else setReferenceUrl(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="modal-scrim fixed inset-0 z-[201000] flex items-center justify-center p-4 ds-transition"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-gen-title"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div className="glass-panel glass-modal-lg max-h-[min(92vh,860px)] w-full max-w-2xl overflow-hidden ds-transition">
        <div className="flex items-start justify-between gap-2 border-b border-border-soft px-4 py-3">
          <div>
            <h2 id="video-gen-title" className="text-sm font-semibold text-fg">
              Generate video
            </h2>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              OpenRouter{' '}
              <code className="text-[10px]">POST /api/v1/videos</code> — async job, then poll.{' '}
              <a
                className="text-accent underline-offset-2 hover:underline"
                href="https://openrouter.ai/docs/guides/overview/multimodal/video-generation"
                target="_blank"
                rel="noreferrer"
              >
                Docs
              </a>
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-fg-muted hover:text-fg"
            onClick={onClose}
            title="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[min(80vh,760px)] flex-col">
          <div className="space-y-3 overflow-y-auto px-4 py-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Describe motion, lighting, camera, scene…"
                className="w-full resize-y rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Video model</label>
                <select
                  value={modelChoice}
                  onChange={(e) => setModelChoice(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">Auto (from default / free rules)</option>
                  {videoModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Audio</label>
                <select
                  value={audioMode}
                  onChange={(e) => setAudioMode(e.target.value as OpenRouterVideoAudioPreference)}
                  className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="auto">
                    Auto — omit generate_audio (provider default; many models add synced sound)
                  </option>
                  <option value="on">With synthesized audio — send generate_audio=true</option>
                  <option value="off">Silent — send generate_audio=false</option>
                </select>
                <p className="mt-1 text-[10px] leading-snug text-fg-subtle">
                  Use <strong className="text-fg-muted">Silent</strong> when you want no music, speech, or
                  SFX. Also set in{' '}
                  <strong className="text-fg-muted">Settings → Models → Video generation</strong> to apply{' '}
                  <code className="text-[9px]">/video</code> slash jobs.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Aspect</label>
                <select
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                >
                  {ASPECT_OPTIONS.map((o) => (
                    <option key={o || 'a'} value={o}>
                      {o ? o : 'Default'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                >
                  {RES_OPTIONS.map((o) => (
                    <option key={o || 'r'} value={o}>
                      {o ? o : 'Default'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Duration (s)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Optional"
                  value={durationDraft}
                  onChange={(e) => setDurationDraft(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-sm focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Seed</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Optional — not all models honor this"
                value={seedDraft}
                onChange={(e) => setSeedDraft(e.target.value)}
                className="w-full max-w-xs rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <div className="rounded-md border border-border-soft bg-bg-soft/50 p-3">
              <div className="mb-2 text-xs font-semibold text-fg-muted">Image-to-video (optional)</div>
              <p className="mb-2 text-[10px] leading-snug text-fg-subtle">
                First/last frame map to OpenRouter{' '}
                <code className="text-[9px]">frame_images</code> (HTTPS URLs or paste a{' '}
                <code className="text-[9px]">data:image/…</code> from Pick). If you attached one or two
                images in the composer before opening Generate video, the first matching shots are prefilled
                here (edit or replace as needed). If both frame fields are set, the reference image below is
                ignored.
              </p>
              <div className="space-y-2">
                <div>
                  <span className="mb-0.5 block text-[10px] font-medium text-fg-muted">First frame</span>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      spellCheck={false}
                      value={firstFrameUrl}
                      onChange={(e) => setFirstFrameUrl(e.target.value)}
                      placeholder="Image URL or data URL"
                      className="min-w-[12rem] flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-[11px] focus:border-accent focus:outline-none"
                    />
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-fg-muted hover:bg-bg-hover">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void pickFrame('first', e.target.files?.[0] ?? null)}
                      />
                      Pick image
                    </label>
                  </div>
                </div>
                <div>
                  <span className="mb-0.5 block text-[10px] font-medium text-fg-muted">Last frame</span>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      spellCheck={false}
                      value={lastFrameUrl}
                      onChange={(e) => setLastFrameUrl(e.target.value)}
                      placeholder="Image URL or data URL"
                      className="min-w-[12rem] flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-[11px] focus:border-accent focus:outline-none"
                    />
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-fg-muted hover:bg-bg-hover">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void pickFrame('last', e.target.files?.[0] ?? null)}
                      />
                      Pick image
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border-soft bg-bg-soft/50 p-3">
              <div className="mb-2 text-xs font-semibold text-fg-muted">Reference image (optional)</div>
              <p className="mb-2 text-[10px] leading-snug text-fg-subtle">
                Style / content guidance via <code className="text-[9px]">input_references</code>. Skipped if
                you set first or last frame above.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  spellCheck={false}
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                  placeholder="HTTPS or data URL"
                  className="min-w-[12rem] flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-[11px] focus:border-accent focus:outline-none"
                />
                <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-fg-muted hover:bg-bg-hover">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void pickFrame('ref', e.target.files?.[0] ?? null)}
                  />
                  Pick image
                </label>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-soft bg-bg-elevated/80 px-4 py-3">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-hover hover:text-fg"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-accent/25 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Starting…' : 'Start generation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

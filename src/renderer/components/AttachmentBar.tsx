import { useApp } from '../store/appStore';
import { attachmentBadge, attachmentLabel, humanSize } from '../lib/attachments';

export default function AttachmentBar() {
  const attachments = useApp((s) => s.attachments);
  const remove = useApp((s) => s.removeAttachment);
  const clear = useApp((s) => s.clearAttachments);

  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border-soft bg-bg-soft px-3 py-2">
      {attachments.map((a) => (
        <div
          key={a.id}
          className="group flex max-w-[220px] items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-fg-muted"
          title={attachmentLabel(a)}
        >
          {a.kind === 'image' && a.imageUrl && (
            <img
              src={a.imageUrl}
              alt=""
              className="h-5 w-5 shrink-0 rounded object-cover"
            />
          )}
          <span className="rounded bg-accent/15 px-1 text-[9px] font-semibold uppercase text-accent">
            {attachmentBadge(a)}
          </span>
          <span className="truncate text-fg">{attachmentLabel(a)}</span>
          {a.sizeBytes && (
            <span className="shrink-0 text-fg-subtle">{humanSize(a.sizeBytes)}</span>
          )}
          <button
            onClick={() => remove(a.id)}
            className="shrink-0 rounded px-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
            title="Remove attachment"
          >
            ×
          </button>
        </div>
      ))}
      {attachments.length > 1 && (
        <button
          onClick={clear}
          className="rounded px-1.5 text-[11px] text-fg-subtle hover:bg-bg-hover hover:text-fg"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

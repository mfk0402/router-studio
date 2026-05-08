import type { ProductMode } from '../../shared/types';
import { PRODUCT_MODE_SEQUENCE } from '../../shared/productMode';
import { useSettings } from '../store/settingsStore';
import { useTools } from '../store/toolsStore';

const LABELS: Record<ProductMode, string> = {
  chat: 'Chat',
  learn: 'Learn',
  edit: 'Edit',
  agent: 'Agent',
  architect: 'Architect',
  review: 'Review',
  ship: 'Ship',
};

export function ModeSwitcher({ compact = false }: { compact?: boolean }) {
  const mode = useSettings((s) => s.settings.productMode);
  const update = useSettings((s) => s.update);
  const loadDefinitions = useTools((s) => s.loadDefinitions);

  return (
    <label className={compact ? 'flex items-center gap-1' : 'flex flex-col gap-0.5'}>
      <span className="sr-only">Product mode</span>
      <select
        value={mode}
        title="Working mode (tools + prompts): Chat / Learn / Edit / Agent / Architect / Review / Ship. Shortcut: Ctrl+Shift+1…7"
        onChange={(e) => {
          const pm = e.target.value as ProductMode;
          void update({ productMode: pm }).then(() => loadDefinitions(pm));
        }}
        className={
          compact
            ? 'max-w-[7.5rem] rounded border border-border bg-bg px-1 py-0.5 text-[10px] text-fg-muted'
            : 'rounded-lg border border-border bg-bg px-2 py-1 text-[11px] font-medium text-fg-muted'
        }
      >
        {PRODUCT_MODE_SEQUENCE.map((m) => (
          <option key={m} value={m}>
            {LABELS[m]}
          </option>
        ))}
      </select>
    </label>
  );
}

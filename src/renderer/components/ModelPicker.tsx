import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import {
  CATEGORY_META,
  PRICE_TIER_META,
  balancedIn,
  cheapestIn,
  filterModels,
  formatContext,
  formatPricePerM,
  formatVideoSkuPriceSummary,
  premiumIn,
  priceRange,
  priceTierLabel,
  sortModels,
  type SortKey,
} from '../lib/modelFilters';
import { fetchModels, clearCachedModels } from '../lib/openrouterClient';
import { getCompletionRouting, canRefreshModelCatalog } from '../lib/completionRouting';
import { ROUTER_STUDIO_AUTO } from '../lib/autoModelRouting';
import type { ModelCategory, NormalizedModel, PriceTier } from '../../shared/types';
import logoIcon from '../assets/logo-icon.png';

const CATEGORIES: Array<'all' | ModelCategory> = [
  'all',
  'coding',
  'chat',
  'reasoning',
  'vision',
  'image-gen',
  'video-gen',
  'audio',
  'fast',
  'large-context',
  'free',
];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'price-asc', label: 'Cheapest first' },
  { key: 'price-desc', label: 'Most expensive' },
  { key: 'context-desc', label: 'Biggest context' },
  { key: 'name-asc', label: 'Name (A→Z)' },
];

export default function ModelPicker() {
  const open = useApp((s) => s.showModelPicker);
  const setOpen = useApp((s) => s.setShowModelPicker);
  const models = useApp((s) => s.models);
  const setModels = useApp((s) => s.setModels);
  const modelsLoading = useApp((s) => s.modelsLoading);
  const setModelsLoading = useApp((s) => s.setModelsLoading);
  const pushLog = useApp((s) => s.pushLog);
  const freeModeEnabled = useApp((s) => s.freeModeEnabled);

  const settings = useSettings((s) => s.settings);
  const updateSettings = useSettings((s) => s.update);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | ModelCategory>('all');
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [sort, setSort] = useState<SortKey>('price-asc');

  useEffect(() => {
    if (!open) {
      setQuery('');
      setCategory('all');
      setPriceTiers([]);
      setSort('price-asc');
    }
  }, [open]);

  const filteredSorted = useMemo(
    () =>
      sortModels(filterModels(models, { query, category, priceTiers }), sort),
    [models, query, category, priceTiers, sort],
  );

  const cheapest = useMemo(() => cheapestIn(models, category), [models, category]);
  const premium = useMemo(() => premiumIn(models, category), [models, category]);
  const balanced = useMemo(() => balancedIn(models, category), [models, category]);

  if (!open) return null;

  const refresh = async () => {
    if (!canRefreshModelCatalog(settings)) {
      pushLog('warn', 'Set a local completion base URL in Settings → Models to refresh the catalog.');
      return;
    }
    setModelsLoading(true);
    try {
      clearCachedModels();
      const routing = getCompletionRouting(settings);
      const fresh = await fetchModels(settings.apiKey ?? '', routing.openAiBaseUrl);
      setModels(fresh);
      pushLog('info', `Refreshed ${fresh.length} models.`);
    } catch (e) {
      pushLog('error', `Refresh failed: ${(e as Error).message}`);
    } finally {
      setModelsLoading(false);
    }
  };

  const pick = async (m: NormalizedModel) => {
    if (freeModeEnabled && !m.isFree) {
      pushLog('warn', 'Free Mode is enabled. Disable it to select paid models.');
      return;
    }
    await updateSettings({ defaultModel: m.id, activeModelProfile: 'custom' });
    pushLog('info', `Default model set to ${m.id} (${formatPricePerM(m.avgPricePerM)})`);
    setOpen(false);
  };

  const pickAuto = async (kind: 'infer' | 'category', cat?: ModelCategory) => {
    if (getCompletionRouting(settings).openAiBaseUrl) {
      pushLog('warn', 'Auto routing applies to OpenRouter completions. Switch provider from Local in Settings → Models.');
      return;
    }
    if (freeModeEnabled) {
      pushLog('warn', 'Disable Free Mode to use category auto-routing.');
      return;
    }
    const id = kind === 'infer' ? ROUTER_STUDIO_AUTO : `router-studio/auto:${cat}`;
    await updateSettings({ defaultModel: id, activeModelProfile: 'custom' });
    pushLog(
      'info',
      kind === 'infer'
        ? 'Default: Auto — infers task type and picks the cheapest suitable model each turn.'
        : `Default: Auto — always use the cheapest model in “${CATEGORY_META[cat as ModelCategory].label}”.`,
    );
    setOpen(false);
  };

  const togglePriceTier = (t: PriceTier) => {
    setPriceTiers((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );
  };

  return (
    <div className="modal-scrim fixed inset-0 z-[110] flex items-start justify-center p-6">
      <div className="glass-panel glass-modal-lg flex h-full w-full max-w-6xl flex-col overflow-hidden ds-transition">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="brand-mark-icon-wrap mt-0.5">
              <img
                src={logoIcon}
                alt=""
                className="h-7 w-7 shrink-0 select-none"
                draggable={false}
              />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg">Model Marketplace</div>
              <div className="text-[11px] text-fg-muted">
                Pick by category + price. {models.length} models available.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              {modelsLoading ? 'Refreshing…' : 'Refresh Models'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left: category sidebar */}
          <aside className="flex w-56 shrink-0 flex-col border-r border-border-soft">
            <div className="border-b border-border-soft px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
              Categories
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {CATEGORIES.map((c) => {
                const meta = CATEGORY_META[c];
                const range = priceRange(models, c);
                const active = category === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={[
                      'flex w-full flex-col items-start gap-0.5 border-l-2 px-3 py-2 text-left text-xs transition',
                      active
                        ? 'border-accent bg-accent/10 text-fg'
                        : 'border-transparent text-fg-muted hover:bg-bg-hover hover:text-fg',
                    ].join(' ')}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 text-center text-fg-subtle">{meta.icon}</span>
                        <span className="font-medium">{meta.label}</span>
                      </span>
                      <span className="text-[10px] text-fg-subtle">{range.count}</span>
                    </div>
                    <div className="w-full truncate text-[10px] text-fg-subtle">
                      {range.count === 0
                        ? 'no models'
                        : range.min === 0 && range.max === 0
                        ? range.anyFree
                          ? 'free'
                          : 'pricing unknown'
                        : `${range.anyFree ? 'free · ' : ''}$${range.min.toFixed(
                            2,
                          )}–$${range.max.toFixed(0)}/M`}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right: search + filters + quick-pick + list */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="space-y-2 border-b border-border-soft px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search within this category…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="rounded-md border border-border bg-bg px-2 py-2 text-xs focus:border-accent focus:outline-none"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[11px] text-fg-subtle">Price:</span>
                {(Object.keys(PRICE_TIER_META) as PriceTier[]).map((t) => {
                  const meta = PRICE_TIER_META[t];
                  const on = priceTiers.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => togglePriceTier(t)}
                      title={meta.helper}
                      className={[
                        'rounded-full border px-2 py-0.5 text-[11px]',
                        on
                          ? 'border-accent/40 bg-accent/20 text-fg'
                          : 'border-border text-fg-muted hover:bg-bg-hover',
                      ].join(' ')}
                    >
                      {meta.label}
                    </button>
                  );
                })}
                {priceTiers.length > 0 && (
                  <button
                    onClick={() => setPriceTiers([])}
                    className="ml-1 text-[11px] text-fg-subtle hover:text-fg"
                  >
                    clear
                  </button>
                )}
              </div>
            </div>

            {/* Auto: infer task or lock to sidebar category */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border-soft bg-bg-deep/40 px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                Auto
              </span>
              <button
                type="button"
                onClick={() => void pickAuto('infer')}
                className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-accent hover:bg-accent/20"
              >
                Infer task → cheapest fit
              </button>
              {category !== 'all' ? (
                <button
                  type="button"
                  onClick={() => void pickAuto('category', category)}
                  className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
                >
                  Lock to this category: cheapest only
                </button>
              ) : null}
              <span className="text-[10px] text-fg-subtle">
                Overrides: set an explicit model, or set Read / Reasoning models in Settings → Agent.
              </span>
            </div>

            {/* Quick-pick row (cheapest / balanced / premium) */}
            <div className="flex flex-wrap items-stretch gap-2 border-b border-border-soft bg-bg-soft px-4 py-3">
              <QuickPick
                label="Cheapest"
                subtitle="lowest price"
                model={cheapest}
                emptyText="no priced models"
                onPick={pick}
                accent="success"
              />
              <QuickPick
                label="Balanced"
                subtitle="median priced"
                model={balanced}
                emptyText="no mid-tier models"
                onPick={pick}
                accent="accent"
              />
              <QuickPick
                label="Premium"
                subtitle="most capable"
                model={premium}
                emptyText="no premium models"
                onPick={pick}
                accent="warn"
              />
            </div>

            {/* Model list */}
            <div className="min-h-0 flex-1 overflow-auto">
              {filteredSorted.length === 0 ? (
                <div className="p-6 text-center text-xs text-fg-muted">
                  No models match these filters.{' '}
                  {models.length === 0 ? 'Try refreshing.' : 'Adjust your query.'}
                </div>
              ) : (
                <ul className="divide-y divide-border-soft">
                  {filteredSorted.map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      selected={settings.defaultModel === m.id}
                      onPick={() => void pick(m)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickPick({
  label,
  subtitle,
  model,
  emptyText,
  onPick,
  accent,
}: {
  label: string;
  subtitle: string;
  model: NormalizedModel | null;
  emptyText: string;
  onPick: (m: NormalizedModel) => void;
  accent: 'success' | 'accent' | 'warn';
}) {
  const tone =
    accent === 'success'
      ? 'border-success/40 bg-success/10 text-success'
      : accent === 'warn'
      ? 'border-warn/40 bg-warn/10 text-warn'
      : 'border-accent/40 bg-accent/10 text-accent';

  return (
    <div className="flex min-w-[200px] flex-1 flex-col justify-between rounded-md border border-border bg-bg-elevated p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
          {label}
        </span>
        <span className="text-[10px] text-fg-subtle">{subtitle}</span>
      </div>
      {model ? (
        <>
          <div className="truncate text-sm font-medium text-fg" title={model.name}>
            {model.name}
          </div>
          <div className="truncate text-[11px] text-fg-muted">{model.id}</div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-fg-muted">
            <span>
              {formatVideoSkuPriceSummary(model.raw) ? (
                <span title="OpenRouter async video API — not per chat token">{formatVideoSkuPriceSummary(model.raw)}</span>
              ) : (
                <>
                  in {formatPricePerM(model.inPricePerM)} · out {formatPricePerM(model.outPricePerM)}
                </>
              )}
            </span>
            <span>ctx {formatContext(model.contextLength)}</span>
          </div>
          <button
            onClick={() => onPick(model)}
            className="mt-2 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/80"
          >
            Use this
          </button>
        </>
      ) : (
        <div className="py-2 text-xs text-fg-subtle">{emptyText}</div>
      )}
    </div>
  );
}

function ModelRow({
  model,
  selected,
  onPick,
}: {
  model: NormalizedModel;
  selected: boolean;
  onPick: () => void;
}) {
  const tierColor =
    model.priceTier === 'free'
      ? 'bg-success/20 text-success'
      : model.priceTier === 'cheap'
      ? 'bg-accent/20 text-accent'
      : model.priceTier === 'mid'
      ? 'bg-warn/15 text-warn'
      : 'bg-danger/15 text-danger';

  return (
    <li
      className={[
        'cursor-pointer px-4 py-3 transition',
        selected ? 'bg-accent/10' : 'hover:bg-bg-hover',
      ].join(' ')}
      onClick={onPick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate">
            <span className="truncate font-medium text-fg">{model.name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tierColor}`}>
              {priceTierLabel(model.priceTier)}
            </span>
            {model.categories.includes('vision') && <MiniTag>vision</MiniTag>}
            {model.categories.includes('image-gen') && <MiniTag>image-gen</MiniTag>}
            {model.categories.includes('video-gen') && <MiniTag>video-gen</MiniTag>}
            {model.categories.includes('audio') && <MiniTag>audio</MiniTag>}
            {model.categories.includes('reasoning') && <MiniTag>reasoning</MiniTag>}
            {model.categories.includes('coding') && <MiniTag>coding</MiniTag>}
            {model.categories.includes('fast') && <MiniTag>fast</MiniTag>}
          </div>
          <div className="truncate text-xs text-fg-muted">{model.id}</div>
          {model.description && (
            <div className="mt-1 line-clamp-2 text-[11px] text-fg-subtle">
              {model.description}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right text-[11px] text-fg-muted">
          <div>ctx {formatContext(model.contextLength)}</div>
          {formatVideoSkuPriceSummary(model.raw) ? (
            <div className="max-w-[12rem]" title="OpenRouter video API SKUs (not per chat token)">
              {formatVideoSkuPriceSummary(model.raw)}
            </div>
          ) : (
            <>
              <div>in {formatPricePerM(model.inPricePerM)}</div>
              <div>out {formatPricePerM(model.outPricePerM)}</div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function MiniTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-border px-1 py-0 text-[9px] uppercase tracking-wide text-fg-subtle">
      {children}
    </span>
  );
}

import { useMemo } from 'react';
import type { NormalizedModel } from '../../shared/types';

interface TokenMeterProps {
  inputTokens: number;
  outputTokens: number;
  model: NormalizedModel | null;
  isStreaming?: boolean;
}

export default function TokenMeter({
  inputTokens,
  outputTokens,
  model,
  isStreaming,
}: TokenMeterProps) {
  const cost = useMemo(() => {
    if (!model) return null;

    const inputCost = (inputTokens / 1_000_000) * model.inPricePerM;
    const outputCost = (outputTokens / 1_000_000) * model.outPricePerM;
    const total = inputCost + outputCost;

    return {
      input: inputCost,
      output: outputCost,
      total,
    };
  }, [inputTokens, outputTokens, model]);

  const totalTokens = inputTokens + outputTokens;

  // Estimate context usage
  const contextUsage = model?.contextLength
    ? Math.min((totalTokens / model.contextLength) * 100, 100)
    : 0;

  return (
    <div className="flex items-center gap-3 text-[10px] text-fg-subtle">
      {/* Token count */}
      <div className="flex items-center gap-1.5">
        <span title="Input tokens">↑{formatNumber(inputTokens)}</span>
        <span className="text-fg-subtle/50">/</span>
        <span title="Output tokens" className={isStreaming ? 'animate-pulse' : ''}>
          ↓{formatNumber(outputTokens)}
        </span>
      </div>

      {/* Cost */}
      {cost && cost.total > 0 && (
        <div className="flex items-center gap-1" title={`In: $${cost.input.toFixed(6)} / Out: $${cost.output.toFixed(6)}`}>
          <span className="text-fg-subtle/70">$</span>
          <span>{cost.total < 0.01 ? cost.total.toFixed(4) : cost.total.toFixed(3)}</span>
        </div>
      )}

      {/* Context bar */}
      {model?.contextLength && contextUsage > 0 && (
        <div className="flex items-center gap-1" title={`${contextUsage.toFixed(1)}% of ${formatNumber(model.contextLength)} context`}>
          <div className="h-1 w-12 overflow-hidden rounded-full bg-fg-subtle/20">
            <div
              className={`h-full transition-all ${
                contextUsage > 90
                  ? 'bg-danger'
                  : contextUsage > 70
                    ? 'bg-warn'
                    : 'bg-accent'
              }`}
              style={{ width: `${contextUsage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Estimate token count from text.
 * Rule of thumb: ~4 chars per token for English.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

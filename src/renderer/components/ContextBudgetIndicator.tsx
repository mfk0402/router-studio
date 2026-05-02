import { useMemo } from 'react';
import { formatTokens } from '../lib/contextPacker';

interface Props {
  usedTokens: number;
  maxTokens: number;
  reservedTokens: number;
  summarizedTurns?: number;
}

export function ContextBudgetIndicator({
  usedTokens,
  maxTokens,
  reservedTokens,
  summarizedTurns = 0,
}: Props) {
  const budget = maxTokens - reservedTokens;
  const percentage = Math.min(100, Math.round((usedTokens / budget) * 100));

  const statusColor = useMemo(() => {
    if (percentage >= 90) return 'text-red-400';
    if (percentage >= 75) return 'text-yellow-400';
    return 'text-green-400';
  }, [percentage]);

  const barColor = useMemo(() => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  }, [percentage]);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      {/* Progress bar */}
      <div className="w-24 h-1.5 bg-[#333] rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Token count */}
      <span className={statusColor}>
        {formatTokens(usedTokens)} / {formatTokens(budget)}
      </span>

      {/* Summarized indicator */}
      {summarizedTurns > 0 && (
        <span className="text-blue-400" title={`${summarizedTurns} older messages were summarized to save space`}>
          ({summarizedTurns} summarized)
        </span>
      )}

      {/* Warning icon if near limit */}
      {percentage >= 90 && (
        <span className="text-red-400" title="Context window nearly full. Consider starting a new chat.">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      )}
    </div>
  );
}

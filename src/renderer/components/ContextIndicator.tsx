import { useMemo, useState } from 'react';
import { useApp, type ChatMsg } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import {
  analyzeContext,
  compactContextLocally,
  summarizeContext,
  formatTokenCount,
  DEFAULT_SUMMARIZATION_CONFIG,
} from '../lib/contextSummarizer';
import { toast } from './ToastContainer';

interface Props {
  onCompact?: () => void;
}

export function ContextIndicator({ onCompact }: Props) {
  const chat = useApp((s) => s.chat);
  const replaceChat = useApp((s) => s.replaceChat);
  const settings = useSettings((s) => s.settings);
  const [compacting, setCompacting] = useState(false);

  const analysis = useMemo(() => analyzeContext(chat), [chat]);

  // Determine status color based on usage
  const statusColor = useMemo(() => {
    if (analysis.percentUsed >= 90) return 'text-red-400';
    if (analysis.percentUsed >= 70) return 'text-yellow-400';
    if (analysis.percentUsed >= 50) return 'text-blue-400';
    return 'text-green-400';
  }, [analysis.percentUsed]);

  const barColor = useMemo(() => {
    if (analysis.percentUsed >= 90) return 'bg-red-500';
    if (analysis.percentUsed >= 70) return 'bg-yellow-500';
    if (analysis.percentUsed >= 50) return 'bg-blue-500';
    return 'bg-green-500';
  }, [analysis.percentUsed]);

  const handleCompact = async (useAI: boolean) => {
    if (chat.length < DEFAULT_SUMMARIZATION_CONFIG.minMessagesForSummary) {
      toast.info('Not enough messages to summarize yet');
      return;
    }

    setCompacting(true);
    try {
      let result;

      if (useAI && settings.apiKey) {
        toast.info('Generating AI summary...');
        result = await summarizeContext(
          chat,
          settings.apiKey,
          settings.defaultModel,
        );
      } else {
        result = compactContextLocally(chat);
      }

      if (result) {
        // Replace chat with compacted version
        replaceChat(result.newMessages);

        const savedTokens = analysis.totalTokens - result.newMessages.reduce(
          (sum, m) => sum + Math.ceil(m.content.length / 3.5),
          0,
        );

        toast.success(
          `Compacted ${analysis.messagesToSummarize || chat.length - result.newMessages.length} messages, saved ~${formatTokenCount(savedTokens)} tokens`,
        );
        onCompact?.();
      } else {
        toast.info('No compaction needed');
      }
    } catch (e) {
      toast.error(`Compaction failed: ${(e as Error).message}`);
    } finally {
      setCompacting(false);
    }
  };

  if (chat.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-[10px]">
      {/* Token usage bar */}
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 bg-[#333] rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-300`}
            style={{ width: `${Math.min(100, analysis.percentUsed)}%` }}
          />
        </div>
        <span className={statusColor}>
          {formatTokenCount(analysis.totalTokens)}
        </span>
      </div>

      {/* Message count */}
      <span className="text-fg-subtle">
        {analysis.messageCount} msgs
      </span>

      {/* Compact button */}
      {analysis.messageCount >= 6 && (
        <div className="relative group">
          <button
            onClick={() => handleCompact(false)}
            disabled={compacting}
            className={`
              px-1.5 py-0.5 rounded text-[9px] font-medium transition
              ${analysis.needsSummarization
                ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 animate-pulse'
                : 'bg-[#333] text-fg-muted hover:bg-[#444] hover:text-fg'}
              disabled:opacity-50 disabled:cursor-wait
            `}
            title={analysis.needsSummarization
              ? 'Context is getting large - click to compact'
              : 'Compact conversation history'}
          >
            {compacting ? (
              <span className="flex items-center gap-1">
                <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Compacting...
              </span>
            ) : (
              <>Compact</>
            )}
          </button>

          {/* Dropdown for AI summarization */}
          {settings.apiKey && !compacting && (
            <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-10">
              <div className="bg-[#252526] border border-[#444] rounded shadow-lg py-1 min-w-[120px]">
                <button
                  onClick={() => handleCompact(false)}
                  className="w-full px-3 py-1 text-left text-[10px] text-fg-muted hover:bg-[#333] hover:text-fg"
                >
                  Quick compact
                </button>
                <button
                  onClick={() => handleCompact(true)}
                  className="w-full px-3 py-1 text-left text-[10px] text-fg-muted hover:bg-[#333] hover:text-fg"
                >
                  AI summary
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warning icon if near limit */}
      {analysis.percentUsed >= 80 && (
        <span
          className="text-yellow-400"
          title={`Context is ${analysis.percentUsed}% full. Consider compacting.`}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
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

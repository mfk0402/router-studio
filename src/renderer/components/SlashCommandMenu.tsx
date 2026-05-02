import { useMemo } from 'react';
import { findMatchingCommands, type SlashCommand } from '../lib/slashCommands';

interface Props {
  input: string;
  onSelect: (command: SlashCommand) => void;
  visible: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  chat: '💬',
  code: '💻',
  files: '📁',
  git: '🔀',
  tools: '🔧',
  custom: '⚡',
};

export function SlashCommandMenu({ input, onSelect, visible }: Props) {
  const matchingCommands = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const prefix = input.slice(1).split(' ')[0];
    return findMatchingCommands(prefix).slice(0, 8);
  }, [input]);

  if (!visible || matchingCommands.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-80 max-h-64 overflow-auto rounded-lg border border-[#444] bg-[#1e1e1e] shadow-lg">
      <div className="px-3 py-1.5 text-[10px] text-fg-subtle border-b border-[#333] uppercase tracking-wider">
        Commands
      </div>
      <div className="py-1">
        {matchingCommands.map((cmd) => (
          <button
            key={cmd.name}
            onClick={() => onSelect(cmd)}
            className="w-full px-3 py-2 text-left hover:bg-[#2a2a2a] flex items-start gap-2 group"
          >
            <span className="text-base">{CATEGORY_ICONS[cmd.category] || '📌'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-accent font-medium">/{cmd.name}</span>
                {cmd.aliases && cmd.aliases.length > 0 && (
                  <span className="text-[10px] text-fg-subtle">
                    ({cmd.aliases.map((a) => `/${a}`).join(', ')})
                  </span>
                )}
              </div>
              <p className="text-xs text-fg-muted truncate">{cmd.description}</p>
              {cmd.usage && (
                <p className="text-[10px] text-fg-subtle mt-0.5 font-mono">{cmd.usage}</p>
              )}
            </div>
            <span className="text-[10px] text-fg-subtle opacity-0 group-hover:opacity-100">
              Tab
            </span>
          </button>
        ))}
      </div>
      <div className="px-3 py-1.5 text-[10px] text-fg-subtle border-t border-[#333]">
        Press <kbd className="px-1 py-0.5 rounded bg-[#333] text-fg-muted">Tab</kbd> to complete,{' '}
        <kbd className="px-1 py-0.5 rounded bg-[#333] text-fg-muted">Enter</kbd> to run
      </div>
    </div>
  );
}

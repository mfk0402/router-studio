import { memo, useMemo } from 'react';
import type { ChatMsg } from '../store/appStore';

interface SuggestedActionsProps {
  lastMessage: ChatMsg | null;
  onAction: (prompt: string) => void;
  disabled?: boolean;
}

interface ActionSuggestion {
  label: string;
  prompt: string;
  icon?: string;
}

/**
 * Analyze the last assistant message and suggest relevant follow-up actions
 */
function analyzeSuggestions(msg: ChatMsg | null): ActionSuggestion[] {
  if (!msg || msg.role !== 'assistant' || !msg.content) return [];

  const content = msg.content.toLowerCase();
  const suggestions: ActionSuggestion[] = [];

  // Check for code blocks - suggest improvements
  if (msg.content.includes('```')) {
    suggestions.push({
      label: 'Add tests',
      prompt: 'Please write unit tests for the code you just provided.',
    });
    suggestions.push({
      label: 'Explain code',
      prompt: 'Can you explain how this code works step by step?',
    });
    suggestions.push({
      label: 'Optimize',
      prompt: 'Can you optimize this code for better performance?',
    });
  }

  // Check for error mentions
  if (content.includes('error') || content.includes('exception') || content.includes('failed')) {
    suggestions.push({
      label: 'Debug further',
      prompt: 'Can you help me debug this issue further? What else could be wrong?',
    });
    suggestions.push({
      label: 'Alternative approach',
      prompt: 'Is there an alternative approach that might avoid this issue?',
    });
  }

  // Check for "done" or completion indicators
  if (content.includes('complete') || content.includes('finished') || content.includes('implemented')) {
    suggestions.push({
      label: 'Run tests',
      prompt: 'Please run the tests to verify everything works correctly.',
    });
    suggestions.push({
      label: 'Review changes',
      prompt: 'Can you summarize all the changes you made?',
    });
  }

  // Check for questions
  if (content.includes('?') || content.includes('would you like') || content.includes('should i')) {
    suggestions.push({
      label: 'Yes, continue',
      prompt: 'Yes, please continue with that approach.',
    });
    suggestions.push({
      label: 'Show alternatives',
      prompt: 'Can you show me some alternative approaches first?',
    });
  }

  // Check for file operations
  if (content.includes('file') || content.includes('created') || content.includes('modified')) {
    suggestions.push({
      label: 'Format code',
      prompt: 'Please format the modified files.',
    });
  }

  // Check for documentation
  if (content.includes('readme') || content.includes('documentation') || content.includes('docs')) {
    suggestions.push({
      label: 'Add examples',
      prompt: 'Can you add more examples to the documentation?',
    });
  }

  // Generic follow-ups if nothing specific detected
  if (suggestions.length === 0) {
    suggestions.push({
      label: 'Continue',
      prompt: 'Please continue.',
    });
    suggestions.push({
      label: 'More details',
      prompt: 'Can you provide more details?',
    });
  }

  // Always add these general options
  suggestions.push({
    label: 'Refactor',
    prompt: 'Can you refactor the code to be cleaner and more maintainable?',
  });

  // Limit to 4 suggestions
  return suggestions.slice(0, 4);
}

function SuggestedActionsInner({ lastMessage, onAction, disabled }: SuggestedActionsProps) {
  const suggestions = useMemo(() => analyzeSuggestions(lastMessage), [lastMessage]);

  if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.streaming) {
    return null;
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-border-soft pt-3 mt-3">
      <span className="text-[10px] text-fg-subtle uppercase mr-2 self-center">Suggestions:</span>
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onAction(s.prompt)}
          disabled={disabled}
          className="rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-fg-muted hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(SuggestedActionsInner);

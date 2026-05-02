import { useState, useMemo } from 'react';

interface ThinkingPanelProps {
  content: string;
  isStreaming?: boolean;
}

// Patterns for detecting thinking/reasoning content
const THINKING_PATTERNS = [
  // XML-style tags
  { start: /<thinking>/gi, end: /<\/thinking>/gi, name: 'Thinking' },
  { start: /<reasoning>/gi, end: /<\/reasoning>/gi, name: 'Reasoning' },
  { start: /<thought>/gi, end: /<\/thought>/gi, name: 'Thought' },
  { start: /<analysis>/gi, end: /<\/analysis>/gi, name: 'Analysis' },
  { start: /<reflect>/gi, end: /<\/reflect>/gi, name: 'Reflection' },
  { start: /<internal_monologue>/gi, end: /<\/internal_monologue>/gi, name: 'Internal Monologue' },
  // OpenAI o1/o3 style
  { start: /\[Thinking\]/gi, end: /\[\/Thinking\]/gi, name: 'Thinking' },
  { start: /\[Reasoning\]/gi, end: /\[\/Reasoning\]/gi, name: 'Reasoning' },
  // DeepSeek R1 style
  { start: /【思考】/g, end: /【\/思考】/g, name: 'Thinking' },
  { start: /【推理】/g, end: /【\/推理】/g, name: 'Reasoning' },
];

interface ParsedContent {
  thinking: Array<{ name: string; content: string }>;
  answer: string;
}

function parseThinkingContent(content: string): ParsedContent {
  let workingContent = content;
  const thinkingBlocks: Array<{ name: string; content: string }> = [];

  // Try each pattern to extract thinking content
  for (const pattern of THINKING_PATTERNS) {
    const startMatches = [...workingContent.matchAll(pattern.start)];
    const endMatches = [...workingContent.matchAll(pattern.end)];

    if (startMatches.length > 0 && endMatches.length > 0) {
      // Extract content between tags
      for (let i = 0; i < Math.min(startMatches.length, endMatches.length); i++) {
        const startMatch = startMatches[i];
        const endMatch = endMatches[i];
        
        if (startMatch.index !== undefined && endMatch.index !== undefined) {
          const startIdx = startMatch.index + startMatch[0].length;
          const endIdx = endMatch.index;
          
          if (endIdx > startIdx) {
            const thinkingContent = workingContent.slice(startIdx, endIdx).trim();
            if (thinkingContent) {
              thinkingBlocks.push({
                name: pattern.name,
                content: thinkingContent,
              });
            }
          }
        }
      }

      // Remove the thinking tags and content from the answer
      workingContent = workingContent.replace(
        new RegExp(`${pattern.start.source}[\\s\\S]*?${pattern.end.source}`, 'gi'),
        ''
      );
    }
  }

  // Clean up the answer
  const answer = workingContent
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim();

  return { thinking: thinkingBlocks, answer };
}

export default function ThinkingPanel({ content, isStreaming }: ThinkingPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { thinking, answer } = useMemo(() => parseThinkingContent(content), [content]);

  // If no thinking content, just return the original content
  if (thinking.length === 0) {
    return null;
  }

  const totalThinkingLength = thinking.reduce((acc, t) => acc + t.content.length, 0);
  const thinkingTime = Math.round(totalThinkingLength / 50); // Rough estimate of "thinking time" in seconds

  return (
    <div className="mb-3">
      {/* Thinking toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-left transition-colors hover:bg-amber-500/10"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-xs">
          {isExpanded ? '🔽' : '💭'}
        </span>
        <span className="flex-1 text-xs font-medium text-amber-300">
          {thinking.length === 1 ? thinking[0].name : `${thinking.length} Thinking Steps`}
          {isStreaming && ' (streaming...)'}
        </span>
        <span className="text-[10px] text-amber-400/60">
          ~{thinkingTime}s · {totalThinkingLength.toLocaleString()} chars
        </span>
        <svg
          className={`h-4 w-4 text-amber-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded thinking content */}
      {isExpanded && (
        <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-amber-500/20 bg-amber-950/20">
          {thinking.map((block, idx) => (
            <div key={idx} className="border-b border-amber-500/10 last:border-b-0">
              {thinking.length > 1 && (
                <div className="border-b border-amber-500/10 bg-amber-500/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
                  {block.name} #{idx + 1}
                </div>
              )}
              <div className="p-3">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-amber-100/80">
                  {block.content}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper to get the answer without thinking content
export function extractAnswer(content: string): string {
  const { answer } = parseThinkingContent(content);
  return answer;
}

// Helper to check if content has thinking
export function hasThinkingContent(content: string): boolean {
  const { thinking } = parseThinkingContent(content);
  return thinking.length > 0;
}

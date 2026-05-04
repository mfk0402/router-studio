import type { ToolExecutionEvent } from '../../shared/types';
import type { ChatMsg } from '../store/appStore';

/**
 * Markdown receipt for the current chat tail + tool execution cards (copy into PRs / tickets).
 */
export function buildTaskReceiptMarkdown(opts: {
  chat: ChatMsg[];
  executions: Iterable<ToolExecutionEvent>;
  projectRoot: string | null;
  maxChatLines?: number;
}): string {
  const lines: string[] = [];
  const ts = new Date().toISOString();
  lines.push(`# Router Studio — task receipt`);
  lines.push('');
  lines.push(`- **Generated:** ${ts}`);
  if (opts.projectRoot) lines.push(`- **Project:** \`${opts.projectRoot}\``);
  lines.push('');

  const tail = opts.chat.slice(-(opts.maxChatLines ?? 12));
  if (tail.length > 0) {
    lines.push(`## Recent messages (${tail.length})`);
    lines.push('');
    for (const m of tail) {
      const role = m.role.toUpperCase();
      const preview =
        m.role === 'user'
          ? (m.displayContent ?? m.content).slice(0, 2000)
          : m.content.slice(0, 4000);
      lines.push(`### ${role}${m.modelUsed ? ` · ${m.modelUsed}` : ''}`);
      lines.push('');
      lines.push('```');
      lines.push(preview + (preview.length >= (m.role === 'user' ? 2000 : 4000) ? '\n…' : ''));
      lines.push('```');
      lines.push('');
    }
  }

  const execs = [...opts.executions];
  if (execs.length > 0) {
    lines.push(`## Tool runs (${execs.length})`);
    lines.push('');
    lines.push('| Tool | Status | Summary |');
    lines.push('|---|---|---|');
    for (const e of execs) {
      const summary =
        e.status === 'success'
          ? (e.result ?? '').slice(0, 240).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
          : (e.error ?? '').slice(0, 240).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      lines.push(
        `| \`${e.toolName}\` | ${e.status} | ${summary}${summary.length >= 240 ? '…' : ''} |`,
      );
    }
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`*Receipt generated locally by Router Studio — verify paths and commands before sharing.*`);
  return lines.join('\n');
}

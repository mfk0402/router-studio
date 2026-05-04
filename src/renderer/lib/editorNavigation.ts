import { useApp } from '../store/appStore';
import { extToLanguage } from './fileUtils';
import { stripProjectRoot, type FileLocationLink } from './outputLinkParse';

/**
 * Open a workspace file (or focus an existing tab) and queue a Monaco reveal.
 */
export async function openOrRevealFileAtLocation(
  loc: Pick<FileLocationLink, 'relativePath' | 'line' | 'column'>,
  projectRoot: string | null,
): Promise<void> {
  const st = useApp.getState();
  const rel = stripProjectRoot(loc.relativePath, projectRoot);
  if (!rel || rel.includes('..')) {
    st.pushLog('warn', 'Cannot open path outside the workspace.');
    return;
  }

  const existing = st.tabs.find((t) => t.relativePath === rel);
  if (!existing) {
    try {
      const content = await window.api.fs.readFile(rel);
      const name = rel.split('/').pop() || rel;
      st.openTab({
        relativePath: rel,
        name,
        language: extToLanguage(name),
        content,
        original: content,
        dirty: false,
      });
    } catch (e) {
      st.pushLog('error', `Could not open ${rel}: ${(e as Error).message}`);
      return;
    }
  } else {
    st.setActiveTab(rel);
  }

  st.requestEditorReveal({
    relativePath: rel,
    lineNumber: loc.line,
    column: loc.column,
  });
}

import { useEffect, useState } from 'react';
import { useSettings } from '../store/settingsStore';
import { resolveThemePref, syncDocumentTheme, type ResolvedUiTheme } from '../lib/themeSync';

/**
 * Keeps `<html class="dark|light">` in sync with Settings → Appearance and OS preference when set to System.
 */
export function useResolvedTheme(): ResolvedUiTheme {
  const themePref = useSettings((s) => s.settings.theme);
  const [resolved, setResolved] = useState<ResolvedUiTheme>(() =>
    typeof window !== 'undefined' ? resolveThemePref(themePref) : 'dark',
  );

  useEffect(() => {
    setResolved(syncDocumentTheme(themePref));
  }, [themePref]);

  useEffect(() => {
    if (themePref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(syncDocumentTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themePref]);

  return resolved;
}

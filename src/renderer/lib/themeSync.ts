import type { AppSettings } from '../../shared/types';

export type ResolvedUiTheme = 'dark' | 'light';

export function resolveThemePref(pref: AppSettings['theme']): ResolvedUiTheme {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

/** Applies `dark` or `light` on `<html>` and returns the resolved appearance. */
export function syncDocumentTheme(pref: AppSettings['theme']): ResolvedUiTheme {
  const r = resolveThemePref(pref);
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(r);
  return r;
}

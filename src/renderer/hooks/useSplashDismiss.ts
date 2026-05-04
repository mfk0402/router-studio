import { useLayoutEffect } from 'react';

const EXIT_MS = 400;

/**
 * Removes the static #app-splash from index.html (same markup as index.html).
 * Idempotent — safe to call from preload-failure UI, failsafe timers, and the hook.
 */
export function dismissAppSplash(): void {
  const el = document.getElementById('app-splash');
  if (!el || el.dataset.splashDismiss === '1') return;
  el.dataset.splashDismiss = '1';
  requestAnimationFrame(() => {
    el.classList.add('app-splash--exiting');
  });
  window.setTimeout(() => {
    if (el.isConnected) el.remove();
  }, EXIT_MS);
}

const FAILSAFE_MS = 4500;

/**
 * Removes the splash after the first successful commit — prefer useLayoutEffect so paint
 * happens after we're ready to show the shell (and #app-splash is not stuck above #root).
 */
export function useSplashDismiss(): void {
  useLayoutEffect(() => {
    dismissAppSplash();
  }, []);
}

/** Call from main.tsx so a hung bundle / thrown render cannot leave the splash up forever. */
export function scheduleSplashDismissFailsafe(): void {
  window.setTimeout(() => dismissAppSplash(), FAILSAFE_MS);
}

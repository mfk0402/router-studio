import { useEffect } from 'react';

const EXIT_MS = 400;

/**
 * Removes the static #app-splash from index.html after the first React commit so startup
 * shows logo + tagline instead of an empty root.
 */
export function useSplashDismiss(): void {
  useEffect(() => {
    const el = document.getElementById('app-splash');
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.classList.add('app-splash--exiting');
    });
    const timeout = window.setTimeout(() => {
      el.remove();
    }, EXIT_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, []);
}

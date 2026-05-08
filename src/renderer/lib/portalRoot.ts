/**
 * Host for `createPortal` targets that must sit above blurred/chrome layers and must
 * not be clipped by `#root { overflow: hidden }`. Declared in `index.html` as `#portal-root`.
 */
export function getPortalRoot(): HTMLElement {
  let el = document.getElementById('portal-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'portal-root';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  // Inline backup so stacking works even if bundled CSS load order regresses.
  if (el.dataset.rsPortalHost !== '1') {
    el.dataset.rsPortalHost = '1';
    el.style.setProperty('position', 'fixed');
    el.style.setProperty('inset', '0');
    el.style.setProperty('z-index', '199000');
    el.style.setProperty('pointer-events', 'none');
    el.style.setProperty('overflow', 'visible');
  }
  return el;
}

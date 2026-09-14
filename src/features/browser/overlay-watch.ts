/**
 * The browser pane is a native child webview: it paints above every DOM
 * element, so a menu, popover, select or toast that opens over it is invisible.
 * This watches the document for such floating layers and reports whether any
 * of them overlaps a given rect, so the pane can hide the webview for as long
 * as the overlay is up. Tooltips are ignored (they follow the pointer and would
 * flicker the page).
 */

const FLOATING = '[data-radix-popper-content-wrapper], [data-sileo-toast], [data-radix-menu-content], [role="menu"], [data-island="open"]';

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** True when a floating layer (not a tooltip) currently covers part of `rect`. */
export function overlayCovers(rect: DOMRect): boolean {
  for (const el of document.querySelectorAll<HTMLElement>(FLOATING)) {
    if (el.querySelector('[role="tooltip"]')) continue;
    if (el.closest('[data-radix-popper-content-wrapper] [role="tooltip"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (intersects(r, rect)) return true;
  }
  return false;
}

/**
 * Call `onChange(covered)` whenever the answer for `getRect()` may have changed.
 * Floating layers are positioned a frame after they mount, so each mutation is
 * re-checked a few times.
 */
export function watchOverlays(getRect: () => DOMRect | null, onChange: (covered: boolean) => void): () => void {
  let last: boolean | null = null;
  let timers: number[] = [];
  const check = () => {
    const rect = getRect();
    const covered = rect ? overlayCovers(rect) : false;
    if (covered !== last) {
      last = covered;
      onChange(covered);
    }
  };
  const schedule = () => {
    for (const t of timers) window.clearTimeout(t);
    timers = [0, 60, 200, 450].map((ms) => window.setTimeout(check, ms));
  };
  const mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList: true, subtree: true });
  schedule();
  return () => {
    mo.disconnect();
    for (const t of timers) window.clearTimeout(t);
  };
}

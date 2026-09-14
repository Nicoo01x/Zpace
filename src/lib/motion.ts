import type { Transition } from 'motion/react';

/**
 * Motion presets.
 *
 * The vocabulary follows the two reference libraries:
 *  - pretty-modal: FLIP from the trigger, blur-in on open, blur + fade + growing
 *    radius on close, a custom ease with a whisper of overshoot.
 *  - super-beautiful-toast: two independent springs (x / y) so the element
 *    travels on an arc, size settles before position, content blurs in.
 *
 * Micro-interactions stay in the 120–280ms band. Springs are used where the
 * element is "physical" (modals, toasts, expanding groups) and tweens where
 * it is not (opacity, colour).
 */

export const durations = {
  instant: 0.08,
  fast: 0.12,
  normal: 0.18,
  slow: 0.26,
} as const;

export const easings = {
  /** ease-out quint — crisp arrival */
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
  /** pretty-modal open ease */
  spring: [0.56, 0.27, 0, 1] as const,
  /** pretty-modal blur ease */
  soft: [0.37, 0.35, 0, 1] as const,
};

export const springs = {
  /** Snappy, no visible overshoot — hover/press, small popovers. */
  snappy: { type: 'spring', stiffness: 640, damping: 42, mass: 0.8 } as Transition,
  /** Gentle overshoot — dropdowns, context menus, tool group expand. */
  pop: { type: 'spring', stiffness: 520, damping: 34, mass: 0.9 } as Transition,
  /** Modal morph — a touch of elasticity, like pretty-modal's custom ease. */
  modal: { type: 'spring', stiffness: 380, damping: 30, mass: 1 } as Transition,
  /** Toast travel — under-damped, settles in ~0.9s like super-beautiful-toast. */
  toast: { type: 'spring', stiffness: 300, damping: 26, mass: 1 } as Transition,
  /** Layout re-flow for lists (sidebar, stacks). */
  layout: { type: 'spring', stiffness: 560, damping: 40, mass: 0.9 } as Transition,
  /** Size settling — fast, lands before position (0.32s in the reference). */
  size: { type: 'spring', stiffness: 700, damping: 46, mass: 0.9 } as Transition,
  /** The living layout: one spring for every container that grows, every sibling that moves — settles in ~0.45s, no visible bounce. */
  living: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as Transition,
} as const;

/**
 * Living layout — content that appears inside a container that is growing
 * (and leaves while it compresses). Only transform and opacity; the container
 * itself moves with `layout` and `springs.living`, so both read as one motion.
 */
export const living = {
  /** New content: fades in while it arrives from slightly above, a touch smaller. */
  enter: { opacity: 0, y: -4, scale: 0.985 },
  present: { opacity: 1, y: 0, scale: 1 },
  /** Leaving content: fades a beat before the container closes over it. */
  exit: { opacity: 0, y: -3, scale: 0.99, transition: { duration: 0.2, ease: easings.inOut } },
  transition: { default: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }, opacity: { duration: 0.22, ease: easings.out } } as Transition,
  /** A field or row inside a form that just opened: staggered by index. */
  field: (i: number): Transition => ({ default: { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 }, opacity: { duration: 0.16, ease: easings.out }, delay: 0.02 * i }),
  fieldFrom: { opacity: 0, y: -3 },
  fieldTo: { opacity: 1, y: 0 },
} as const;

export const tweens = {
  fade: { duration: durations.normal, ease: easings.out } as Transition,
  fadeFast: { duration: durations.fast, ease: easings.out } as Transition,
  fadeSlow: { duration: durations.slow, ease: easings.out } as Transition,
  blurIn: { duration: 0.32, ease: easings.soft } as Transition,
} as const;

/* ---------------------------------------------------------------- */
/*  Shared variants                                                  */
/* ---------------------------------------------------------------- */

/** Popover / dropdown: scale from the trigger origin with a short blur. */
export const popoverVariants = {
  hidden: { opacity: 0, scale: 0.94, filter: 'blur(4px)', y: -4 },
  visible: { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 },
  exit: { opacity: 0, scale: 0.96, filter: 'blur(3px)', y: -2, transition: { duration: 0.14, ease: easings.out } },
};

export const popoverTransition = {
  default: springs.pop,
  opacity: tweens.fadeFast,
  filter: tweens.fadeFast,
};

/** Tooltip: minimal, no blur. */
export const tooltipVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 2 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

/** Overlay dim + backdrop blur. */
export const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

/** Generic fade/slide-in for list items. */
export const itemVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -2 },
};

/* ---------------------------------------------------------------- */
/*  Origin tracking (pretty-modal / super-beautiful-toast morph)     */
/* ---------------------------------------------------------------- */

export interface OriginRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  background?: string;
  color?: string;
}

/** The control that started the current interaction, with its geometry frozen at press time. */
export interface OriginSnapshot {
  element: HTMLElement;
  rect: OriginRect;
  /** Computed skin at press time — enough to rebuild the control if it has since unmounted (menu items). */
  style: { background: string; boxShadow: string; borderRadius: string };
}

let lastPointer: { x: number; y: number } | null = null;
let lastOrigin: OriginRect | null = null;
let lastSnapshot: OriginSnapshot | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastPointer = { x: e.clientX, y: e.clientY };
      const el = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], [role="menuitem"], a') as HTMLElement | null;
      lastOrigin = el ? rectOf(el) : null;
      if (el) {
        const cs = getComputedStyle(el);
        lastSnapshot = { element: el, rect: lastOrigin!, style: { background: cs.background, boxShadow: cs.boxShadow, borderRadius: cs.borderRadius } };
      } else {
        lastSnapshot = null;
      }
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    'keydown',
    () => {
      // Keyboard-triggered UI has no pointer origin: fall back to centre.
      lastPointer = null;
      lastOrigin = null;
      lastSnapshot = null;
    },
    { capture: true, passive: true },
  );
}

export function rectOf(el: Element): OriginRect {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
    radius: parseFloat(cs.borderTopLeftRadius) || 0,
    background: cs.backgroundColor,
    color: cs.color,
  };
}

/** Rect of the element that started the current interaction (best effort). */
export function consumeOrigin(): OriginRect | null {
  const o = lastOrigin;
  lastOrigin = null;
  lastSnapshot = null;
  return o;
}

/** The pressed control itself (plus a frozen copy of its skin), for morphs that need a live element. */
export function consumeOriginSnapshot(): OriginSnapshot | null {
  const o = lastSnapshot;
  lastOrigin = null;
  lastSnapshot = null;
  return o;
}

/**
 * A stand-in for a control that has already left the DOM (a menu item closes
 * its menu on select): an invisible fixed box with the same rect and skin, so
 * the morph still has something to measure. Removed after `ttl` ms.
 */
export function ghostOrigin(rect: OriginRect, style?: OriginSnapshot['style'], ttl = 1600): HTMLElement {
  const ghost = document.createElement('div');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: style?.borderRadius ?? `${rect.radius}px`,
    background: style?.background ?? rect.background ?? 'transparent',
    boxShadow: style?.boxShadow ?? 'none',
    visibility: 'hidden',
    pointerEvents: 'none',
    zIndex: '-1',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(ghost);
  window.setTimeout(() => ghost.remove(), ttl);
  return ghost;
}

export function getLastPointer() {
  return lastPointer;
}

/**
 * Compute the initial transform that places a target (centred, size w×h)
 * on top of the origin rect — the FLIP starting state.
 */
export function morphFrom(origin: OriginRect | null, target: { width: number; height: number; x: number; y: number }) {
  if (!origin) return { x: 0, y: 0, scaleX: 0.92, scaleY: 0.92 };
  const ox = origin.x + origin.width / 2;
  const oy = origin.y + origin.height / 2;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;
  return {
    x: ox - tx,
    y: oy - ty,
    scaleX: Math.max(0.05, origin.width / target.width),
    scaleY: Math.max(0.05, origin.height / target.height),
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

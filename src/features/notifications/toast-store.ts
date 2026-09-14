/**
 * Toast API for the app, on top of sileo (MIT — SVG morphing, spring
 * physics): the same calls the rest of Zpace already makes, plus rich
 * content — a description can be a React node (a list of touched files, a
 * deploy progress), the icon can be a brand mark, and a button can open
 * what the toast talks about.
 *
 *   toast.success('Note created', { description: 'In tramitito' })
 *   const id = toast.loading('Cloning…'); toast.update(id, { variant: 'success', title: 'Cloned' })
 *   toast.promise(p, { loading, success, error })   // one pill morphing through the states
 */
import type { ReactNode } from 'react';
import { sileo, type SileoOptions, type SileoPosition } from 'sileo';
import { useSettings, type ToastPosition } from '@/stores/settings';
import { useNotifications, type NotificationMark } from '@/stores/notifications';
import { playToast } from './sound';
import { uid } from '@/lib/id';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'loading';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Plain text or a React node (rich toasts). */
  description?: ReactNode;
  /** ms; 0 = persistent (stays until dismissed). */
  duration?: number;
  action?: ToastAction;
  /** Repeats with the same key replace the live toast instead of stacking a copy. */
  key?: string;
  /** Kept for callers: sileo toasts are always dismissible by click/swipe. */
  dismissible?: boolean;
  /** Kept for callers (the morph-from-control origin of the previous engine); ignored. */
  origin?: unknown;
  progress?: number;
  onDismiss?: () => void;
  onClick?: () => void;
  /** Leading mark — a brand logo, a file icon… */
  icon?: ReactNode;
  /** Pill colour override. */
  fill?: string;
  position?: ToastPosition;
  /** Plain text for the island and the notification centre when the description is a node. */
  summary?: string;
  /** A recognisable mark in the island (Claude, a commit…) instead of the variant glyph. */
  mark?: NotificationMark;
  /** Show the toast but keep it out of the notification centre. */
  silent?: boolean;
  /** Unfold on the island, then drop it (no entry in the centre): confirmations like "copied". */
  ephemeral?: boolean;
}

const DEFAULT_MS = 4200;
const ERROR_MIN_MS = 6000;

/** Live toast per dedupe key, so a repeat refreshes instead of stacking. */
const byKey = new Map<string, string>();
/** What each toast was, so update() can re-show it changed. */
const live = new Map<string, { variant: ToastVariant; title: string; opts: ToastOptions }>();
/** Toast id → its entry in the notification centre. */
const ntfOf = new Map<string, string>();
/** Ids handed out when the island alone shows a notification (no sileo toast behind them). */
const ISLAND_ID = 'ntf:';

function cue(variant: ToastVariant) {
  const n = useSettings.getState().notifications;
  if (!n.toastSound || variant === 'loading') return;
  playToast(variant, n.volume, n.soundTheme);
}

function durationFor(variant: ToastVariant, ms?: number): number | null {
  if (ms === 0) return null;
  if (ms !== undefined) return ms;
  if (variant === 'loading') return null;
  if (variant === 'error') return Math.max(DEFAULT_MS, ERROR_MIN_MS);
  return DEFAULT_MS;
}

/** Toasts pop up at the edge only when the island is not the surface. */
function wantsToast(): boolean {
  return (useSettings.getState().notifications.surface ?? 'island') !== 'island';
}

/** The centre's copy of a toast: plain summary, the rich node while unfolded, the action. Same id → replaces. */
function record(variant: ToastVariant, title: string, opts: ToastOptions, id?: string): string | undefined {
  if (opts.silent) return undefined;
  const plain = typeof opts.description === 'string';
  const item = useNotifications.getState().push({
    id,
    variant,
    title,
    summary: plain ? (opts.description as string) : (opts.summary ?? ''),
    mark: opts.mark,
    sticky: opts.duration === 0 && variant !== 'loading',
    foldMs: opts.duration && opts.duration > 0 && opts.duration < 4000 ? opts.duration : undefined,
    rich: plain ? undefined : opts.description,
    icon: opts.icon,
    action: opts.action ? { label: opts.action.label, run: opts.action.onClick } : undefined,
  });
  // Ephemeral: the island shows it, the list never keeps it.
  if (opts.ephemeral) useNotifications.setState((s) => ({ items: s.items.filter((x) => x.id !== item.id) }));
  return item.id;
}

function toSileo(variant: ToastVariant, title: string, opts: ToastOptions): SileoOptions {
  return {
    title,
    description: opts.description,
    duration: durationFor(variant, opts.duration),
    icon: opts.icon,
    fill: opts.fill,
    position: opts.position as SileoPosition | undefined,
    button: opts.action ? { title: opts.action.label, onClick: opts.action.onClick } : undefined,
  };
}

function fire(variant: ToastVariant, o: SileoOptions): string {
  switch (variant) {
    case 'success':
      return sileo.success(o);
    case 'error':
      return sileo.error(o);
    case 'warning':
      return sileo.warning(o);
    case 'info':
      return sileo.info(o);
    case 'loading':
      return sileo.show({ ...o, type: 'loading' });
    default:
      return o.button ? sileo.action(o) : sileo.show(o);
  }
}

function forget(id: string) {
  if (!id.startsWith(ISLAND_ID)) sileo.dismiss(id);
  live.delete(id);
  ntfOf.delete(id);
}

function show(variant: ToastVariant, title: string, opts: ToastOptions = {}): string {
  cue(variant);
  let prevNtf: string | undefined;
  if (opts.key) {
    const prev = byKey.get(opts.key);
    if (prev) {
      prevNtf = ntfOf.get(prev);
      forget(prev);
    }
  }
  const ntf = record(variant, title, opts, prevNtf);
  const id = wantsToast() ? fire(variant, toSileo(variant, title, opts)) : `${ISLAND_ID}${ntf ?? uid('t')}`;
  live.set(id, { variant, title, opts });
  if (ntf) ntfOf.set(id, ntf);
  if (opts.key) byKey.set(opts.key, id);
  return id;
}

export interface ToastUpdate {
  title?: string;
  variant?: ToastVariant;
  description?: ReactNode;
  duration?: number;
  action?: ToastAction;
  progress?: number;
  dismissible?: boolean;
  icon?: ReactNode;
}

/** Replace a live toast with its updated self (sileo has no in-place update; the swap is instant). The island unfolds it again. */
function update(id: string, patch: ToastUpdate): string {
  const cur = live.get(id);
  if (!cur) return id;
  const variant = patch.variant ?? cur.variant;
  const title = patch.title ?? cur.title;
  const opts: ToastOptions = {
    ...cur.opts,
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.action !== undefined ? { action: patch.action } : {}),
    ...(patch.duration !== undefined ? { duration: patch.duration } : {}),
    ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
  };
  if (cur.variant === 'loading' && variant !== 'loading') cue(variant);
  const ntf = ntfOf.get(id);
  if (ntf) {
    const plain = typeof opts.description === 'string';
    useNotifications.getState().update(ntf, {
      variant,
      title,
      summary: plain ? (opts.description as string) : (opts.summary ?? ''),
      sticky: opts.duration === 0 && variant !== 'loading',
      rich: plain ? undefined : opts.description,
      icon: opts.icon,
      action: opts.action ? { label: opts.action.label, run: opts.action.onClick } : undefined,
    });
  }
  if (id.startsWith(ISLAND_ID)) {
    live.set(id, { variant, title, opts });
    return id;
  }
  sileo.dismiss(id);
  live.delete(id);
  ntfOf.delete(id);
  const next = fire(variant, toSileo(variant, title, opts));
  live.set(next, { variant, title, opts });
  if (ntf) ntfOf.set(next, ntf);
  if (cur.opts.key) byKey.set(cur.opts.key, next);
  return next;
}

export const toast = Object.assign((title: string, opts?: ToastOptions) => show('neutral', title, opts), {
  success: (title: string, opts?: ToastOptions) => show('success', title, opts),
  error: (title: string, opts?: ToastOptions) => show('error', title, opts),
  warning: (title: string, opts?: ToastOptions) => show('warning', title, opts),
  info: (title: string, opts?: ToastOptions) => show('info', title, opts),
  neutral: (title: string, opts?: ToastOptions) => show('neutral', title, opts),
  loading: (title: string, opts?: ToastOptions) => show('loading', title, opts),
  update,
  /** Hide one toast (and fold the island if it is showing it) — or everything on screen. */
  dismiss: (id?: string) => {
    const n = useNotifications.getState();
    if (id) {
      const ntf = ntfOf.get(id);
      if (ntf && n.bloom?.id === ntf) n.setBloom(null);
      forget(id);
    } else {
      sileo.clear();
      live.clear();
      byKey.clear();
      ntfOf.clear();
      n.setBloom(null);
    }
  },
  /**
   * Track a promise on one pill: loading morphs into success or error (sileo's
   * own state morph), with the messages given. On the island: one entry that
   * changes state.
   */
  promise: async <T>(
    p: Promise<T>,
    msgs: { loading: string; success: string | ((v: T) => string); error: string | ((e: unknown) => string) },
    opts?: ToastOptions & { successDescription?: ReactNode | ((v: T) => ReactNode) },
  ): Promise<T> => {
    const base: ToastOptions = opts ?? {};
    const ntf = record('loading', msgs.loading, base);
    const settle = (variant: 'success' | 'error', title: string, description: ReactNode) => {
      cue(variant);
      if (!ntf) return;
      const plain = typeof description === 'string';
      useNotifications.getState().update(ntf, {
        variant,
        title,
        summary: plain ? (description as string) : (base.summary ?? ''),
        rich: plain ? undefined : description,
        action: base.action ? { label: base.action.label, run: base.action.onClick } : undefined,
      });
    };
    const successOf = (v: T) => {
      const sd = opts?.successDescription;
      return { title: typeof msgs.success === 'function' ? msgs.success(v) : msgs.success, description: typeof sd === 'function' ? (sd as (x: T) => ReactNode)(v) : (sd ?? base.description) };
    };
    const errorOf = (e: unknown) => ({ title: typeof msgs.error === 'function' ? msgs.error(e) : msgs.error, description: e instanceof Error ? e.message : String(e) });
    if (!wantsToast()) {
      p.then(
        (v) => {
          const r = successOf(v);
          settle('success', r.title, r.description);
        },
        (e: unknown) => {
          const r = errorOf(e);
          settle('error', r.title, r.description);
        },
      );
      return p;
    }
    const common = { icon: base.icon, fill: base.fill, position: base.position as SileoPosition | undefined };
    return sileo.promise(p, {
      loading: { ...common, title: msgs.loading, description: base.description },
      success: (v) => {
        const r = successOf(v);
        settle('success', r.title, r.description);
        return { ...common, title: r.title, description: r.description, duration: durationFor('success', base.duration), button: base.action ? { title: base.action.label, onClick: base.action.onClick } : undefined };
      },
      error: (e) => {
        const r = errorOf(e);
        settle('error', r.title, r.description);
        return { ...common, title: r.title, description: r.description, duration: ERROR_MIN_MS };
      },
    });
  },
});

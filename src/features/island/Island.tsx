import { useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, animate, useMotionValue } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { Check, X, TriangleAlert, Info, GitCommit, ArrowUpFromLine, ArrowDownToLine, Terminal, NotebookPen, Globe, Trash2, BellOff, Loader2, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';
import { formatRelative } from '@/lib/format';
import { useNotifications, unreadCount, type AppNotification, type NotificationMark, type NotificationVariant } from '@/stores/notifications';
import { useSettings } from '@/stores/settings';
import { useUI, collectLeaves } from '@/stores/ui';
import { useLive, activityWord } from './live';
import { useIslandChips } from './chips';
import { ZorynqMark } from '@/features/brand/ZorynqMark';
import { ClaudeLogo, CodexLogo, GeminiLogo, OpenCodeLogo } from '@/features/agent/BrandIcon';
import { t } from '@/i18n';

/**
 * The island: a black pill with the Z and the name at the top centre of the
 * window. Every notification unfolds inside it — the mark, the title, the
 * line under it, the rich content (files a turn touched, a commit's hash,
 * push steps) and its button — then it folds back after a few seconds; a
 * click opens the notification centre underneath, everything the app said
 * since the last clear. During the entrance the tile lives on the welcome
 * screen and flies up here when you enter (shared layout ids).
 */
export const BRAND_LAYOUT_ID = 'zorynq-brand';

const FOLD_MS = 5200;
const FOLD_RICH_MS = 8000;
const FOLD_ALERT_MS = 9000;
/** Hold this long before the island comes along with the pointer. */
const HOLD_MS = 260;
/** Within this of the centre it snaps back to the middle. */
const MAGNET_PX = 14;
/** Keep the whole pill inside the window, clear of the tabs on the left and the window controls on the right. */
function clampShift(px: number, width: number): number {
  const reach = Math.max(0, (window.innerWidth - width) / 2 - 180);
  return Math.max(-reach, Math.min(reach, px));
}

const VARIANT_GLYPH: Record<NotificationVariant, { icon: ReactNode; color: string }> = {
  success: { icon: <Check className="size-[11px]" strokeWidth={3} />, color: '#3ddc84' },
  error: { icon: <X className="size-[11px]" strokeWidth={3} />, color: '#ff5f57' },
  warning: { icon: <TriangleAlert className="size-[11px]" strokeWidth={2.5} />, color: '#ffbd2e' },
  info: { icon: <Info className="size-[11px]" strokeWidth={2.5} />, color: '#5aa9ff' },
  neutral: { icon: <span className="block size-1.5 rounded-full bg-current" />, color: 'rgba(255,255,255,0.7)' },
  loading: { icon: <Loader2 className="size-[11px] animate-spin" strokeWidth={2.5} />, color: 'rgba(255,255,255,0.85)' },
};

function markNode(mark: NotificationMark | undefined, size: number): ReactNode {
  switch (mark) {
    case 'claude':
      return <ClaudeLogo size={size} />;
    case 'codex':
      return <CodexLogo size={size} />;
    case 'gemini':
      return <GeminiLogo size={size} />;
    case 'opencode':
      return <OpenCodeLogo size={size} />;
    case 'commit':
      return <GitCommit size={size} />;
    case 'push':
      return <ArrowUpFromLine size={size} />;
    case 'pull':
      return <ArrowDownToLine size={size} />;
    case 'terminal':
      return <Terminal size={size} />;
    case 'note':
      return <NotebookPen size={size} />;
    case 'browser':
      return <Globe size={size} />;
    case 'clipboard':
      return <ClipboardCheck size={size} />;
    default:
      return null;
  }
}

/** The glyph of one notification: its mark when it has one (a loading state keeps spinning), else the variant's check / cross / warning. */
function Glyph({ n, size = 14 }: { n: AppNotification; size?: number }) {
  const icon = useNotifications((s) => s.extras[n.id]?.icon);
  if (icon) return <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full [&>img]:size-full [&>img]:object-cover" style={{ width: size + 14, height: size + 14 }}>{icon}</span>;
  const mark = n.variant === 'loading' ? null : markNode(n.mark, size);
  if (mark) return <span className="inline-flex shrink-0 items-center justify-center text-white">{mark}</span>;
  const v = VARIANT_GLYPH[n.variant];
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size + 6, height: size + 6, background: `color-mix(in srgb, ${v.color} 22%, transparent)`, color: v.color }}>
      {v.icon}
    </span>
  );
}

export function Island() {
  const surface = useSettings((s) => s.notifications.surface);
  const welcomeOpen = useUI((s) => s.welcomeOpen);
  const { bloom, open, unread } = useNotifications(useShallow((s) => ({ bloom: s.bloom, open: s.open, unread: unreadCount(s.items) })));
  const setBloom = useNotifications((s) => s.setBloom);
  const setOpen = useNotifications((s) => s.setOpen);
  const ref = useRef<HTMLDivElement>(null);
  const hover = useRef(false);

  // An unfolded notification folds back on its own — unless the pointer is on it, it is still loading, or it needs an answer.
  useEffect(() => {
    if (!bloom || bloom.sticky || bloom.variant === 'loading') return;
    const id = bloom.id;
    const rich = !!useNotifications.getState().extras[id]?.rich;
    const ms = bloom.foldMs ?? (bloom.variant === 'error' || bloom.variant === 'warning' ? FOLD_ALERT_MS : rich ? FOLD_RICH_MS : FOLD_MS);
    let timer = window.setTimeout(tick, ms);
    function tick() {
      if (hover.current) {
        timer = window.setTimeout(tick, 1200);
        return;
      }
      const cur = useNotifications.getState().bloom;
      if (cur?.id === id) setBloom(null);
    }
    return () => window.clearTimeout(timer);
  }, [bloom, setBloom]);

  // The centre closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, setOpen]);

  // The pill follows the size of whatever is inside it: measured, then animated as width/height (no transform
  // scaling — text and the mark stay crisp while it grows).
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const shown = surface !== 'toasts' && !welcomeOpen;
  useEffect(() => {
    const el = inner.current;
    if (!el || !shown) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // Ceil plus a hair: a fractional width rounded down clipped the last glyph until the next re-measure.
      setSize({ w: Math.ceil(r.width) + 1, h: Math.ceil(r.height) });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The interface font arrives after the first paint and is wider than the fallback: measure again then.
    const fonts = document.fonts;
    const onFonts = () => measure();
    fonts?.addEventListener?.('loadingdone', onFonts);
    void fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      fonts?.removeEventListener?.('loadingdone', onFonts);
      window.removeEventListener('resize', measure);
    };
  }, [shown]);

  // Hold the island and it comes along: slide it left or right and it stays there (a magnet at the centre, and it
  // never leaves the window). A short press is still a click; the hold is what starts the move.
  const shift = useNotifications((s) => s.shift);
  const setShift = useNotifications((s) => s.setShift);
  const x = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; armed: boolean } | null>(null);
  const swallowClick = useRef(false);
  const width = size?.w ?? 0;
  useEffect(() => {
    if (!shown) return;
    const settle = () => {
      if (drag.current?.armed) return;
      animate(x, clampShift(shift * window.innerWidth, width), springs.snappy);
    };
    settle();
    window.addEventListener('resize', settle);
    return () => window.removeEventListener('resize', settle);
  }, [shift, width, shown, x]);
  // The window listens for the rest of the gesture, so the pill follows even when the pointer outruns it.
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    const d = { id: e.pointerId, startX: e.clientX, originX: x.get(), armed: false, moved: false, timer: 0 };
    const w = () => inner.current?.parentElement?.getBoundingClientRect().width ?? width;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      const dx = ev.clientX - d.startX;
      if (!d.armed) {
        // Moving before the hold is up is a scroll or a text selection, not a move.
        if (Math.abs(dx) > 5) stop();
        return;
      }
      d.moved = true;
      const next = clampShift(d.originX + dx, w());
      x.set(Math.abs(next) < MAGNET_PX ? 0 : next);
    };
    const stop = () => {
      window.clearTimeout(d.timer);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onEnd, true);
      window.removeEventListener('pointercancel', onEnd, true);
      window.removeEventListener('blur', onEnd);
      drag.current = null;
    };
    const onEnd = (ev: Event) => {
      if (ev instanceof PointerEvent && ev.pointerId !== d.id) return;
      const armed = d.armed;
      stop();
      if (!armed) return;
      setDragging(false);
      if (d.moved) {
        swallowClick.current = true;
        setShift(x.get() / window.innerWidth);
      }
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onEnd, true);
    window.addEventListener('pointercancel', onEnd, true);
    window.addEventListener('blur', onEnd);
    d.timer = window.setTimeout(() => {
      d.armed = true;
      setDragging(true);
    }, HOLD_MS);
    drag.current = d;
  };

  if (!shown) return null;

  // Portaled to the body at the very top of the stack: above menus, popovers, dialogs and sheets. The browser
  // pane (a native webview that paints over everything) hides itself while the island is unfolded over it —
  // see overlay-watch, which looks for data-island="open".
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[3px] z-[1400] flex justify-center no-drag">
      <motion.div
        ref={ref}
        data-island={open || bloom ? 'open' : 'compact'}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: dragging ? 1.04 : 1, ...(size ? { width: size.w, height: size.h } : {}) }}
        transition={springs.modal}
        onPointerEnter={() => (hover.current = true)}
        onPointerLeave={() => (hover.current = false)}
        onPointerDown={onPointerDown}
        onClickCapture={(e) => {
          // The release after a move is not a click on whatever ended up under the pointer.
          if (!swallowClick.current) return;
          swallowClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
        className={cn('pointer-events-auto relative touch-none select-none overflow-hidden bg-[#111] text-white transition-shadow', dragging ? 'cursor-grabbing shadow-[0_8px_24px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.14)]' : 'shadow-[0_1px_3px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.06)]')}
        style={{ x, borderRadius: open || bloom ? 18 : 15 }}
      >
        <div ref={inner} className="relative w-max">
          {open ? (
            <Centre key="open" />
          ) : bloom ? (
            <Unfolded key={`bloom:${bloom.id}`} n={bloom} onOpen={() => setOpen(true)} onFold={() => setBloom(null)} />
          ) : (
            <Compact key="compact" unread={unread} onClick={() => setOpen(true)} />
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

/** How wide the compact island may grow before it runs into the title bar's controls (it sits centred, so the wider side counts twice). */
function useIslandRoom(): number | undefined {
  const [room, setRoom] = useState<number | undefined>(undefined);
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      let edge = 0;
      for (const el of document.querySelectorAll<HTMLElement>('[data-island-avoid]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        // left-hand groups take up their right edge, right-hand ones the distance from their left edge to the window's edge
        edge = Math.max(edge, r.left + r.width / 2 < w / 2 ? r.right : w - r.left);
      }
      setRoom(Math.max(120, w - edge * 2 - 16));
    };
    measure();
    const ro = new ResizeObserver(measure);
    document.querySelectorAll('[data-island-avoid]').forEach((el) => ro.observe(el));
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return room;
}

const fade = { initial: { opacity: 0, filter: 'blur(3px)' }, animate: { opacity: 1, filter: 'blur(0px)' }, transition: { duration: 0.22, delay: 0.04 } };

/** The Z and the name — and a dot when something arrived while you were away. */
function Brand({ unread = 0 }: { unread?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ZorynqMark size={12} layoutId={BRAND_LAYOUT_ID} className="text-white" />
      <span className="text-[12px] font-semibold leading-none tracking-[-0.01em]">Zpace</span>
      {unread ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springs.pop} className="ml-0.5 block size-1.5 rounded-full bg-[var(--accent)]" /> : null}
    </span>
  );
}

/** Compact: the brand — and, while an agent works, what it is doing right now (click goes to that session). */
function Compact({ unread, onClick }: { unread: number; onClick: () => void }) {
  const live = useLive();
  const chips = useIslandChips((s) => s.chips);
  const room = useIslandRoom();
  // in a narrow window whole readouts step aside rather than every one being shredded to a letter: the brand keeps ~90 px, a readout wants ~130
  const budget = room === undefined ? Infinity : Math.max(0, Math.floor((room - 90) / 130));
  const shownChips = Object.entries(chips).slice(0, Math.max(0, budget - (live ? 1 : 0)));
  const focusSession = (id: string) => {
    const ui = useUI.getState();
    ui.setActiveSession(id);
    const leaf = collectLeaves(ui.layout).find((l) => l.content.kind === 'session' && l.content.sessionId === id);
    if (leaf) ui.setActivePane(leaf.id);
    else ui.setPaneContent(ui.activePaneId, { kind: 'session', sessionId: id });
  };
  return (
    <motion.div {...fade} className="flex h-[24px] min-w-0 items-center" style={{ maxWidth: room }}>
      <button type="button" onClick={onClick} aria-label={t('Notifications')} title={unread ? t('{n} unread', { n: unread }) : t('Notifications')} className="flex h-full shrink-0 items-center pl-2.5 pr-2">
        <Brand unread={unread} />
      </button>
      <AnimatePresence initial={false}>
        {live && budget > 0 ? (
          <motion.button
            key={live.sessionId}
            type="button"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0, transition: { duration: 0.16 } }}
            transition={springs.snappy}
            onClick={() => focusSession(live.sessionId)}
            title={live.title}
            className="flex h-full min-w-0 shrink items-center overflow-hidden whitespace-nowrap pr-2.5 text-[11.5px] leading-none"
          >
            <span className="mr-2 h-3 w-px shrink-0 bg-white/20" />
            {live.waiting ? (
              <span className="mr-1.5 block size-1.5 rounded-full bg-[#ffbd2e]" />
            ) : (
              <motion.span animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} className="mr-1.5 inline-flex">
                <ClaudeLogo size={11} />
              </motion.span>
            )}
            <span className={live.waiting ? 'text-[#ffbd2e]' : 'text-white/85'}>{activityWord(live.activity)}</span>
            {live.subject ? <span className="ml-1 min-w-0 max-w-[220px] truncate font-mono text-white/55">{live.subject}</span> : null}
            {live.running + live.waiting > 1 ? <span className="ml-1.5 text-white/45">+{live.running + live.waiting - 1}</span> : null}
          </motion.button>
        ) : null}
        {/* plugin readouts: a countdown, the track playing */}
        {shownChips.map(([owner, chip]) => (
          <motion.button
            key={owner}
            type="button"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0, transition: { duration: 0.16 } }}
            transition={springs.snappy}
            onClick={chip.onClick}
            title={chip.title ?? chip.text}
            className="flex h-full min-w-0 shrink items-center overflow-hidden whitespace-nowrap pr-2.5 text-[11.5px] leading-none tabular"
            style={{ color: chip.color ?? 'rgba(255,255,255,0.85)' }}
          >
            <span className="mr-2 h-3 w-px shrink-0 bg-white/20" />
            {chip.icon ? chip.icon.trimStart().startsWith('<svg') ? <span aria-hidden className="mr-1.5 inline-flex [&>svg]:size-3 [&>svg]:shrink-0" dangerouslySetInnerHTML={{ __html: chip.icon }} /> : <span className="mr-1.5 inline-flex text-[11px]">{chip.icon}</span> : null}
            <span className="min-w-0 max-w-[240px] truncate">{chip.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

/** One notification, unfolded inside the island: the brand row, then the glyph, title, line, rich content and its button. */
function Unfolded({ n, onOpen, onFold }: { n: AppNotification; onOpen: () => void; onFold: () => void }) {
  const extras = useNotifications((s) => s.extras[n.id]);
  const remove = useNotifications((s) => s.remove);
  const action = extras?.action;
  const rich = extras?.rich;
  const [now] = useState(() => Date.now());
  return (
    <motion.div {...fade} className="w-[360px]">
      <div className="flex h-[24px] items-center px-2.5">
        <button type="button" onClick={onOpen} className="inline-flex items-center" aria-label={t('Notifications')}>
          <Brand />
        </button>
        <span className="ml-auto text-[10.5px] tabular text-white/40">{formatRelative(n.at, now)}</span>
        <button type="button" onClick={n.sticky ? () => remove(n.id) : onFold} aria-label={t('Dismiss')} className="ml-1.5 inline-flex size-5 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">
          <X className="size-[11px]" />
        </button>
      </div>
      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.06 }} className="flex items-start gap-2.5 px-3 pb-3 pt-0.5">
        <span className="mt-px inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10">
          <Glyph n={n} size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{n.title}</div>
          {rich ? <div className="mt-1 text-[12px] text-white/85">{rich}</div> : n.summary ? <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-white/60">{n.summary}</div> : null}
          {action ? (
            <button
              type="button"
              onClick={() => {
                action.run();
                remove(n.id);
              }}
              className="mt-2 inline-flex h-6 items-center rounded-full bg-white px-2.5 text-[11.5px] font-medium text-black transition-colors hover:bg-white/90"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Centre() {
  const items = useNotifications((s) => s.items);
  const extras = useNotifications((s) => s.extras);
  const clear = useNotifications((s) => s.clear);
  const remove = useNotifications((s) => s.remove);
  const setOpen = useNotifications((s) => s.setOpen);
  const [now] = useState(() => Date.now());
  return (
    <motion.div {...fade} className="w-[380px]">
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2">
        <Brand />
        <span className="ml-2 text-[11.5px] text-white/50">{t('Notifications')}</span>
        <span className="ml-auto text-[11px] tabular text-white/45">{items.length}</span>
        {items.length ? (
          <button type="button" onClick={clear} title={t('Clear all')} aria-label={t('Clear all')} className="inline-flex size-6 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
            <Trash2 className="size-[13px]" />
          </button>
        ) : null}
        <button type="button" onClick={() => setOpen(false)} aria-label={t('Close')} className="inline-flex size-6 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
          <X className="size-[13px]" />
        </button>
      </div>
      {items.length ? (
        <div className="max-h-[380px] overflow-y-auto px-1.5 pb-1.5">
          {items.map((n) => {
            const action = extras[n.id]?.action;
            return (
              <div key={n.id} className="group/ntf relative">
                <button
                  type="button"
                  onClick={() => {
                    if (action) action.run();
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/8"
                >
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <Glyph n={n} size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[12.5px] font-medium leading-tight">{n.title}</span>
                      <span className="ml-auto shrink-0 text-[10.5px] tabular text-white/40">{formatRelative(n.at, now)}</span>
                    </span>
                    {n.summary ? <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-white/55">{n.summary}</span> : null}
                    {action ? <span className="mt-1 inline-block text-[11px] font-medium text-[var(--accent)]">{action.label} →</span> : null}
                  </span>
                  {!n.read ? <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" /> : null}
                </button>
                <button
                  type="button"
                  aria-label={t('Dismiss')}
                  onClick={() => remove(n.id)}
                  className="absolute right-2 top-2 hidden size-5 items-center justify-center rounded-md bg-[#111] text-white/60 hover:text-white group-hover/ntf:inline-flex"
                >
                  <X className="size-[11px]" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 px-6 pb-5 pt-3 text-center">
          <BellOff className="size-[18px] text-white/35" />
          <div className="text-[12px] text-white/55">{t('Nothing yet — what Claude finishes, commits, pushes and errors land here.')}</div>
        </div>
      )}
    </motion.div>
  );
}


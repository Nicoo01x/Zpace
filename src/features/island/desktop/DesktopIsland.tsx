import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';
import { islandHide, islandSetBounds, islandSetRegion } from '@/native/desktop';
import { useIsland } from './store';
import { startFeed, stopWatchers } from './feed';
import { Compact } from './Compact';
import { CardView } from './Cards';
import { Centre } from './Centre';
import { act } from './actions';
import { EV, type IslandConfig, type IslandLook, type IslandSize } from './protocol';

/**
 * The desktop island itself — what the `island` window renders. The window
 * keeps one generous size at the top (or bottom) centre of the primary
 * monitor and never resizes — a transparent WebView2 that shrinks leaves
 * stale tiles on screen. Instead the pill springs between sizes (width and
 * height, as the title-bar island does) and every frame the window's region
 * is set to the pill plus its shadow: outside it nothing paints and clicks
 * fall through to whatever is underneath. A held pointer drags it along the
 * edge; a right click opens its own little menu; after a while with nothing
 * to say it can shrink to a sliver or step off the screen.
 */
/** Room around the pill inside the window (CSS px). */
const PAD = 24;
/** How much of the shadow the region keeps around the pill. */
const HALO = 10;
/** Gap between the pill and the edge of the screen. */
const EDGE = 5;
/** The window: wide enough for the widest compact readout, tall enough for the open centre. */
const WIN_W = 820;
const WIN_H = 540;
const HOLD_MS = 260;
/** Within this fraction of the monitor width it snaps back to the centre. */
const MAGNET = 0.012;
const SCALE: Record<IslandSize, number> = { compact: 0.9, regular: 1, large: 1.15 };
const LOOK: Record<IslandLook, (accent: string) => string> = { black: () => '#111', graphite: () => '#202024', accent: (a) => `color-mix(in srgb, ${a} 30%, #101012)` };

interface Mon {
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  scale: number;
}

let monCache: { at: number; mon: Mon } | null = null;
/** The primary monitor's work area, physical pixels; cached a few seconds (every placement asks). */
async function monitor(): Promise<Mon | null> {
  if (monCache && Date.now() - monCache.at < 3000) return monCache.mon;
  const { primaryMonitor, currentMonitor } = await import('@tauri-apps/api/window');
  const m = (await primaryMonitor().catch(() => null)) ?? (await currentMonitor().catch(() => null));
  if (!m) return null;
  const work = m.workArea ?? { position: m.position, size: m.size };
  const mon = { wx: work.position.x, wy: work.position.y, ww: work.size.width, wh: work.size.height, scale: m.scaleFactor };
  monCache = { at: Date.now(), mon };
  return mon;
}

export function DesktopIsland() {
  const config = useIsland((s) => s.config);
  useEffect(() => {
    let un: (() => void) | undefined;
    let gone = false;
    void startFeed().then(async (u) => {
      if (gone) {
        u();
        return;
      }
      un = u;
      const { emit } = await import('@tauri-apps/api/event');
      await emit(EV.ready);
    });
    return () => {
      gone = true;
      un?.();
      void stopWatchers();
    };
  }, []);
  // The accent and the font come from the app's settings; everything else in here is white on black.
  useEffect(() => {
    if (!config) return;
    const root = document.documentElement;
    root.style.setProperty('--accent', config.accent);
    root.style.setProperty('--font-sans', config.font);
  }, [config]);
  if (!config) return null;
  return (
    <MotionConfig reducedMotion="user">
      <Shell key={config.language} config={config} />
    </MotionConfig>
  );
}

function Shell({ config }: { config: IslandConfig }) {
  const { shown, open, idle, hidden, hover, live, playing, pulse } = useIsland(useShallow((s) => ({ shown: s.shown, open: s.open, idle: s.idle, hidden: s.hidden, hover: s.hover, live: s.live, playing: !!s.media?.playing, pulse: s.pulse })));
  const setHover = useIsland((s) => s.setHover);
  const setIdle = useIsland((s) => s.setIdle);
  const setOpen = useIsland((s) => s.setOpen);
  const show = useIsland((s) => s.show);
  const fold = useIsland((s) => s.fold);
  const scale = SCALE[config.size];
  const top = config.edge === 'top';
  const dot = idle && config.idle === 'dot' && !shown && !open;
  const visible = !hidden && !(idle && config.idle === 'hide' && !shown && !open);

  // A card folds on its own — unless the pointer is on it or it needs an answer.
  useEffect(() => {
    if (!shown || shown.foldMs === null) return;
    const { id } = shown.card;
    const at = shown.at;
    let timer = window.setTimeout(tick, shown.foldMs);
    function tick() {
      if (useIsland.getState().hover) {
        timer = window.setTimeout(tick, 1000);
        return;
      }
      const cur = useIsland.getState().shown;
      if (cur && cur.card.id === id && cur.at === at) fold();
    }
    return () => window.clearTimeout(timer);
  }, [shown, fold]);

  // The centre closes by itself once the pointer has been away for a while.
  useEffect(() => {
    if (!open) return;
    let timer = window.setTimeout(tick, 12_000);
    function tick() {
      if (useIsland.getState().hover) {
        timer = window.setTimeout(tick, 2000);
        return;
      }
      setOpen(false);
    }
    return () => window.clearTimeout(timer);
  }, [open, setOpen]);

  // Idle: nothing shown, nothing playing, no agent working, the pointer away — for as long as the settings say.
  const busy = !!shown || open || hover || (config.readouts.agent && !!live) || (config.readouts.media && playing);
  useEffect(() => {
    if (config.idle === 'stay' || busy) {
      setIdle(false);
      return;
    }
    const timer = window.setTimeout(() => setIdle(true), Math.max(3, config.idleSeconds) * 1000);
    return () => window.clearTimeout(timer);
  }, [config.idle, config.idleSeconds, busy, pulse, setIdle]);

  // The pill follows the size of whatever is inside it — measured in its own (unscaled) pixels: the rect comes
  // out multiplied by the size setting's scale, so it is divided back.
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.ceil(r.width / scale) + 1, h: Math.ceil(r.height / scale) });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const fonts = document.fonts;
    const onFonts = () => measure();
    fonts?.addEventListener?.('loadingdone', onFonts);
    void fonts?.ready.then(measure);
    return () => {
      ro.disconnect();
      fonts?.removeEventListener?.('loadingdone', onFonts);
    };
  }, [scale]);

  // Where it sits along the edge: the settings' shift, or the finger's while it is being dragged.
  const shift = useRef(config.shift);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) shift.current = config.shift;
  }, [config.shift, dragging]);

  // The window: one size, centred on the edge (plus the shift), shown once the pill has been measured.
  const winW = Math.min(WIN_W, Math.max(360, (window.screen.width || WIN_W) - 40));
  const place = useCallback(async () => {
    const mon = await monitor();
    if (!mon) return;
    const dpr = window.devicePixelRatio || mon.scale;
    const W = Math.round(winW * dpr);
    const H = Math.round(WIN_H * dpr);
    const centre = mon.wx + mon.ww / 2 + shift.current * mon.ww;
    const x = Math.round(Math.min(Math.max(centre - W / 2, mon.wx), mon.wx + mon.ww - W));
    const off = Math.round((EDGE - PAD) * dpr);
    const y = top ? mon.wy + off : mon.wy + mon.wh - H - off;
    await islandSetBounds({ x, y, width: W, height: H, show: true }).catch(() => void 0);
  }, [top, winW]);
  const ready = !!size;
  useEffect(() => {
    if (!visible || !ready) return;
    void place();
  }, [visible, ready, place, config.shift]);
  useEffect(() => {
    if (!visible) void islandHide().catch(() => void 0);
  }, [visible]);

  // The region follows the pill every frame it moves: its box (scaled, as drawn) plus a halo for the shadow.
  const pill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pill.current;
    if (!el) return;
    let raf = 0;
    let last = '';
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = window.devicePixelRatio || 1;
      // The corner radius as drawn: the animated style value, scaled like the box.
      const drawn = (parseFloat(getComputedStyle(el).borderRadius) || 15) * (el.offsetWidth ? r.width / el.offsetWidth : 1);
      const next = { x: Math.floor((r.left - HALO) * dpr), y: Math.floor((r.top - HALO) * dpr), width: Math.ceil((r.width + HALO * 2) * dpr), height: Math.ceil((r.height + HALO * 2) * dpr), radius: Math.round((drawn + HALO) * dpr) };
      const key = [next.x, next.y, next.width, next.height, next.radius].join(',');
      if (key === last) return;
      last = key;
      void islandSetRegion(next).catch(() => void 0);
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    // The pill's width and height are animated CSS: the observer fires on every frame of the spring. A change of
    // edge or size moves the pill without resizing it, hence the dependencies.
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    schedule();
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [top, scale]);

  // Hold the island and it comes along the edge; a short press is still a click.
  const drag = useRef<{ id: number; startX: number; startShift: number; armed: boolean; moved: boolean; timer: number; raf: number } | null>(null);
  const swallowClick = useRef(false);
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    const el = e.currentTarget;
    const d = { id: e.pointerId, startX: e.screenX, startShift: shift.current, armed: false, moved: false, timer: 0, raf: 0 };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      const dx = ev.screenX - d.startX;
      if (!d.armed) {
        if (Math.abs(dx) > 6) stop();
        return;
      }
      d.moved = true;
      if (d.raf) return;
      d.raf = window.requestAnimationFrame(async () => {
        d.raf = 0;
        const mon = await monitor();
        if (!mon) return;
        // screenX is in device-independent pixels: back to physical for the fraction of the monitor.
        let next = d.startShift + (dx * (window.devicePixelRatio || mon.scale)) / mon.ww;
        if (Math.abs(next) < MAGNET) next = 0;
        shift.current = Math.max(-0.5, Math.min(0.5, next));
        void place();
      });
    };
    const stop = () => {
      window.clearTimeout(d.timer);
      window.cancelAnimationFrame(d.raf);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onEnd, true);
      window.removeEventListener('pointercancel', onEnd, true);
      window.removeEventListener('blur', onEnd);
      try {
        el.releasePointerCapture(d.id);
      } catch {
        /* never captured */
      }
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
        void act({ type: 'shift', value: shift.current });
      }
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onEnd, true);
    window.addEventListener('pointercancel', onEnd, true);
    window.addEventListener('blur', onEnd);
    d.timer = window.setTimeout(() => {
      d.armed = true;
      setDragging(true);
      try {
        el.setPointerCapture(d.id);
      } catch {
        /* fine */
      }
    }, HOLD_MS);
    drag.current = d;
  };

  const background = LOOK[config.look](config.accent);
  const unfolded = open || (!!shown && shown.card.kind !== 'app' && shown.card.kind !== 'volume' && shown.card.kind !== 'power' && shown.card.kind !== 'clipboard');
  return (
    <div className="fixed inset-0 flex justify-center" style={{ alignItems: top ? 'flex-start' : 'flex-end', padding: PAD }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: top ? 'top center' : 'bottom center' }}>
        <motion.div
          ref={pill}
          data-island={open || shown ? 'open' : 'compact'}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: dragging ? 1.04 : 1, ...(size ? { width: size.w, height: size.h } : {}) }}
          transition={springs.modal}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onPointerDown={onPointerDown}
          onContextMenu={(e) => {
            e.preventDefault();
            show({ kind: 'menu', id: 'menu' }, 5, 8000);
          }}
          onClickCapture={(e) => {
            if (!swallowClick.current) return;
            swallowClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }}
          className={cn('relative touch-none select-none overflow-hidden text-white transition-shadow', dragging ? 'cursor-grabbing shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.14)]' : 'shadow-[0_4px_18px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,255,255,0.08)]')}
          style={{ background, opacity: config.opacity, borderRadius: unfolded ? 18 : dot ? 6 : 15 }}
        >
          <div ref={inner} className="relative w-max">
            {open ? <Centre key="open" config={config} /> : shown ? <CardView key={`card:${shown.card.kind}:${shown.card.id}`} card={shown.card} config={config} /> : <Compact key={dot ? 'dot' : 'compact'} config={config} dot={dot} maxWidth={Math.floor((winW - PAD * 2) / scale)} />}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

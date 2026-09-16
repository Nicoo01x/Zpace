import { listen } from '@/native/bridge';
import { resolveLanguage, setLanguage } from '@/i18n';
import { desktopWatch, type ClipboardChange, type DesktopSource, type Foreground, type NotificationsAccess, type Power, type Volume, type WinNotificationsDelta } from '@/native/desktop';
import type { MediaNow } from '@/native/media';
import { useIsland } from './store';
import { DESKTOP_EV, EV, type ChipData, type IslandConfig, type LiveState, type SerialNotification } from './protocol';

/**
 * Feeds the island: every event from the main window and from Rust lands in
 * the store here, and the ones worth a moment of the pill become cards. The
 * rules of what unfolds, for how long and over what live in this file — the
 * store only queues.
 *
 * Priorities: 5 needs an answer · 4 an error · 3 a message (a toast, a Zpace
 * notification, the battery) · 2 a moment (a track, an app opening, a copy)
 * · 1 the volume.
 */
type Unlisten = () => void;

const seconds = (s: number) => Math.max(1500, s * 1000);

function foldFor(n: SerialNotification, cfg: IslandConfig): number | null {
  if (n.sticky || n.variant === 'loading') return null;
  if (n.foldMs) return n.foldMs;
  const base = seconds(cfg.foldSeconds);
  return n.variant === 'error' || n.variant === 'warning' ? base * 1.5 : base;
}

function priorityFor(n: SerialNotification): number {
  if (n.sticky) return 5;
  if (n.variant === 'error') return 4;
  return 3;
}

/** Which Rust watchers a config wants running. */
export function sourcesFor(cfg: IslandConfig): DesktopSource[] {
  const m = cfg.modules;
  const out: DesktopSource[] = [];
  if (m.media || cfg.readouts.media) out.push('media');
  if (m.windows) out.push('notifications');
  if (m.foreground !== 'off') out.push('foreground');
  if (m.volume) out.push('volume');
  if (m.power || cfg.readouts.battery) out.push('power');
  if (m.clipboard) out.push('clipboard');
  return out;
}

let running = new Set<DesktopSource>();

/** Start and stop watchers so the running set matches the config. */
export async function syncWatchers(cfg: IslandConfig): Promise<void> {
  const want = new Set(sourcesFor(cfg));
  for (const s of running) if (!want.has(s)) await desktopWatch(s, false).catch(() => void 0);
  for (const s of want) if (!running.has(s)) await desktopWatch(s, true).catch(() => void 0);
  running = want;
}

export async function stopWatchers(): Promise<void> {
  for (const s of running) await desktopWatch(s, false).catch(() => void 0);
  running = new Set();
}

/** Wire every event into the store. Returns the unlisten for all of them. */
export async function startFeed(): Promise<Unlisten> {
  const st = useIsland.getState;
  const uns: Unlisten[] = [];
  // Some sources say something the moment they start (the volume, the battery, what is already playing): the
  // first message is the state of things, not news.
  let mediaKey = '';
  let mediaPausedAt = 0;
  let volumeSeen = false;
  let powerSeen: Power | null = null;

  uns.push(
    await listen<IslandConfig>(EV.config, (cfg) => {
      setLanguage(resolveLanguage(cfg.language));
      st().setConfig(cfg);
      void syncWatchers(cfg);
    }),
    await listen<{ items: SerialNotification[] }>(EV.notifications, ({ items }) => st().setItems(items)),
    await listen<SerialNotification>(EV.bloom, (n) => {
      const cfg = st().config;
      if (!cfg || !cfg.modules.zpace) return;
      // The system clipboard watcher already says "copied" for every copy, the app's own copy toast would double it.
      if (n.mark === 'clipboard' && cfg.modules.clipboard) return;
      st().show({ kind: 'zpace', id: n.id, n }, priorityFor(n), foldFor(n, cfg));
    }),
    await listen<LiveState | null>(EV.live, (live) => st().setLive(live)),
    await listen<Record<string, ChipData>>(EV.chips, (chips) => st().setChips(chips)),

    await listen<MediaNow | null>(DESKTOP_EV.media, (m) => {
      const cfg = st().config;
      const before = st().media;
      st().setMedia(m);
      if (!m || !cfg?.modules.media) return;
      const key = [m.app, m.title, m.artist].join('|');
      const changed = key !== mediaKey;
      const resumed = m.playing && before && !before.playing && mediaPausedAt && Date.now() - mediaPausedAt > 30_000;
      if (before && !m.playing && before.playing) mediaPausedAt = Date.now();
      if (m.playing) mediaPausedAt = 0;
      const first = mediaKey === '';
      mediaKey = key;
      // A new track playing, or play after a long pause: the cover unfolds for a moment. The first read is the state of things.
      if (!first && m.playing && (changed || resumed)) st().show({ kind: 'media', id: 'media' }, 2, Math.min(seconds(cfg.foldSeconds), 5000));
    }),
    await listen<WinNotificationsDelta>(DESKTOP_EV.notifications, ({ added, removed, initial }) => {
      const cfg = st().config;
      st().addWin(added, removed);
      if (initial || !cfg?.modules.windows) return;
      for (const n of added) st().show({ kind: 'win', id: `win:${n.id}`, n }, 3, seconds(cfg.foldSeconds) + 1500);
    }),
    await listen<NotificationsAccess>(DESKTOP_EV.access, (a) => st().setWinAccess(a)),
    await listen<Foreground>(DESKTOP_EV.foreground, (f) => {
      const cfg = st().config;
      st().setForeground(f);
      if (!cfg || cfg.modules.foreground === 'off') return;
      if (cfg.modules.foreground === 'launches' && !f.fresh) return;
      st().show({ kind: 'app', id: `app:${f.pid}`, app: f }, 2, f.fresh ? 2600 : 1700);
    }),
    await listen<Volume>(DESKTOP_EV.volume, (v) => {
      const cfg = st().config;
      st().setVolume(v);
      if (!volumeSeen) {
        volumeSeen = true;
        return;
      }
      if (!cfg?.modules.volume) return;
      st().show({ kind: 'volume', id: 'volume' }, 1, 1500);
    }),
    await listen<Power>(DESKTOP_EV.power, (p) => {
      const cfg = st().config;
      const prev = powerSeen;
      powerSeen = p;
      st().setPower(p);
      if (!prev || !cfg?.modules.power || !p.hasBattery) return;
      if (p.charging !== prev.charging) {
        st().show({ kind: 'power', id: 'power', power: p, reason: p.charging ? 'plugged' : 'unplugged' }, 3, 3200);
        return;
      }
      // Crossing 20, 10 and 5 % on battery.
      const step = (pct: number | null) => (pct === null ? 99 : pct <= 5 ? 5 : pct <= 10 ? 10 : pct <= 20 ? 20 : 99);
      if (!p.charging && step(p.percent) < step(prev.percent)) st().show({ kind: 'power', id: 'power', power: p, reason: 'low' }, 3, seconds(cfg.foldSeconds) * 1.5);
    }),
    await listen<ClipboardChange>(DESKTOP_EV.clipboard, (c) => {
      const cfg = st().config;
      if (!cfg?.modules.clipboard) return;
      st().show({ kind: 'clipboard', id: 'clipboard', change: c }, 2, 2600);
    }),
  );
  return () => {
    for (const u of uns) u();
  };
}

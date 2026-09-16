import { isValidElement } from 'react';
import { isTauri, listen } from '@/native/bridge';
import { islandClose, islandOpen } from '@/native/desktop';
import { useSettings, ACCENT_PRESETS } from '@/stores/settings';
import { useNotifications, type AppNotification } from '@/stores/notifications';
import { useSessions } from '@/stores/sessions';
import { useUI, collectLeaves } from '@/stores/ui';
import { resolveFontStack } from '@/lib/fonts';
import { resolveLanguage } from '@/i18n';
import { liveOf } from '../live';
import { useIslandChips } from '../chips';
import { EV, type ChipData, type IslandAction, type IslandConfig, type LiveState, type SerialNotification } from './protocol';

/**
 * The main window's side of the desktop island: opens the window when the
 * setting is on, keeps it fed (the config whenever settings change, the
 * notification list and each new bloom, the live agent readout, the plugin
 * chips) and carries out what it asks for. `syncDesktopIsland()` is
 * idempotent — called at boot and on every settings change.
 */
type Unlisten = () => void;

let running = false;
let unsubs: Unlisten[] = [];

async function emitTo<T>(event: string, payload: T): Promise<void> {
  const { emitTo: send } = await import('@tauri-apps/api/event');
  await send('island', event, payload).catch(() => void 0);
}

function config(): IslandConfig {
  const s = useSettings.getState();
  const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const preset = ACCENT_PRESETS.find((a) => a.id === s.accent);
  // The island is always dark: its accent is the dark-mode one, or whatever the theme pack set.
  const accent = s.colors.dark.accent ?? preset?.dark ?? (dark ? (s.colors.dark.accent ?? '#6da8f5') : '#6da8f5');
  return { ...s.desktopIsland, language: resolveLanguage(s.language), accent, font: resolveFontStack(s.font, false), userName: s.userName ?? '' };
}

function serial(n: AppNotification): SerialNotification {
  const extras = useNotifications.getState().extras[n.id];
  const icon = extras?.icon;
  // A plugin card's image is an <img>: its src travels; any other node stays here.
  const image = isValidElement<{ src?: string }>(icon) && icon.type === 'img' && typeof icon.props.src === 'string' ? icon.props.src : undefined;
  return { id: n.id, variant: n.variant, title: n.title, summary: n.summary, at: n.at, read: n.read, mark: n.mark, sticky: n.sticky, foldMs: n.foldMs, actionLabel: extras?.action?.label, image };
}

function chips(): Record<string, ChipData> {
  const out: Record<string, ChipData> = {};
  for (const [owner, c] of Object.entries(useIslandChips.getState().chips)) out[owner] = { text: c.text, icon: c.icon, title: c.title, color: c.color };
  return out;
}

let lastLive: LiveState | null = null;
function sendLive(force = false) {
  const live = liveOf(useSessions.getState());
  const same = live === lastLive || (live && lastLive && live.sessionId === lastLive.sessionId && live.activity === lastLive.activity && live.subject === lastLive.subject && live.running === lastLive.running && live.waiting === lastLive.waiting);
  if (same && !force) return;
  lastLive = live;
  void emitTo(EV.live, live);
}

function sendAll() {
  void emitTo(EV.config, config());
  void emitTo(EV.notifications, { items: useNotifications.getState().items.map(serial) });
  sendLive(true);
  void emitTo(EV.chips, chips());
}

function focusSession(id: string) {
  const ui = useUI.getState();
  ui.setActiveSession(id);
  const leaf = collectLeaves(ui.layout).find((l) => l.content.kind === 'session' && l.content.sessionId === id);
  if (leaf) ui.setActivePane(leaf.id);
  else ui.setPaneContent(ui.activePaneId, { kind: 'session', sessionId: id });
}

function handle(action: IslandAction) {
  const s = useSettings.getState();
  switch (action.type) {
    case 'focus-session':
      focusSession(action.id);
      return;
    case 'notification': {
      const ntf = useNotifications.getState();
      const a = ntf.extras[action.id]?.action;
      if (a) {
        a.run();
        ntf.remove(action.id);
      } else ntf.markAllRead();
      return;
    }
    case 'remove-notification':
      useNotifications.getState().remove(action.id);
      return;
    case 'clear-notifications':
      useNotifications.getState().clear();
      return;
    case 'mark-read':
      useNotifications.getState().markAllRead();
      return;
    case 'chip':
      useIslandChips.getState().chips[action.owner]?.onClick?.();
      return;
    case 'shift':
      s.patch({ desktopIsland: { ...s.desktopIsland, shift: Math.max(-0.5, Math.min(0.5, action.value)) } });
      return;
    case 'dnd':
      s.patch({ desktopIsland: { ...s.desktopIsland, dnd: action.value } });
      return;
    case 'open-settings':
      useUI.getState().openSettings('island');
      return;
    case 'reveal':
      return;
    case 'disable':
      s.patch({ desktopIsland: { ...s.desktopIsland, enabled: false } });
      return;
  }
}

async function start() {
  running = true;
  await islandOpen().catch((e) => console.warn('[island] open failed', e));
  unsubs.push(
    await listen(EV.ready, sendAll),
    await listen<IslandAction>(EV.action, handle),
    useSettings.subscribe((s, prev) => {
      if (s.desktopIsland !== prev.desktopIsland || s.language !== prev.language || s.accent !== prev.accent || s.colors !== prev.colors || s.font !== prev.font || s.theme !== prev.theme) void emitTo(EV.config, config());
    }),
    useNotifications.subscribe((s, prev) => {
      if (s.items !== prev.items || s.extras !== prev.extras) void emitTo(EV.notifications, { items: s.items.map(serial) });
      if (s.bloom && s.bloom !== prev.bloom) void emitTo(EV.bloom, serial(s.bloom));
    }),
    useSessions.subscribe(() => sendLive()),
    useIslandChips.subscribe(() => void emitTo(EV.chips, chips())),
  );
  // The island may already be up (a reload of this window): feed it now as well as on `ready`.
  sendAll();
}

async function stop() {
  running = false;
  for (const u of unsubs) u();
  unsubs = [];
  lastLive = null;
  await islandClose().catch(() => void 0);
}

/** Open or close the desktop island to match the setting. */
export function syncDesktopIsland(): void {
  if (!isTauri) return;
  const on = useSettings.getState().desktopIsland.enabled;
  if (on && !running) void start();
  else if (!on && running) void stop();
}

/** Boot: once settings are in, follow the switch. */
export function watchDesktopIsland(): void {
  if (!isTauri) return;
  const begin = () => {
    syncDesktopIsland();
    useSettings.subscribe((s, prev) => {
      if (s.desktopIsland.enabled !== prev.desktopIsland.enabled) syncDesktopIsland();
    });
  };
  if (useSettings.persist.hasHydrated()) begin();
  else useSettings.persist.onFinishHydration(begin);
}

import { invoke, isTauri } from './bridge';

/**
 * The desktop island window and what Windows tells it (`commands/island.rs`,
 * `commands/desktop.rs`). Everything is a no-op in the browser preview and on
 * platforms without the watchers.
 */

export type DesktopSource = 'media' | 'notifications' | 'foreground' | 'volume' | 'power' | 'clipboard';

export interface WinNotification {
  id: number;
  app: string;
  appId: string;
  title: string;
  body: string;
  at: number;
  logo: string | null;
}

export interface WinNotificationsDelta {
  added: WinNotification[];
  removed: number[];
  initial: boolean;
}

export type NotificationsAccess = 'allowed' | 'denied' | 'unspecified' | 'unsupported';

export interface Foreground {
  pid: number;
  exe: string;
  path: string;
  name: string;
  title: string;
  icon: string | null;
  fresh: boolean;
}

export interface Volume {
  level: number;
  muted: boolean;
}

export interface Power {
  hasBattery: boolean;
  percent: number | null;
  charging: boolean;
  minutes: number | null;
}

export interface ClipboardChange {
  kind: 'text' | 'image';
  preview: string;
  chars: number;
}

export interface IslandBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  show: boolean;
}

export async function islandOpen(): Promise<void> {
  if (!isTauri) return;
  await invoke('island_open');
}

export async function islandClose(): Promise<void> {
  if (!isTauri) return;
  await invoke('island_close');
}

export async function islandSetBounds(b: IslandBounds): Promise<void> {
  if (!isTauri) return;
  await invoke('island_set_bounds', { ...b });
}

export interface IslandRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/** Clip the island window to the pill (physical px, window-relative): outside it, nothing paints and clicks pass through. */
export async function islandSetRegion(r: IslandRegion): Promise<void> {
  if (!isTauri) return;
  await invoke('island_set_region', { ...r });
}

export async function islandHide(): Promise<void> {
  if (!isTauri) return;
  await invoke('island_hide');
}

export async function islandRevealMain(): Promise<void> {
  if (!isTauri) return;
  await invoke('island_reveal_main');
}

export async function desktopWatch(source: DesktopSource, on: boolean): Promise<void> {
  if (!isTauri) return;
  await invoke('desktop_watch', { source, on });
}

export async function notificationDismiss(id: number): Promise<void> {
  if (!isTauri) return;
  await invoke('notification_dismiss', { id });
}

export async function notificationsClear(): Promise<void> {
  if (!isTauri) return;
  await invoke('notifications_clear');
}

export async function volumeGet(): Promise<Volume | null> {
  if (!isTauri) return null;
  return invoke<Volume | null>('volume_get');
}

export async function volumeSet(level: number, muted?: boolean): Promise<void> {
  if (!isTauri) return;
  await invoke('volume_set', { level, muted: muted ?? null });
}

export async function powerStatus(): Promise<Power | null> {
  if (!isTauri) return null;
  return invoke<Power>('power_status');
}

export async function activateApp(exe: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('activate_app', { exe });
}

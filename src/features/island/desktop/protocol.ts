import type { Language } from '@/i18n';
import type { AppNotification } from '@/stores/notifications';
import type { LiveState } from '../live';

/**
 * What the main window and the desktop island window say to each other.
 * They are two webviews: the main one owns every store (settings,
 * notifications, sessions, plugins) and pushes what the island needs as
 * events; the island answers with actions (a click on a session, "shift me
 * here", "turn me off") that the main window carries out. Nothing here holds
 * a React node or a callback — everything crosses as JSON.
 */
export type IslandEdge = 'top' | 'bottom';
export type IslandSize = 'compact' | 'regular' | 'large';
export type IslandLook = 'black' | 'graphite' | 'accent';
/** What the island does when nothing has happened for a while. */
export type IslandIdle = 'stay' | 'dot' | 'hide';
/** Which foreground changes the island announces: apps that just opened, every switch, none. */
export type ForegroundMode = 'off' | 'launches' | 'always';

export interface DesktopIslandSettings {
  enabled: boolean;
  edge: IslandEdge;
  size: IslandSize;
  look: IslandLook;
  /** 0.6..1 */
  opacity: number;
  idle: IslandIdle;
  idleSeconds: number;
  /** How long a card stays unfolded (seconds); alerts stay half as long again. */
  foldSeconds: number;
  /** Do not disturb: nothing unfolds except what needs an answer. */
  dnd: boolean;
  /** Where it sits along the edge: offset from the centre as a fraction of the monitor width. */
  shift: number;
  modules: {
    media: boolean;
    windows: boolean;
    foreground: ForegroundMode;
    volume: boolean;
    power: boolean;
    agents: boolean;
    zpace: boolean;
    clipboard: boolean;
    plugins: boolean;
  };
  /** The live readouts next to the brand while nothing is unfolded. */
  readouts: {
    clock: boolean;
    date: boolean;
    media: boolean;
    agent: boolean;
    battery: boolean;
  };
}

export const DESKTOP_ISLAND_DEFAULTS: DesktopIslandSettings = {
  enabled: false,
  edge: 'top',
  size: 'regular',
  look: 'black',
  opacity: 1,
  idle: 'stay',
  idleSeconds: 20,
  foldSeconds: 6,
  dnd: false,
  shift: 0,
  modules: { media: true, windows: true, foreground: 'launches', volume: true, power: true, agents: true, zpace: true, clipboard: false, plugins: true },
  readouts: { clock: true, date: false, media: true, agent: true, battery: true },
};

/** The settings plus what the island needs from the rest of the app to look like it. */
export interface IslandConfig extends DesktopIslandSettings {
  language: Language;
  /** The accent colour, resolved (hex). */
  accent: string;
  /** The interface font stack. */
  font: string;
  userName: string;
}

/** A Zpace notification as it crosses to the island: plain text plus the action's label; the node stays home. */
export interface SerialNotification extends Pick<AppNotification, 'id' | 'variant' | 'title' | 'summary' | 'at' | 'read' | 'mark' | 'sticky' | 'foldMs'> {
  actionLabel?: string;
  /** A plugin card's image (the only rich node that travels). */
  image?: string;
}

export interface ChipData {
  text: string;
  icon?: string;
  title?: string;
  color?: string;
}

export type { LiveState };

/** Main → island. */
export const EV = {
  config: 'island://config',
  notifications: 'island://notifications',
  bloom: 'island://bloom',
  live: 'island://live',
  chips: 'island://chips',
  /** Island → main: mounted, send everything. */
  ready: 'island://ready',
  /** Island → main. */
  action: 'island://action',
} as const;

/** Rust → island (see `commands/desktop.rs`). */
export const DESKTOP_EV = {
  media: 'desktop://media',
  notifications: 'desktop://notifications',
  access: 'desktop://notifications-access',
  foreground: 'desktop://foreground',
  volume: 'desktop://volume',
  power: 'desktop://power',
  clipboard: 'desktop://clipboard',
} as const;

export type IslandAction =
  | { type: 'focus-session'; id: string }
  | { type: 'notification'; id: string }
  | { type: 'remove-notification'; id: string }
  | { type: 'clear-notifications' }
  | { type: 'mark-read' }
  | { type: 'chip'; owner: string }
  | { type: 'shift'; value: number }
  | { type: 'dnd'; value: boolean }
  | { type: 'open-settings' }
  | { type: 'reveal' }
  | { type: 'disable' };

import { invoke, isTauri } from './bridge';

/** What the system's media session reports (Spotify, a browser tab, any player). */
export interface MediaNow {
  playing: boolean;
  title: string;
  artist: string;
  album: string;
  app: string;
  thumbnail: string | null;
  position_ms: number | null;
  duration_ms: number | null;
}

export async function mediaNow(): Promise<MediaNow | null> {
  if (!isTauri) return null;
  return invoke<MediaNow | null>('media_now');
}

export async function mediaControl(action: 'play' | 'pause' | 'toggle' | 'next' | 'previous'): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('media_control', { action });
}

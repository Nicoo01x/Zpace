import { invoke, isTauri, listen } from './bridge';

/**
 * The voice assistant's ears (Rust `listen.rs`): the default microphone
 * through cpal, one utterance cut by silence, transcribed by whisper.cpp —
 * fetched once into the app's data folder. `voiceListen` streams the
 * microphone level while it listens.
 */
export type VoiceModel = 'base' | 'small';

export interface VoiceReady {
  binary: boolean;
  model: boolean;
  dir: string;
}

export interface SetupProgress {
  stage: 'binary' | 'model';
  received: number;
  total: number;
}

export async function voiceReady(model: VoiceModel): Promise<VoiceReady> {
  if (!isTauri) return { binary: false, model: false, dir: '' };
  return invoke<VoiceReady>('voice_ready', { model });
}

export async function voiceSetup(model: VoiceModel, onProgress: (p: SetupProgress) => void): Promise<void> {
  const stop = await listen<SetupProgress>('voice://setup', onProgress);
  try {
    await invoke<void>('voice_setup', { model });
  } finally {
    stop();
  }
}

export interface VoiceDevice {
  name: string;
  isDefault: boolean;
}

/** The microphones on this machine, the system default first. */
export async function voiceDevices(): Promise<VoiceDevice[]> {
  if (!isTauri) return [];
  return invoke<VoiceDevice[]>('voice_devices').catch(() => []);
}

/** Resolves with the words ('' when nothing was said); `language` is a whisper code such as `es`, or undefined to detect it; `device` '' = the system default. */
export async function voiceListen(model: VoiceModel, language: string | undefined, device: string | undefined, onLevel: (level: number, speaking: boolean) => void): Promise<string> {
  if (!isTauri) throw new Error('Voice needs the desktop app.');
  const stop = await listen<{ level: number; speaking: boolean }>('voice://level', (p) => onLevel(p.level, p.speaking));
  try {
    return await invoke<string>('voice_listen', { model, language: language && language !== 'auto' ? language : null, device: device || null });
  } finally {
    stop();
  }
}

/** Stream a microphone's level for `seconds` (the settings' test); resolves with the loudest moment, 0..1. */
export async function voiceMeter(device: string | undefined, seconds: number, onLevel: (level: number) => void): Promise<number> {
  if (!isTauri) return 0;
  const stop = await listen<{ level: number }>('voice://level', (p) => onLevel(p.level));
  try {
    return await invoke<number>('voice_meter', { device: device || null, seconds });
  } finally {
    stop();
  }
}

export const voiceCancel = () => invoke<void>('voice_cancel').catch(() => void 0);

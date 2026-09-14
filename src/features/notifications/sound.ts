/**
 * Notification sounds synthesised with WebAudio — no asset, no network. Quiet by
 * design: a cue, not an alarm.
 *
 * Every cue is a few notes played by a small mallet instrument: a handful of
 * inharmonic partials with their own decay, a touch of filtered noise for the
 * strike, a slightly detuned twin for shimmer, a lowpass to keep it soft and a
 * short synthesised room (convolution) so it sits in space instead of beeping.
 * Three timbres are offered: glass (default), marimba and pop.
 */
export type SoundTheme = 'glass' | 'marimba' | 'pop';

interface Voice {
  /** [frequency ratio, level, decay multiplier] */
  partials: Array<[number, number, number]>;
  type: OscillatorType;
  attack: number;
  /** Strike transient level (0..1 of the note's peak). */
  noise: number;
  /** Bandpass centre of the strike, as a multiple of the note. */
  noiseRatio: number;
  lowpass: number;
  /** Wet level of the room. */
  reverb: number;
  /** Pitch drop over the first 50 ms (1 = none). */
  sweep: number;
  /** Detune of the shimmer twin in cents (0 = off). */
  shimmer: number;
}

const VOICES: Record<SoundTheme, Voice> = {
  glass: { partials: [[1, 1, 1], [2.0, 0.32, 0.55], [3.01, 0.16, 0.4], [4.16, 0.07, 0.28]], type: 'sine', attack: 0.004, noise: 0.14, noiseRatio: 3, lowpass: 7200, reverb: 0.38, sweep: 1, shimmer: 5 },
  marimba: { partials: [[1, 1, 1], [3.98, 0.24, 0.32], [9.9, 0.06, 0.18]], type: 'sine', attack: 0.003, noise: 0.3, noiseRatio: 2.5, lowpass: 5200, reverb: 0.24, sweep: 1, shimmer: 0 },
  pop: { partials: [[1, 1, 1], [2, 0.12, 0.5]], type: 'triangle', attack: 0.002, noise: 0.28, noiseRatio: 1.5, lowpass: 3800, reverb: 0.14, sweep: 0.55, shimmer: 0 },
};

let ctx: AudioContext | null = null;
let chain: { input: AudioNode; wet: GainNode } | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A small room: 1.3 s of decaying stereo noise, darkened over time. */
function impulse(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 1.3);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.exp(-5.2 * t) * (1 - Math.exp(-i / 180));
      // One-pole lowpass that closes as the tail fades.
      lp += ((Math.random() * 2 - 1) - lp) * (0.62 - 0.4 * t);
      d[i] = lp * env;
    }
  }
  return buf;
}

function graph(c: AudioContext) {
  if (chain) return chain;
  const master = c.createGain();
  master.gain.value = 1;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const conv = c.createConvolver();
  conv.buffer = impulse(c);
  const wet = c.createGain();
  const input = c.createGain();
  input.connect(master);
  input.connect(conv).connect(wet).connect(master);
  master.connect(limiter).connect(c.destination);
  chain = { input, wet };
  return chain;
}

interface Note {
  freq: number;
  at: number;
  dur: number;
  peak: number;
  pan?: number;
}

function strike(c: AudioContext, voice: Voice, n: Note) {
  const g = graph(c);
  g.wet.gain.setValueAtTime(voice.reverb, n.at);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = voice.lowpass;
  filter.Q.value = 0.5;
  const pan = c.createStereoPanner();
  pan.pan.value = n.pan ?? 0;
  filter.connect(pan).connect(g.input);

  const osc = (ratio: number, level: number, decay: number, detune = 0) => {
    const o = c.createOscillator();
    o.type = voice.type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(n.freq * ratio, n.at);
    if (voice.sweep !== 1) o.frequency.exponentialRampToValueAtTime(n.freq * ratio * voice.sweep, n.at + 0.05);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, n.at);
    gain.gain.linearRampToValueAtTime(n.peak * level, n.at + voice.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, n.at + n.dur * decay);
    o.connect(gain).connect(filter);
    o.start(n.at);
    o.stop(n.at + n.dur * decay + 0.05);
  };
  voice.partials.forEach(([ratio, level, decay], i) => {
    osc(ratio, level, decay);
    if (i === 0 && voice.shimmer) osc(ratio, level * 0.45, decay * 0.9, voice.shimmer);
  });

  if (voice.noise > 0) {
    const len = Math.floor(c.sampleRate * 0.03);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(12000, n.freq * voice.noiseRatio);
    bp.Q.value = 1.2;
    const gain = c.createGain();
    gain.gain.setValueAtTime(n.peak * voice.noise, n.at);
    gain.gain.exponentialRampToValueAtTime(0.0001, n.at + 0.03);
    src.connect(bp).connect(gain).connect(filter);
    src.start(n.at);
    src.stop(n.at + 0.04);
  }
}

function play(theme: SoundTheme, notes: Note[]) {
  const c = audio();
  if (!c) return;
  const voice = VOICES[theme] ?? VOICES.glass;
  const now = c.currentTime + 0.01;
  for (const n of notes) strike(c, voice, { ...n, at: now + n.at });
}

// Pitches (equal temperament, A4 = 440).
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, E4 = 329.63, C4 = 261.63, G4 = 392;

/** Agent finished / needs attention. `volume` 0..1 scales the (already soft) peak. */
export function playChime(kind: 'done' | 'attention' = 'done', volume = 1, theme: SoundTheme = 'glass') {
  const v = 0.11 * volume;
  if (kind === 'done') {
    // A rising major triad, the last note left to ring: "it's ready".
    play(theme, [
      { freq: C5, at: 0, dur: 0.55, peak: v * 0.85, pan: -0.18 },
      { freq: E5, at: 0.1, dur: 0.6, peak: v * 0.9, pan: 0.02 },
      { freq: G5, at: 0.2, dur: 1.1, peak: v, pan: 0.18 },
    ]);
  } else {
    // A gentle doorbell — falling minor third, twice as slow: "someone's asking".
    play(theme, [
      { freq: G5, at: 0, dur: 0.8, peak: v * 0.95, pan: -0.12 },
      { freq: E5, at: 0.26, dur: 1.0, peak: v * 0.9, pan: 0.12 },
    ]);
  }
}

export type ToastSound = 'success' | 'error' | 'warning' | 'info' | 'neutral';

/** A short cue per toast variant: rising for success, low double for error, a knock for warnings, one tap for the rest. */
export function playToast(kind: ToastSound, volume = 1, theme: SoundTheme = 'glass') {
  const v = 0.07 * volume;
  switch (kind) {
    case 'success':
      play(theme, [
        { freq: G5, at: 0, dur: 0.32, peak: v * 0.8, pan: -0.1 },
        { freq: C6, at: 0.085, dur: 0.55, peak: v, pan: 0.1 },
      ]);
      break;
    case 'error':
      play(theme, [
        { freq: E4, at: 0, dur: 0.38, peak: v * 0.95 },
        { freq: C4, at: 0.14, dur: 0.5, peak: v * 0.9 },
      ]);
      break;
    case 'warning':
      play(theme, [
        { freq: D5, at: 0, dur: 0.24, peak: v * 0.85 },
        { freq: D5, at: 0.16, dur: 0.32, peak: v * 0.85 },
      ]);
      break;
    case 'info':
      play(theme, [{ freq: A5, at: 0, dur: 0.34, peak: v * 0.75 }]);
      break;
    default:
      play(theme, [{ freq: E6, at: 0, dur: 0.22, peak: v * 0.5 }]);
  }
}

/** Preview of a timbre: a soft G4 tap followed by the "done" chime. */
export function previewTheme(theme: SoundTheme, volume = 1) {
  play(theme, [{ freq: G4, at: 0, dur: 0.4, peak: 0.08 * volume }]);
  window.setTimeout(() => playChime('done', volume, theme), 380);
}

export const SOUND_THEMES: Array<{ id: SoundTheme; label: string; hint: string }> = [
  { id: 'glass', label: 'Glass', hint: 'Bright, airy, a little room' },
  { id: 'marimba', label: 'Marimba', hint: 'Warm wooden mallet' },
  { id: 'pop', label: 'Pop', hint: 'Soft synthetic taps' },
];

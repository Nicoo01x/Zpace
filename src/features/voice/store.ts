import { create } from 'zustand';

/**
 * The voice assistant's moment-to-moment state, for the orb: off (nothing
 * shown), listening (the microphone is open), thinking (Claude is working —
 * `acts` fills with what its tools did), speaking (the answer is read aloud),
 * idle (the orb waits for another tap). Not persisted.
 */
export type VoicePhase = 'off' | 'setup' | 'listening' | 'thinking' | 'speaking' | 'idle';

interface VoiceState {
  phase: VoicePhase;
  /** What was heard. */
  transcript: string;
  /** What is being heard right now, before the sentence is final. */
  hearing: string;
  /** Microphone level while listening, 0..1, and whether it reads as speech. */
  level: number;
  speaking: boolean;
  /** First-run download of the speech engine and its model. */
  setup?: { stage: 'binary' | 'model'; received: number; total: number };
  /** What Claude answered (spoken). */
  answer: string;
  /** What the tools did during the current turn, in order. */
  acts: string[];
  /** Why the last turn failed, if it did. */
  error?: string;
  /** A Windows setting that would fix it: the speech privacy switch, or a missing speech pack. */
  fix?: 'privacy' | 'language' | 'microphone';
  setPhase: (phase: VoicePhase) => void;
  begin: () => void;
  heard: (transcript: string) => void;
  hearingNow: (text: string) => void;
  levelNow: (level: number, speaking: boolean) => void;
  settingUp: (setup: { stage: 'binary' | 'model'; received: number; total: number } | undefined) => void;
  addAct: (line: string) => void;
  answered: (answer: string) => void;
  failed: (error: string, fix?: 'privacy' | 'language' | 'microphone') => void;
  off: () => void;
}

export const useVoice = create<VoiceState>()((set) => ({
  phase: 'off',
  transcript: '',
  hearing: '',
  level: 0,
  speaking: false,
  answer: '',
  acts: [],
  begin: () => set({ phase: 'listening', transcript: '', hearing: '', level: 0, speaking: false, answer: '', acts: [], error: undefined, fix: undefined, setup: undefined }),
  heard: (transcript) => set({ phase: 'thinking', transcript, hearing: '', level: 0, speaking: false }),
  hearingNow: (hearing) => set((s) => (s.phase === 'listening' ? { hearing } : s)),
  levelNow: (level, speaking) => set((s) => (s.phase === 'listening' ? { level, speaking } : s)),
  settingUp: (setup) => set(setup ? { phase: 'setup', setup } : { setup: undefined }),
  addAct: (line) => set((s) => ({ acts: [...s.acts, line] })),
  answered: (answer) => set({ phase: 'speaking', answer }),
  failed: (error, fix) => set({ phase: 'idle', error, fix }),
  setPhase: (phase) => set({ phase }),
  off: () => set({ phase: 'off', transcript: '', hearing: '', level: 0, speaking: false, answer: '', acts: [], error: undefined, fix: undefined, setup: undefined }),
}));

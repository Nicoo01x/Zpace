import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSessions } from '@/stores/sessions';
import { useSettings } from '@/stores/settings';
import type { StateId } from './bloub/states';

/**
 * What the mascot is doing, from what the app is doing: agents working →
 * thinking, a permission waiting → alert, a turn just finished → notify, an
 * error → wide eyes, a long quiet spell → sleep. A "fun" state set from a
 * click plays for a moment and then the live state takes over again.
 */
const SLEEP_AFTER_MS = 3 * 60_000;
const FUN: StateId[] = ['play', 'swirl', 'orbit', 'burst', 'comet', 'egg', 'hexagon', 'wink', 'wide'];

let funCount = 0;

/** A trick to pull from outside (a celebration): the hook picks it up on its next render. */
const trickListeners = new Set<(s: StateId) => void>();
export function pullTrick(state: StateId) {
  for (const l of trickListeners) l(state);
}

export function useMascotState(): { state: StateId; poke: () => void } {
  const activity = useSessions(
    useShallow((s) => {
      const all = Object.values(s.sessions);
      const running = all.some((x) => x.status === 'running');
      const waiting = all.some((x) => x.status === 'waiting');
      const errored = all.some((x) => x.status === 'error' && Date.now() - x.updatedAt < 8000);
      const finished = all.some((x) => x.status === 'completed' && Date.now() - x.updatedAt < 4000);
      return { running, waiting, errored, finished };
    }),
  );
  const [fun, setFun] = useState<StateId | null>(null);
  const [asleep, setAsleep] = useState(false);

  // Quiet for a few minutes → sleep; any pointer or key wakes it.
  useEffect(() => {
    let timer = window.setTimeout(() => setAsleep(true), SLEEP_AFTER_MS);
    const wake = () => {
      setAsleep(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAsleep(true), SLEEP_AFTER_MS);
    };
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('keydown', wake, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  useEffect(() => {
    if (!fun) return;
    const id = window.setTimeout(() => setFun(null), 2600);
    return () => window.clearTimeout(id);
  }, [fun]);

  const poke = () => setFun(FUN[funCount++ % FUN.length]);
  // Celebrations pick the trick: a burst when Claude finishes, an orbit for a commit, a comet for a push.
  useEffect(() => {
    const l = (s: StateId) => setFun(s);
    trickListeners.add(l);
    return () => {
      trickListeners.delete(l);
    };
  }, []);

  let state: StateId = 'idle';
  if (fun) state = fun;
  else if (activity.waiting) state = 'alert';
  else if (activity.errored) state = 'wide';
  else if (activity.finished) state = 'notify';
  else if (activity.running) state = 'thinking';
  else if (asleep) state = 'sleep';
  return { state, poke };
}

/** The mascot's colour: the user's pick, or the accent when unset. */
export function useMascotColor(): string {
  const chosen = useSettings((s) => s.mascot.color);
  const [accent, setAccent] = useState('#2f6fde');
  useEffect(() => {
    if (chosen) return;
    const read = () => setAccent(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f6fde');
    read();
    const unsub = useSettings.subscribe(() => requestAnimationFrame(read));
    return unsub;
  }, [chosen]);
  return chosen || accent;
}

/** What is behind the mascot where it lives (the eye holes show it). */
export function usePaper(): string {
  const [paper, setPaper] = useState('#ffffff');
  const theme = useSettings((s) => s.theme);
  const colors = useSettings((s) => s.colors);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPaper(getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || '#ffffff'));
    return () => cancelAnimationFrame(id);
  }, [theme, colors]);
  return paper;
}

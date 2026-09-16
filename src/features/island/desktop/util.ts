import { useEffect, useState } from 'react';

/** How content arrives inside the pill: a short fade from a blur. */
export const fade = { initial: { opacity: 0, filter: 'blur(3px)' }, animate: { opacity: 1, filter: 'blur(0px)' }, transition: { duration: 0.22, delay: 0.04 } };

/** The time, kept to the minute — only while the page is visible. */
export function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
      // Wake right after the minute turns over.
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    tick();
    const onVis = () => {
      if (!document.hidden) setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active]);
  return now;
}

/** "3:45" for a track position. */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

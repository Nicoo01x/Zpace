import { useEffect } from 'react';
import { Toaster as SileoToaster } from 'sileo';
import 'sileo/styles.css';
import './toaster.css';
import { useSettings } from '@/stores/settings';

/**
 * The sileo toaster, placed where Settings › Notifications says, following the
 * app theme (dark pill on light, light pill on dark). Alt+T focuses the newest
 * toast so it can be dismissed from the keyboard.
 */
export function Toaster() {
  const position = useSettings((s) => s.notifications.toastPosition);
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.altKey && e.key.toLowerCase() === 't')) return;
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-sileo-toast]'));
      const top = cards[cards.length - 1];
      if (top) {
        e.preventDefault();
        top.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <SileoToaster position={position} theme={theme === 'system' ? 'system' : theme} offset={{ top: 44, bottom: 16, left: 16, right: 16 }} />;
}

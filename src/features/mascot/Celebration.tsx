import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useMascotColor } from './useMascot';
import type { CelebrationKind } from './celebrate';

/**
 * The mascot celebrates: when Claude finishes, a commit lands or a push goes
 * through, a burst of confetti flies out of wherever the mascot is (title
 * bar, corner, entrance) with a ring pulse, and the mascot itself pulls one
 * of its tricks (see useMascotState). Triggered with `celebrate(kind)`.
 */
interface Particle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
  rotate: number;
  shape: 'dot' | 'bar' | 'ring';
}

let seq = 0;

function burst(cx: number, cy: number, colors: string[], kind: CelebrationKind): Particle[] {
  const n = kind === 'done' ? 22 : 16;
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const dist = 46 + Math.random() * 54;
    out.push({
      id: seq++,
      x: cx,
      y: cy,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 12,
      size: 4 + Math.random() * 5,
      color: colors[i % colors.length],
      rotate: (Math.random() - 0.5) * 240,
      shape: i % 5 === 0 ? 'ring' : i % 3 === 0 ? 'bar' : 'dot',
    });
  }
  return out;
}

export function Celebration() {
  const mascotColor = useMascotColor();
  const [bursts, setBursts] = useState<Array<{ id: number; cx: number; cy: number; particles: Particle[]; color: string }>>([]);
  useEffect(() => {
    const onCelebrate = (e: Event) => {
      const kind = ((e as CustomEvent<{ kind: CelebrationKind }>).detail?.kind ?? 'success') as CelebrationKind;
      const el = document.querySelector<HTMLElement>('[data-mascot]');
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const cs = getComputedStyle(document.documentElement);
      const v = (name: string) => cs.getPropertyValue(name).trim();
      const colors = kind === 'commit' || kind === 'push' ? [v('--success'), v('--accent'), mascotColor, '#f0c14b'] : [v('--accent'), v('--success'), mascotColor, '#f0c14b', '#e3609c'];
      const id = seq++;
      setBursts((b) => [...b, { id, cx: r.left + r.width / 2, cy: r.top + r.height / 2, particles: burst(r.left + r.width / 2, r.top + r.height / 2, colors, kind), color: mascotColor }]);
      window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1200);
    };
    window.addEventListener('conduit:celebrate', onCelebrate);
    return () => window.removeEventListener('conduit:celebrate', onCelebrate);
  }, [mascotColor]);
  if (!bursts.length) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[1390]" aria-hidden>
      <AnimatePresence>
        {bursts.map((b) => (
          <div key={b.id}>
            <motion.span
              initial={{ opacity: 0.55, scale: 0.3 }}
              animate={{ opacity: 0, scale: 2.6 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="absolute size-14 rounded-full"
              style={{ left: b.cx - 28, top: b.cy - 28, boxShadow: `0 0 0 2px ${b.color}` }}
            />
            {b.particles.map((p) => (
              <motion.span
                key={p.id}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
                animate={{ x: p.dx, y: p.dy + 26, opacity: 0, scale: 1, rotate: p.rotate }}
                transition={{ duration: 0.85 + Math.random() * 0.25, ease: [0.2, 0.7, 0.3, 1] }}
                className="absolute block"
                style={{
                  left: p.x - p.size / 2,
                  top: p.y - p.size / 2,
                  width: p.shape === 'bar' ? p.size * 2.2 : p.size,
                  height: p.shape === 'bar' ? p.size * 0.6 : p.size,
                  borderRadius: p.shape === 'bar' ? 2 : 999,
                  background: p.shape === 'ring' ? 'transparent' : p.color,
                  boxShadow: p.shape === 'ring' ? `inset 0 0 0 2px ${p.color}` : undefined,
                }}
              />
            ))}
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

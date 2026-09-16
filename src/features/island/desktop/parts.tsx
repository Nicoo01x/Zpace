import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { springs } from '@/lib/motion';
import { ZorynqMark } from '@/features/brand/ZorynqMark';
import { formatRelative } from '@/lib/format';
import { t } from '@/i18n';

/**
 * Small pieces every part of the desktop island shares: the brand, the row
 * at the top of an unfolded card, a round button.
 */
/** The Z and the name — and a dot when something arrived while you were away. */
export function Brand({ unread = 0, accent }: { unread?: number; accent?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ZorynqMark size={12} className="text-white" />
      <span className="text-[12px] font-semibold leading-none tracking-[-0.01em]">Zpace</span>
      {unread ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springs.pop} className="ml-0.5 block size-1.5 rounded-full" style={{ background: accent ?? 'var(--accent)' }} /> : null}
    </span>
  );
}

/** The first row of an unfolded card: who says it, when, and the cross. */
export function CardRow({ leading, at, onDismiss, onOpen, trailing }: { leading?: ReactNode; at?: number; onDismiss?: () => void; onOpen?: () => void; trailing?: ReactNode }) {
  const [now] = useState(() => Date.now());
  return (
    <div className="flex h-[24px] items-center px-2.5">
      {leading ?? (
        <button type="button" onClick={onOpen} className="inline-flex items-center" aria-label={t('Notifications')}>
          <Brand />
        </button>
      )}
      <span className="ml-auto" />
      {trailing}
      {at ? <span className="text-[10.5px] tabular text-white/40">{formatRelative(at, now)}</span> : null}
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label={t('Dismiss')} className="ml-1.5 inline-flex size-5 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">
          <X className="size-[11px]" />
        </button>
      ) : null}
    </div>
  );
}

/** A small round button inside a card (media controls, the volume). */
export function RoundButton({ children, onClick, label, primary, size = 26 }: { children: ReactNode; onClick: () => void; label: string; primary?: boolean; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={primary ? 'inline-flex items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90' : 'inline-flex items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/12 hover:text-white'}
      style={{ width: size, height: size }}
    >
      {children}
    </button>
  );
}

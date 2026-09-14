import { Pipette } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/**
 * A swatch that opens the system colour picker: any colour, not only the
 * presets. Shows the current custom colour (or a pipette when the value is
 * one of the presets / unset) and rings when it is the one in use.
 */
export function ColorDot({ value, custom, onChange, size = 18, className }: { value?: string; /** True when `value` is not one of the presets — the dot then shows it. */ custom?: boolean; onChange: (hex: string) => void; size?: number; className?: string }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value ?? '') ? (value as string) : '#3f82f6';
  return (
    <label
      title={t('Any colour…')}
      className={cn('relative inline-flex cursor-pointer items-center justify-center rounded-full text-white transition-transform hover:scale-110', custom && 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--surface-raised)]', className)}
      style={{ width: size, height: size, background: custom ? hex : 'conic-gradient(from 0deg, #e5484d, #f0883e, #e2b53e, #3fae6b, #2ba9a0, #3f82f6, #8e5cd9, #e3609c, #e5484d)' }}
    >
      {!custom ? <Pipette className="drop-shadow" style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2.2} /> : null}
      <input type="color" aria-label={t('Any colour…')} value={hex} onChange={(e) => onChange(e.target.value)} onClick={(e) => e.stopPropagation()} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

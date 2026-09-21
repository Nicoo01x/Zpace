import { Folder } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/Tooltip';
import { ColorDot } from '@/components/ui/ColorDot';
import { PROJECT_COLORS } from './colors';
import { t } from '@/i18n';

/**
 * The colour swatches at the bottom of a project's or a folder's menu: none,
 * the named set, and a custom dot. `noneLabel` says what "none" means there
 * (the neutral glyph for a project, the project's colour for a folder).
 */
export function FolderColourRow({ value, onChange, noneLabel }: { value?: string; onChange: (color: string | undefined) => void; noneLabel?: string }) {
  const none = noneLabel ?? t('None');
  return (
    <div className="px-2 pb-1.5 pt-1">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">{t('Folder colour')}</div>
      <div role="group" aria-label={t('Folder colour')} className="flex items-center gap-1.5">
        <Tooltip content={none} side="bottom">
          <button
            type="button"
            aria-pressed={!value}
            aria-label={none}
            onClick={() => onChange(undefined)}
            className={cn('inline-flex size-[18px] items-center justify-center rounded-full text-muted transition-transform hover:scale-110', !value && 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--surface-raised)]')}
          >
            <Folder className="size-[13px]" strokeWidth={1.75} />
          </button>
        </Tooltip>
        {PROJECT_COLORS.map((c) => (
          <Tooltip key={c.id} content={t(c.label)} side="bottom">
            <button
              type="button"
              aria-pressed={value === c.value}
              aria-label={t(c.label)}
              onClick={() => onChange(c.value)}
              style={{ backgroundColor: c.value }}
              className={cn('size-[18px] rounded-full transition-transform hover:scale-110', value === c.value && 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--surface-raised)]')}
            />
          </Tooltip>
        ))}
        <ColorDot value={value} custom={!!value && !PROJECT_COLORS.some((c) => c.value === value)} onChange={(hex) => onChange(hex)} />
      </div>
    </div>
  );
}

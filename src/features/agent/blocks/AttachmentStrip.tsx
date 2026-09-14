import { FileText, Folder, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Attachment } from '@/types/agent';
import { useUI } from '@/stores/ui';
import { formatBytes } from '@/lib/format';
import { t } from '@/i18n';

export function AttachmentStrip({
  attachments,
  onRemove,
  className,
}: {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
  className?: string;
}) {
  const openLightbox = useUI((s) => s.openLightbox);
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {attachments.map((a, i) =>
        a.kind === 'image' && a.url ? (
          <button
            key={a.id}
            type="button"
            onClick={() => openLightbox({ url: a.url!, name: a.name })}
            className="group/att relative h-14 overflow-hidden rounded-md shadow-[0_0_0_1px_var(--border)] transition-transform duration-(--motion-fast) hover:scale-[1.02]"
            aria-label={`Image ${i + 1}: ${a.name}`}
          >
            <img src={a.url} alt={a.name} className="h-full w-auto max-w-[120px] object-cover" draggable={false} />
            <span className="absolute bottom-1 left-1 rounded-[3px] bg-black/55 px-1 text-[10px] font-medium text-white">{t('Image #{n}', { n: i + 1 })}</span>
            {onRemove ? (
              <span
                role="button"
                aria-label={t('Remove')}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(a.id);
                }}
                className="absolute right-1 top-1 inline-flex size-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/att:opacity-100"
              >
                <X size={10} />
              </span>
            ) : null}
          </button>
        ) : (
          <span
            key={a.id}
            className="inline-flex h-6 items-center gap-1.5 rounded-md bg-surface px-2 text-[11.5px] text-secondary shadow-[0_0_0_1px_var(--border)]"
          >
            {a.kind === 'folder' ? <Folder className="size-3 text-muted" /> : <FileText className="size-3 text-muted" />}
            <span className="max-w-[180px] truncate font-mono">{a.name}</span>
            {a.size ? <span className="text-muted">{formatBytes(a.size)}</span> : null}
            {onRemove ? (
              <button type="button" aria-label={t('Remove')} onClick={() => onRemove(a.id)} className="-mr-1 inline-flex size-4 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-primary">
                <X size={10} />
              </button>
            ) : null}
          </span>
        ),
      )}
    </div>
  );
}

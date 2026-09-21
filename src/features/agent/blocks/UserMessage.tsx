import { memo } from 'react';
import { Copy, RotateCcw } from 'lucide-react';
import type { UserMessageEvent } from '@/types/agent';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { toast } from '@/features/notifications/toast-store';
import { useUI } from '@/stores/ui';
import { Row } from './Row';
import { t } from '@/i18n';
import { copyText } from '@/lib/clipboard';

/**
 * User turn:
 *   ❯ ┌──────────────────────────────────────┐
 *     │ message in a quiet grey block         │
 *     │  └ [Image #1]                         │
 *     └──────────────────────────────────────┘
 */
export const UserMessage = memo(function UserMessage({ event, onResend }: { event: UserMessageEvent; onResend?: (text: string) => void }) {
  const openLightbox = useUI((s) => s.openLightbox);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <Row gutter={<span className="text-muted">❯</span>}>
            <div className="-mx-2 rounded-[8px] bg-surface-inset px-2 py-[2px] font-mono text-content leading-[1.6] text-primary">
              <div className="selectable whitespace-pre-wrap">{event.text}</div>
              {event.attachments?.length ? (
                <div className="mt-[2px] flex flex-col">
                  {event.attachments.map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => a.url && openLightbox({ url: a.url, name: a.name })}
                      className="group/att inline-flex w-fit items-center gap-2 rounded-[4px] pr-1 text-left text-secondary outline-none transition-colors hover:text-primary focus-visible:text-primary"
                    >
                      <span className="text-muted">{i === event.attachments!.length - 1 ? '└' : '├'}</span>
                      <span>{a.kind === 'image' ? `[Image #${i + 1}]` : `[${a.name}]`}</span>
                      {a.kind === 'image' && a.url ? (
                        <img src={a.url} alt="" className="h-[18px] w-[18px] rounded-[3px] object-cover opacity-70 shadow-[0_0_0_1px_var(--border)] transition-opacity group-hover/att:opacity-100" draggable={false} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Row>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          icon={<Copy />}
          onSelect={() => {
            void copyText(event.text);
            toast.neutral(t('Copied to clipboard'));
          }}
        >
          {t('Copy message')}
        </ContextMenuItem>
        {onResend ? (
          <ContextMenuItem icon={<RotateCcw />} onSelect={() => onResend(event.text)}>
            {t('Send again')}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});

import { memo } from 'react';
import { Copy } from 'lucide-react';
import type { AssistantMessageEvent } from '@/types/agent';
import { Markdown } from '../Markdown';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { toast } from '@/features/notifications/toast-store';
import { Row } from './Row';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/** ● assistant prose (monospace, blue inline code). A hairline caret blinks while streaming. */
export const AgentMessage = memo(function AgentMessage({ event }: { event: AssistantMessageEvent }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <Row gutter={<span className="text-primary">●</span>}>
            <div className={cn('selectable', event.streaming && 'streaming')}>
              <Markdown text={event.text || ' '} />
            </div>
          </Row>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          icon={<Copy />}
          onSelect={() => {
            void navigator.clipboard.writeText(event.text);
            toast.neutral(t('Copied to clipboard'));
          }}
        >
          {t('Copy as Markdown')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

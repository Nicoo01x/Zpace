import { useUI } from '@/stores/ui';
import { Sheet, SheetContent } from '@/components/ui/Sheet';
import { DiffPane } from './DiffPane';
import { basename } from '@/lib/format';
import { t } from '@/i18n';

/** Sheet-hosted diff viewer opened from file change rows. */
export function DiffViewer() {
  const diff = useUI((s) => s.diffViewer);
  const close = useUI((s) => s.closeDiff);
  return (
    <Sheet open={!!diff} onOpenChange={(o) => !o && close()}>
      <SheetContent width="min(920px, calc(100vw - 48px))" title={diff ? basename(diff.path) : t('Diff')} aria-describedby={undefined}>
        {diff ? <DiffPane path={diff.path} sessionId={diff.sessionId} root={diff.root} /> : null}
      </SheetContent>
    </Sheet>
  );
}

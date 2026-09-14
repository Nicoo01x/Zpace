import { useUI } from '@/stores/ui';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ZorynqTile } from '@/features/brand/ZorynqMark';
import { isTauri, platform } from '@/lib/platform';
import { t } from '@/i18n';
import { checkForUpdates } from '@/features/updater/updater';
import { AuthorCard, Contributors } from './AuthorCard';

export function AboutDialog() {
  const open = useUI((s) => s.aboutOpen);
  const setOpen = useUI((s) => s.setAboutOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <ZorynqTile size={40} className="shadow-[0_0_0_1px_var(--border)]" />
            <DialogTitle>Zpace</DialogTitle>
          </div>
          <DialogDescription>{t('A desktop workspace for Claude Code and other CLI agents.')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[12.5px]">
            <dt className="text-muted">{t('Version')}</dt>
            <dd className="tabular">0.1.0</dd>
            <dt className="text-muted">{t('Shell')}</dt>
            <dd>{isTauri ? 'Tauri 2' : t('Browser preview')}</dd>
            <dt className="text-muted">{t('Platform')}</dt>
            <dd className="capitalize">{platform}</dd>
            <dt className="text-muted">{t('Renderer')}</dt>
            <dd>React 19 · Vite · Tailwind 4</dd>
          </dl>
          <div className="mb-1.5 mt-4 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{t('Created by')}</div>
          <AuthorCard compact />
          <Contributors />
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => void checkForUpdates()}>
            {t('Check for updates')}
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

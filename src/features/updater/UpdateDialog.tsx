import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownToLine, ExternalLink, RotateCw, Sparkles } from 'lucide-react';
import { useUpdate } from './store';
import { relaunch } from './updater';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Markdown } from '@/features/agent/Markdown';
import { ZorynqTile } from '@/features/brand/ZorynqMark';
import { openUrl } from '@/native/system';
import { living } from '@/lib/motion';
import { currentLocale, t } from '@/i18n';

/**
 * "Zpace 1.2.0 is available": the new version against the one running, the
 * release's notes from GitHub, and three ways out — update now (download
 * with progress, then restart), later, or skip this version. The same
 * dialog carries the download and the "restart to finish" state, so the
 * flow never bounces between toasts.
 */
export function UpdateDialog() {
  const { offer, phase, progress, error, open, setOpen, skip, start } = useUpdate();
  if (!offer) return null;
  const date = offer.notes.date ? new Date(offer.notes.date).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const busy = phase === 'downloading';
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogContent size="lg" hideClose={busy} aria-describedby={undefined} className="max-h-[min(720px,calc(100vh-48px))]">
        <div className="flex items-start gap-4 px-6 pb-4 pt-6">
          <ZorynqTile size={52} className="shadow-[0_0_0_1px_var(--border)]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">
              <Sparkles className="size-[12px]" />
              {t('New version')}
            </div>
            <h2 className="mt-0.5 text-[19px] font-semibold leading-tight tracking-[-0.015em] text-primary">{t('Zpace {version} is available', { version: offer.version })}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-secondary">
              <span className="tabular">{t('You have {version}', { version: offer.currentVersion })}</span>
              {date ? (
                <>
                  <span className="text-muted">·</span>
                  <span>{date}</span>
                </>
              ) : null}
              {offer.notes.url ? (
                <>
                  <span className="text-muted">·</span>
                  <button type="button" onClick={() => void openUrl(offer.notes.url!)} className="inline-flex items-center gap-1 text-secondary transition-colors hover:text-primary">
                    {t('On GitHub')} <ExternalLink className="size-[11px]" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* the release notes, as the release wrote them */}
        <div className="mx-6 min-h-0 flex-1 overflow-y-auto rounded-lg bg-surface-inset px-4 py-3">
          {offer.notes.title && offer.notes.title !== `Zpace ${offer.version}` ? <div className="mb-1.5 text-[13.5px] font-semibold text-primary">{offer.notes.title}</div> : null}
          {offer.notes.body ? <Markdown text={offer.notes.body} className="prose-note selectable text-[12.5px]" /> : <div className="py-6 text-center text-[12.5px] text-muted">{t('No notes for this release.')}</div>}
        </div>

        {/* download, done, or failed */}
        <AnimatePresence initial={false} mode="popLayout">
          {phase === 'downloading' ? (
            <motion.div key="dl" initial={living.enter} animate={living.present} exit={living.exit} transition={living.transition} className="mx-6 mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[12px]">
                <span className="text-primary">{t('Downloading {version}…', { version: offer.version })}</span>
                <span className="tabular text-muted">{progress === null ? '' : `${Math.round(progress * 100)}%`}</span>
              </div>
              <Progress value={progress ?? 0.06} tone="accent" height={4} label={t('Download')} className={progress === null ? 'animate-pulse' : undefined} />
            </motion.div>
          ) : phase === 'installed' ? (
            <motion.div key="ok" initial={living.enter} animate={living.present} exit={living.exit} transition={living.transition} className="mx-6 mt-4 rounded-lg bg-success-soft px-3.5 py-2.5 text-[12.5px] text-success">
              {t('Installed. Restart Zpace to use it.')}
            </motion.div>
          ) : phase === 'error' ? (
            <motion.div key="err" initial={living.enter} animate={living.present} exit={living.exit} transition={living.transition} className="mx-6 mt-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">
              {t('Update failed')} · {error}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex items-center gap-2 px-6 pb-5 pt-4">
          {phase === 'installed' ? (
            <>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('Restart later')}
              </Button>
              <Button variant="primary" leading={<RotateCw />} onClick={() => void relaunch()}>
                {t('Restart now')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" disabled={busy} onClick={skip} className="text-secondary">
                {t('Skip this version')}
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                {t('Later')}
              </Button>
              <Button variant="primary" leading={<ArrowDownToLine />} loading={busy} onClick={() => void start()}>
                {phase === 'error' ? t('Try again') : t('Update now')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

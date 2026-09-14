import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useSettings } from '@/stores/settings';
import { useSessions } from '@/stores/sessions';
import { useTerminals } from '@/stores/terminals';
import { isTauri } from '@/lib/platform';
import { t } from '@/i18n';

/**
 * Intercepts the window close request when agents are still running (or
 * terminals are attached) and the "confirm before closing" setting is on.
 */
export function ConfirmCloseDialog() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | undefined;
    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      un = await getCurrentWindow().onCloseRequested((event) => {
        // Close to the tray: the window hides, everything keeps running; the tray icon brings it back.
        if (useSettings.getState().closeToTray) {
          event.preventDefault();
          void getCurrentWindow().hide();
          return;
        }
        if (!useSettings.getState().confirmOnClose) return;
        const running = Object.values(useSessions.getState().sessions).filter((s) => s.status === 'running' || s.status === 'waiting').length;
        const terminals = useTerminals.getState().tabs.filter((t) => t.ptyId).length;
        if (running === 0 && terminals === 0) return;
        event.preventDefault();
        setSummary(
          [running ? `${running} agent${running === 1 ? '' : 's'} still working` : '', terminals ? `${terminals} terminal${terminals === 1 ? '' : 's'} open` : '']
            .filter(Boolean)
            .join(' · '),
        );
        setOpen(true);
      });
    })();
    return () => un?.();
  }, []);

  const quit = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    // Destroy skips the close-requested hook.
    await getCurrentWindow().destroy();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="sm" hideClose>
        <DialogHeader>
          <DialogTitle>{t('Quit Zpace?')}</DialogTitle>
          <DialogDescription>{summary}. {t('Running processes will be terminated.')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button size="sm" variant="ghost" autoFocus onClick={() => setOpen(false)}>
            {t('Keep working')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void quit()}>
            {t('Quit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

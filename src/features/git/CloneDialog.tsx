import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { useUI } from '@/stores/ui';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { TextInput } from '@/components/ui/TextInput';
import { Button } from '@/components/ui/Button';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { pickFolder } from '@/native/system';
import { basename } from '@/lib/format';
import { isTauri } from '@/lib/platform';
import { t } from '@/i18n';

export function CloneDialog() {
  const open = useUI((s) => s.cloneOpen);
  const setOpen = useUI((s) => s.setCloneOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md">{open ? <CloneForm onDone={() => setOpen(false)} /> : null}</DialogContent>
    </Dialog>
  );
}

function CloneForm({ onDone }: { onDone: () => void }) {
  const { cloneRepository, newSession } = useWorkspaceActions();
  const [url, setUrl] = useState('');
  const [dest, setDest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = basename(url.replace(/\.git$/, '').replace(/\/+$/, ''));
  const valid = /^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/.test(url.trim()) && dest.trim().length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await cloneRepository(url.trim(), dest.trim());
      newSession(p.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('Clone repository')}</DialogTitle>
        <DialogDescription>{t('Runs')} <code className="font-mono text-[12px]">git clone</code> {t('locally and adds the folder as a project.')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3 pb-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-secondary">{t('Repository URL')}</span>
          <TextInput autoFocus mono value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/user/repo.git" spellCheck={false} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-secondary">{t('Clone into')}</span>
          <div className="flex gap-2">
            <TextInput mono value={dest} onChange={(e) => setDest(e.target.value)} placeholder={isTauri ? t('Choose a parent folder') : 'C:\\Users\\you\\projects'} className="flex-1" />
            <Button
              leading={<FolderOpen />}
              onClick={() => void pickFolder('Clone into folder').then((p) => p && setDest(p))}
            >
              {t('Browse')}
            </Button>
          </div>
          {name && dest ? (
            <span className="font-mono text-[11.5px] text-muted">
              → {dest.replace(/[\\/]+$/, '')}
              {dest.includes('\\') ? '\\' : '/'}
              {name}
            </span>
          ) : null}
        </label>
        {error ? <div className="rounded-md bg-danger-soft px-3 py-2 font-mono text-[12px] text-danger">{error}</div> : null}
        {!isTauri ? <div className="text-[12px] text-muted">{t('Cloning runs in the desktop app.')}</div> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" type="button" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button variant="primary" size="sm" type="submit" loading={busy} disabled={!valid || !isTauri}>
          {t('Clone')}
        </Button>
      </DialogFooter>
    </form>
  );
}

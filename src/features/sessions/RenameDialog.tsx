import { useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { TextInput } from '@/components/ui/TextInput';
import { Button } from '@/components/ui/Button';
import { t } from '@/i18n';

export function RenameDialog({ open, onOpenChange, value, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; value: string; onSubmit: (v: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" hideClose aria-describedby={undefined}>
        {open ? <RenameForm value={value} onCancel={() => onOpenChange(false)} onSubmit={(v) => { onSubmit(v); onOpenChange(false); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ value, onCancel, onSubmit }: { value: string; onCancel: () => void; onSubmit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const submit = () => {
    const v = draft.trim();
    if (v) onSubmit(v);
    else onCancel();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('Rename session')}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <TextInput autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.target.select()} aria-label={t('Session title')} />
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button size="sm" variant="primary" type="submit">
          {t('Rename')}
        </Button>
      </DialogFooter>
    </form>
  );
}

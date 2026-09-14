import { useState } from 'react';
import { usePrompt, type PromptRequest } from '@/stores/prompt';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './Dialog';
import { TextInput } from './TextInput';
import { Button } from './Button';
import { t } from '@/i18n';

export function PromptDialog() {
  const current = usePrompt((s) => s.current);
  const close = usePrompt((s) => s.close);
  return (
    <Dialog open={!!current} onOpenChange={(o) => !o && close(null)}>
      <DialogContent size="sm">{current ? <Form key={current.title} req={current} onClose={close} /> : null}</DialogContent>
    </Dialog>
  );
}

function Form({ req, onClose }: { req: PromptRequest; onClose: (v: string | null) => void }) {
  const [value, setValue] = useState(req.initial ?? '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() || req.allowEmpty) onClose(value.trim());
      }}
    >
      <DialogHeader>
        <DialogTitle>{req.title}</DialogTitle>
        {req.description ? <DialogDescription>{req.description}</DialogDescription> : null}
      </DialogHeader>
      <DialogBody>
        <TextInput autoFocus value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" type="button" onClick={() => onClose(null)}>
          {t('Cancel')}
        </Button>
        <Button size="sm" type="submit" disabled={!value.trim() && !req.allowEmpty}>
          {req.confirm ?? t('OK')}
        </Button>
      </DialogFooter>
    </form>
  );
}

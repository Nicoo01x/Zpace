import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { MODELS } from '@/stores/settings';
import { setSessionModel } from './session-model';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { TextInput } from '@/components/ui/TextInput';
import { Button } from '@/components/ui/Button';
import type { Session } from '@/types/workspace';

export function ModelPicker({ session, children }: { session: Session; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const known = MODELS.some((m) => m.id === session.model);
  const pick = (id: string) => {
    setSessionModel(session, id);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={6} className="w-[280px] p-1.5">
        <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">{t('Model')}</div>
        {MODELS.map((m) => {
          const active = m.id === session.model;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              className={cn('flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] transition-colors hover:bg-surface-hover', active ? 'text-primary' : 'text-secondary')}
            >
              <span className="inline-flex w-3.5 justify-center">{active ? <Check className="size-3.5 text-accent" /> : null}</span>
              <span className="flex-1 truncate">{m.label}</span>
              <span className="text-[11px] text-muted">{m.hint}</span>
            </button>
          );
        })}
        <form
          className="mt-1 flex items-center gap-1.5 px-1 pb-0.5 pt-1.5 hairline-t"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) pick(custom);
          }}
        >
          <TextInput size="sm" mono value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={known ? t('Other model id…') : session.model} spellCheck={false} className="min-w-0 flex-1" onKeyDown={(e) => e.stopPropagation()} />
          <Button size="xs" variant="subtle" type="submit" disabled={!custom.trim()}>
            {t('Use')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

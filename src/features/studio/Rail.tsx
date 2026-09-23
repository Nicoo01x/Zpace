import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { motion } from 'motion/react';
import { ChevronsUpDown, MessageSquare, Plus, RefreshCw, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { springs } from '@/lib/motion';
import { useStudio, STUDIO_KINDS, type StudioKind } from '@/stores/studio';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { useCapabilities } from '@/stores/capabilities';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { IconButton } from '@/components/ui/IconButton';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { TextInput } from '@/components/ui/TextInput';
import { Tooltip } from '@/components/ui/Tooltip';
import { LivingItem, LivingList } from '@/components/ui/Living';
import { MacFolder } from '@/components/ui/MacFolder';
import { Bloub } from '@/features/mascot/Bloub';
import { useMascotColor, usePaper } from '@/features/mascot/useMascot';
import { itemsOf, type Catalog, type StudioItem } from './catalog';
import { KIND_ICON, KIND_LABEL } from './kinds';
import type { ResolvedScope } from './scope';

/**
 * The rail: whose Claude this is (the user's, with the mascot, or a
 * project's, with its folder), the kinds with what each holds, and the
 * things of the chosen kind as flat rows. On the canvas, like the sidebar.
 */
/** Kinds that take a blank draft from the "+" button (memory files are created from their own rows). */
const CREATABLE = new Set<StudioKind>(['skills', 'agents', 'commands', 'mcp', 'hooks']);

export function Rail({ scope, catalog }: { scope: ResolvedScope | null; catalog: Catalog }) {
  const kind = useStudio((s) => s.kind);
  const selected = useStudio((s) => s.selected);
  const draft = useStudio((s) => s.draft);
  const go = useStudio((s) => s.go);
  const setOpen = useStudio((s) => s.setOpen);
  const chatOpen = useStudio((s) => s.chatOpen);
  const setChatOpen = useStudio((s) => s.setChatOpen);
  const bump = useStudio((s) => s.bump);
  const [q, setQ] = useState('');
  const items = itemsOf(catalog, kind);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => (needle ? items.filter((i) => i.name.toLowerCase().includes(needle) || i.hint.toLowerCase().includes(needle)) : items), [items, needle]);
  const Icon = KIND_ICON[kind];

  // The chosen row stays in view — a save lands on a new file that may be far down the list.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, kind]);

  const reload = () => {
    void useCapabilities.getState().loadAssets(scope?.kind === 'project' ? scope.project?.path : undefined, true);
    bump();
  };

  return (
    <aside className="flex w-[clamp(236px,19vw,272px)] shrink-0 flex-col pl-(--card-gap)" aria-label={t('Studio')}>
      <div className="flex items-center gap-1 pb-2 pr-1">
        <ScopePicker scope={scope} />
        <IconButton label={chatOpen ? t('Hide the chat') : t('Show the chat')} size="sm" active={chatOpen} onClick={() => setChatOpen(!chatOpen)}>
          <MessageSquare />
        </IconButton>
        <Tooltip content={t('Leave the Studio')} shortcut="esc" side="bottom">
          <IconButton label={t('Leave the Studio')} tooltip={false} size="sm" onClick={() => setOpen(false)}>
            <X />
          </IconButton>
        </Tooltip>
      </div>

      {/* the kinds */}
      <nav className="flex flex-col gap-px" aria-label={t('Kinds')}>
        {STUDIO_KINDS.map((k) => {
          const I = KIND_ICON[k];
          const n = k === 'overview' ? null : catalog[k].filter((i) => !i.missing).length;
          const active = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => go(k)}
              aria-current={active ? 'page' : undefined}
              className={cn('relative flex h-8 items-center gap-2.5 rounded-lg pl-2.5 pr-2 text-left text-ui transition-colors duration-(--motion-fast)', active ? 'text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary')}
            >
              {active ? <motion.span layoutId="studio-kind" transition={springs.layout} className="absolute inset-0 rounded-lg bg-surface-active" /> : null}
              <I className={cn('relative size-[15px] shrink-0', active && k !== 'overview' && 'text-[var(--claude)]')} />
              <span className={cn('relative min-w-0 flex-1 truncate', active && 'font-medium')}>{KIND_LABEL[k]()}</span>
              {n !== null ? <span className={cn('relative text-[11.5px] tabular', active ? 'text-secondary' : 'text-muted')}>{n}</span> : null}
            </button>
          );
        })}
      </nav>

      {/* the things of that kind */}
      {kind !== 'overview' ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className="flex h-7 items-center gap-1 pl-2.5 pr-1">
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{KIND_LABEL[kind]()}</span>
            <IconButton label={t('Reload')} size="xs" onClick={reload}>
              <RefreshCw className={cn(catalog.loading && 'animate-spin')} />
            </IconButton>
            {CREATABLE.has(kind) && scope ? (
              <IconButton label={t('New')} size="xs" active={draft} onClick={() => go(kind, null, true)}>
                <Plus />
              </IconButton>
            ) : null}
          </div>
          {items.length > 8 ? (
            <div className="px-1 pb-1.5">
              <TextInput size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Filter')} leading={<Search />} aria-label={t('Filter')} className="bg-surface-inset shadow-none focus-within:shadow-[0_0_0_3px_var(--accent-soft)]" />
            </div>
          ) : null}
          <ScrollArea ref={listRef} className="min-h-0 flex-1 pr-1">
            {shown.length === 0 && !catalog.loading ? (
              <div className="px-2.5 py-3 text-[12px] text-muted">
                {needle ? (
                  t('Nothing matches.')
                ) : (
                  <>
                    {t('Nothing here yet.')}{' '}
                    {CREATABLE.has(kind) && scope ? (
                      <button type="button" onClick={() => go(kind, null, true)} className="text-primary underline-offset-2 hover:underline">
                        {t('Create one.')}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <LivingList>
                {shown.map((it) => (
                  <LivingItem key={it.id} still>
                    <ItemRow item={it} icon={Icon} active={!draft && selected === it.id} onClick={() => go(kind, it.id)} />
                  </LivingItem>
                ))}
              </LivingList>
            )}
          </ScrollArea>
        </div>
      ) : (
        <div className="flex-1" />
      )}
    </aside>
  );
}

function ItemRow({ item, icon: Icon, active, onClick }: { item: StudioItem; icon: ComponentType<{ className?: string }>; active: boolean; onClick: () => void }) {
  const mono = item.kind === 'agents' || item.kind === 'commands' || item.kind === 'mcp';
  return (
    <button type="button" onClick={onClick} title={item.hint} data-active={active ? '' : undefined} className={cn('flex h-11 w-full items-center gap-2.5 rounded-lg pl-2.5 pr-2 text-left transition-colors duration-(--motion-fast)', active ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary')}>
      <Icon className={cn('size-[14px] shrink-0', item.missing && 'opacity-40')} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className={cn('truncate text-ui', mono && 'font-mono text-[12.5px]', active && 'font-medium', item.missing && 'text-muted')}>{item.name}</span>
        <span className={cn('truncate text-[11px] text-muted', item.kind === 'hooks' && 'font-mono')}>{item.missing ? t('Not created yet') : item.hint}</span>
      </span>
      {item.sourceLabel ? <span className="shrink-0 rounded-[4px] bg-surface-active px-1 text-[10px] text-muted">{item.sourceLabel}</span> : null}
    </button>
  );
}

/** Whose Claude: the user's own, or one of the projects. */
function ScopePicker({ scope }: { scope: ResolvedScope | null }) {
  const projects = useProjects((s) => s.projects);
  const setScope = useStudio((s) => s.setScope);
  const mascot = useSettings((s) => s.mascot);
  const color = useMascotColor();
  const paper = usePaper();
  const isUser = !scope || scope.kind === 'user';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] pl-1.5 pr-2 text-left transition-colors duration-(--motion-fast) hover:bg-surface-hover data-[state=open]:bg-surface-active">
          <span className="inline-flex size-9 shrink-0 items-center justify-center">
            {isUser ? <Bloub size={34} shape={mascot.shape} color={color} expression="heureux" paper={paper} state="idle" follow={false} /> : <MacFolder size={22} color={scope?.project?.color || undefined} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-primary">{scope?.label ?? t('Your Claude')}</span>
            <span className="truncate font-mono text-[10.5px] text-muted">{scope ? shortPath(scope.root) : '~/.claude'}</span>
          </span>
          <ChevronsUpDown className="size-[13px] shrink-0 text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[256px]">
        <DropdownMenuItem icon={<Bloub size={16} shape={mascot.shape} color={color} expression="heureux" paper={paper} state="idle" follow={false} frozenAt={0} />} onSelect={() => setScope({ kind: 'user' })}>
          {t('Your Claude')}
        </DropdownMenuItem>
        {projects.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('Projects')}</DropdownMenuLabel>
            {projects.map((p) => (
              <DropdownMenuItem key={p.id} icon={<MacFolder size={14} color={p.color || undefined} />} onSelect={() => setScope({ kind: 'project', projectId: p.id })}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** `C:\Users\me\.claude` → `~\.claude`; a project's `.claude` shows the last two segments. */
function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  const home = parts.findIndex((x, i) => i > 0 && /^users?$/i.test(parts[i - 1]) && x);
  if (home > 0) return `~/${parts.slice(home + 1).join('/')}`;
  return parts.slice(-2).join('/');
}

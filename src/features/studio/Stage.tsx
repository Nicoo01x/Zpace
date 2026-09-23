import { useEffect } from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { springs } from '@/lib/motion';
import { useShallow } from 'zustand/react/shallow';
import { useStudio, type StudioKind } from '@/stores/studio';
import { useSettings } from '@/stores/settings';
import { useSessions } from '@/stores/sessions';
import { formatRelative } from '@/lib/format';
import type { FileWriteEvent } from '@/types/agent';
import { Button } from '@/components/ui/Button';
import { LivingSwitch } from '@/components/ui/Living';
import { Bloub } from '@/features/mascot/Bloub';
import { useMascotColor, usePaper } from '@/features/mascot/useMascot';
import { MacFolder } from '@/components/ui/MacFolder';
import { itemsOf, type Catalog, type StudioItem } from './catalog';
import { KIND_ICON, KIND_LABEL } from './kinds';
import { CountUp } from './CountUp';
import { askBuilder } from './builder';
import { AgentEditor, CommandEditor, MemoryEditor, SkillEditor } from './editors';
import { McpEditor } from './McpEditor';
import { HooksEditor } from './HooksEditor';
import { Empty } from './parts';
import type { ResolvedScope } from './scope';

/**
 * The stage: the overview of the scope (its portrait and what it holds),
 * a kind's landing when nothing is picked, or the editor of the thing on
 * it. Content swaps with the living switch; every editor is keyed by what
 * it edits so a change of selection is a fresh read.
 */
export function Stage({ scope, catalog }: { scope: ResolvedScope | null; catalog: Catalog }) {
  const kind = useStudio((s) => s.kind);
  const selected = useStudio((s) => s.selected);
  const draft = useStudio((s) => s.draft);
  const key = `${scope?.key ?? ''}:${kind}:${draft ? 'draft' : (selected ?? '')}`;
  return (
    <LivingSwitch k={key} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {scope ? <Body scope={scope} catalog={catalog} kind={kind} selected={selected} draft={draft} /> : <Empty>{t('This project is gone.')}</Empty>}
    </LivingSwitch>
  );
}

function Body({ scope, catalog, kind, selected, draft }: { scope: ResolvedScope; catalog: Catalog; kind: StudioKind; selected: string | null; draft: boolean }) {
  if (kind === 'overview') return <Overview scope={scope} catalog={catalog} />;
  const items = itemsOf(catalog, kind);
  const item = selected ? items.find((i) => i.id === selected) : undefined;
  if (!draft && !item) {
    // The selection may be a file the catalog has not listed yet (just created): give the scan a moment before saying it is gone.
    if (selected && catalog.loading) return null;
    return <KindHome scope={scope} kind={kind} items={items} stale={!!selected} loading={catalog.loading} />;
  }
  const id = draft ? null : (item?.id ?? null);
  switch (kind) {
    case 'skills':
      return <SkillEditor scope={scope} id={id} locked={item?.locked} />;
    case 'agents':
      return <AgentEditor scope={scope} id={id} locked={item?.locked} />;
    case 'commands':
      return <CommandEditor scope={scope} id={id} locked={item?.locked} />;
    case 'memory':
      return item ? <MemoryEditor scope={scope} path={item.id} label={item.name} /> : null;
    case 'mcp':
      return <McpEditor scope={scope} id={id} locked={item?.locked} />;
    case 'hooks':
      return <HooksEditor scope={scope} id={id} />;
    default:
      return null;
  }
}

/** The kinds that start from a blank draft; memory files are created from their rows. */
const STARTER: Partial<Record<StudioKind, () => string>> = {
  skills: () => t('Make me a skill for '),
  agents: () => t('Create a subagent that '),
  commands: () => t('Write a slash command that '),
  memory: () => t('Write the memory file for this scope: '),
  mcp: () => t('Add the MCP server for '),
  hooks: () => t('Add a hook that '),
};

function KindHome({ scope, kind, items, stale, loading }: { scope: ResolvedScope; kind: StudioKind; items: StudioItem[]; stale: boolean; loading: boolean }) {
  const go = useStudio((s) => s.go);
  const Icon = KIND_ICON[kind];
  const creatable = kind !== 'memory';
  // A kind with things in it opens on its first one: the stage always shows something real.
  const first = !loading && !stale ? items[0]?.id : undefined;
  useEffect(() => {
    if (first) go(kind, first);
  }, [first, kind, go]);
  if (first) return null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-7 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-full bg-surface-inset text-secondary">
        <Icon className="size-7" />
      </span>
      <div>
        <div className="text-[22px] font-semibold tracking-[-0.01em] text-primary">
          {KIND_LABEL[kind]()} <span className="text-muted">{items.length}</span>
        </div>
        <div className="mt-1 text-[13px] text-secondary">{stale ? t('That one is gone; pick another on the left.') : items.length ? t('Pick one on the left, or start a new one.') : t('Nothing here yet.')}</div>
      </div>
      <div className="flex items-center gap-2">
        {creatable ? (
          <Button size="lg" variant="primary" className="rounded-full px-5" leading={<Plus className="size-[15px]" />} onClick={() => go(kind, null, true)}>
            {t('New')}
          </Button>
        ) : null}
        <Button size="lg" variant="subtle" className="rounded-full px-5" leading={<MessageSquare className="size-[15px]" />} onClick={() => askBuilder(scope, STARTER[kind]?.() ?? '')}>
          {t('Ask Claude')}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- overview ------------------------------ */

const TILES: Array<Exclude<StudioKind, 'overview'>> = ['skills', 'agents', 'commands', 'memory', 'mcp', 'hooks'];

function Overview({ scope, catalog }: { scope: ResolvedScope; catalog: Catalog }) {
  const go = useStudio((s) => s.go);
  const mascot = useSettings((s) => s.mascot);
  const color = useMascotColor();
  const paper = usePaper();
  const all = TILES.flatMap((k) => catalog[k].filter((i) => !i.missing));
  const total = all.length;
  const fromPlugins = all.filter((i) => i.source === 'plugin').length;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-8 pt-8">
      {/* the portrait */}
      <div className="flex items-center gap-6">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springs.pop} className="shrink-0">
          {scope.kind === 'user' ? <Bloub size={96} shape={mascot.shape} color={color} expression="heureux" paper={paper} state="idle" follow /> : <MacFolder size={84} color={scope.project?.color || undefined} open />}
        </motion.div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{scope.kind === 'user' ? t('Everywhere') : t('This project')}</div>
          <h1 className="mt-1 truncate text-[30px] font-semibold leading-none tracking-[-0.02em] text-primary">{scope.label}</h1>
          <div className="mt-2 flex items-baseline gap-2 text-[13px] text-secondary">
            <span className="font-mono text-[12px] text-muted">{scope.root}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-secondary">
            <span>{total === 0 ? t('Nothing built yet — start with a skill, or ask Claude.') : total === 1 ? t('One thing makes up this Claude.') : t('{n} things make up this Claude.', { n: total })}</span>
            {total > 0 ? (
              <span className="inline-flex items-center gap-3 text-[12px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-[7px] rounded-full bg-accent" /> {t('{n} of your own', { n: total - fromPlugins })}
                </span>
                {fromPlugins ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-[7px] rounded-full bg-accent-warm" /> {t('{n} from plugins', { n: fromPlugins })}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* what it holds */}
      <div className="mt-7 grid auto-rows-min grid-cols-3 gap-3">
        {TILES.map((k, i) => {
          const Icon = KIND_ICON[k];
          const list = catalog[k].filter((it) => !it.missing);
          return (
            <motion.button
              key={k}
              type="button"
              onClick={() => go(k)}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...springs.pop, delay: 0.08 + i * 0.05 }}
              className="group flex h-[164px] flex-col rounded-[12px] bg-surface-inset px-4 pb-4 pt-4 text-left press hover:bg-surface-hover"
            >
              <div className="flex items-center gap-2 text-[12.5px] text-secondary">
                <Icon className="size-[15px] text-[var(--claude)]" />
                <span>{KIND_LABEL[k]()}</span>
              </div>
              <CountUp value={list.length} className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] text-primary" />
              <Dots items={list} />
            </motion.button>
          );
        })}
      </div>

      <RecentlyBuilt scope={scope} />
    </div>
  );
}

const SLASH = /\\/g;

/** Which kind a path the builder wrote belongs to, so a row of the recent list opens it on the stage. */
function kindOfPath(path: string): StudioKind | null {
  const p = path.replace(SLASH, '/');
  if (/\/skills\/[^/]+\/SKILL\.md$/i.test(p)) return 'skills';
  if (/\/agents\/[^/]+\.md$/i.test(p)) return 'agents';
  if (/\/commands\/[^/]+\.md$/i.test(p)) return 'commands';
  if (/CLAUDE(\.local)?\.md$/i.test(p)) return 'memory';
  return null;
}

/** What the builder wrote lately — its file writes, newest first — so the overview also tells what changed. */
function RecentlyBuilt({ scope }: { scope: ResolvedScope }) {
  const builderId = useStudio((s) => s.builders[scope.key]);
  const writes = useSessions(
    useShallow((s) => {
      // The store's own event objects (stable references), so the shallow compare holds between renders.
      const seen = new Set<string>();
      const out: FileWriteEvent[] = [];
      for (const e of [...(builderId ? (s.events[builderId] ?? []) : [])].reverse()) {
        if (e.type !== 'file_write' || seen.has(e.path)) continue;
        seen.add(e.path);
        out.push(e);
        if (out.length === 8) break;
      }
      return out;
    }),
  );
  const root = scope.root.replace(SLASH, '/') + '/';
  const base = scope.base.replace(SLASH, '/') + '/';
  return (
    <div className="mt-7">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{t('Recently built')}</div>
      {writes.length === 0 ? (
        <div className="text-[12.5px] text-muted">{t('What the builder writes shows up here.')}</div>
      ) : (
        <div className="flex flex-col">
          {writes.map((w) => {
            const kind = kindOfPath(w.path);
            const rel = w.path.replace(SLASH, '/').replace(root, '').replace(base, '');
            return (
              <button key={w.path} type="button" disabled={!kind} onClick={() => kind && useStudio.getState().go(kind, w.path)} className="flex h-8 items-center gap-3 rounded-lg px-2.5 text-left transition-colors duration-(--motion-fast) enabled:hover:bg-surface-hover">
                <span className={cn('size-[7px] shrink-0 rounded-full', w.kind === 'A' ? 'bg-success' : 'bg-accent')} />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-primary">{rel}</span>
                <span className="shrink-0 text-[11.5px] text-muted">{formatRelative(w.timestamp)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The collection as a field of dots — one per thing, coloured by where it comes from — so the tile shows the shape of it, not a sentence. */
function Dots({ items }: { items: StudioItem[] }) {
  const shown = items.slice(0, 120);
  // Fewer things, bigger dots: a handful reads as a handful, a hundred as a field.
  const size = items.length <= 8 ? 14 : items.length <= 30 ? 10 : 7;
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-wrap content-start items-center gap-[4px] overflow-hidden">
      {shown.map((it, i) => (
        <motion.span key={it.id} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...springs.pop, delay: 0.2 + i * 0.006 }} style={{ width: size, height: size }} className={cn('rounded-full', it.source === 'plugin' ? 'bg-accent-warm' : it.source === 'local' ? 'bg-muted' : 'bg-accent')} />
      ))}
      {items.length > shown.length ? <span className="ml-1 text-[11px] tabular text-muted">+{items.length - shown.length}</span> : null}
      {items.length === 0 ? <span className="text-[11px] text-muted">{t('none')}</span> : null}
    </div>
  );
}

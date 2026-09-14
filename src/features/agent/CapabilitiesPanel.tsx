import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Wrench, Plug, Sparkles, Terminal, Bot, Puzzle, Search, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { springs } from '@/lib/motion';
import { fuzzyFilter } from '@/lib/fuzzy';
import { useCapabilities, NO_ASSETS, BUILTIN_COMMANDS, type AssetInfo } from '@/stores/capabilities';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip } from '@/components/ui/Tooltip';
import { insertIntoComposer } from './composer-drafts';

/**
 * What this session can do — tools and MCP servers as the CLI reported them,
 * skills, custom commands, plugins and subagents found on disk. Pick a command
 * or skill to drop it into the composer. Lives in the session footer.
 */
type Tab = 'commands' | 'skills' | 'agents' | 'tools' | 'mcp';

export function CapabilitiesChip({ sessionId, projectPath, onInsert }: { sessionId: string; projectPath?: string; onInsert?: (text: string) => void }) {
  const caps = useCapabilities((c) => c.bySession[sessionId]);
  const assets = useCapabilities((c) => c.assets[projectPath ?? '']?.data ?? NO_ASSETS);
  const loadAssets = useCapabilities((c) => c.loadAssets);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('commands');
  const [q, setQ] = useState('');

  const counts = {
    commands: assets.commands.length + (caps?.slashCommands.length ?? 0),
    skills: assets.skills.filter((s) => s.userInvocable).length,
    agents: assets.agents.length + (caps?.agents.filter((a) => !assets.agents.some((x) => x.name === a)).length ?? 0),
    tools: caps?.tools.length ?? 0,
    mcp: caps?.mcpServers.length ?? 0,
  };
  const total = counts.skills + counts.commands + counts.agents;

  const rows = useMemo(() => {
    const list: Array<{ id: string; label: string; hint: string; icon: typeof Wrench; insert?: string; status?: string }> = [];
    const addAsset = (a: AssetInfo, icon: typeof Wrench, insert?: string) => list.push({ id: a.path, label: a.invoke, hint: a.description || a.source, icon: a.source.startsWith('plugin:') ? Puzzle : icon, insert });
    if (tab === 'commands') {
      for (const c of assets.commands) addAsset(c, Terminal, c.invoke + ' ');
      for (const name of caps?.slashCommands ?? []) {
        const bare = name.replace(/^\//, '');
        if (assets.commands.some((c) => c.invoke === `/${bare}`)) continue;
        list.push({ id: `cli:${bare}`, label: `/${bare}`, hint: BUILTIN_COMMANDS[bare] ?? 'Claude Code', icon: bare.includes(':') ? Puzzle : Terminal, insert: `/${bare} ` });
      }
    } else if (tab === 'skills') {
      for (const s of assets.skills) if (s.userInvocable) addAsset(s, Sparkles, s.invoke + ' ');
    } else if (tab === 'agents') {
      for (const a of assets.agents) addAsset(a, Bot, `Use the ${a.name} subagent to `);
      for (const name of caps?.agents ?? []) if (!assets.agents.some((x) => x.name === name)) list.push({ id: `agent:${name}`, label: name, hint: 'Subagent', icon: Bot, insert: `Use the ${name} subagent to ` });
    } else if (tab === 'tools') {
      for (const name of caps?.tools ?? []) list.push({ id: `tool:${name}`, label: name, hint: name.startsWith('mcp__') ? 'MCP tool' : 'Built-in tool', icon: name.startsWith('mcp__') ? Plug : Wrench });
    } else {
      for (const m of caps?.mcpServers ?? []) list.push({ id: `mcp:${m.name}`, label: m.name, hint: m.status, icon: Plug, status: m.status });
    }
    return q.trim() ? fuzzyFilter(q.trim(), list, (r) => [r.label, r.hint], 80).map((r) => r.item) : list;
  }, [tab, q, assets, caps]);

  const tabs: Array<{ id: Tab; label: string; n: number }> = [
    { id: 'commands', label: t('Commands'), n: counts.commands },
    { id: 'skills', label: t('Skills'), n: counts.skills },
    { id: 'agents', label: t('Agents'), n: counts.agents },
    { id: 'tools', label: t('Tools'), n: counts.tools },
    { id: 'mcp', label: 'MCP', n: counts.mcp },
  ];

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void loadAssets(projectPath, true);
      }}
    >
      <Tooltip content={t('Skills, commands, agents, tools and MCP servers of this session')} side="top">
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-[4px] outline-none transition-colors duration-(--motion-fast) hover:text-primary data-[state=open]:text-primary">
            <Sparkles className="size-[12px] text-muted" strokeWidth={1.75} />
            <span className="tabular">
              {total} {t('skills & commands')}
              {caps ? ` · ${counts.tools} ${t('tools')}` : ''}
              {counts.mcp ? ` · ${counts.mcp} MCP` : ''}
            </span>
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-[520px] p-0 font-sans">
        <div className="flex items-center gap-1 px-2 pt-2">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={cn('relative h-7 rounded-md px-2.5 text-[12px] outline-none transition-colors', tab === x.id ? 'text-primary' : 'text-secondary hover:text-primary')}
            >
              {tab === x.id ? <motion.span layoutId="caps-tab" transition={springs.layout} className="absolute inset-0 -z-10 rounded-md bg-surface-active" /> : null}
              {x.label} <span className="ml-1 tabular text-muted">{x.n}</span>
            </button>
          ))}
        </div>
        <div className="mx-2 mt-2 flex h-7 items-center gap-2 rounded-md bg-surface-inset px-2">
          <Search className="size-[12px] text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Filter…')} className="min-w-0 flex-1 bg-transparent text-[12px] text-primary outline-none placeholder:text-muted" />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <div className="px-2 py-6 text-center text-[12px] text-muted">
              {tab === 'tools' || tab === 'mcp' ? t('Reported by Claude after the first turn of the session.') : t('Nothing here yet.')}
            </div>
          ) : (
            rows.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={!r.insert}
                  onClick={() => {
                    if (!r.insert) return;
                    setOpen(false);
                    if (onInsert) onInsert(r.insert);
                    else insertIntoComposer(sessionId, r.insert);
                  }}
                  className={cn('group/row flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left', r.insert ? 'hover:bg-surface-hover' : 'cursor-default')}
                >
                  <Icon className="size-[13px] shrink-0 text-muted" />
                  <span className="shrink-0 font-mono text-[12.5px] text-primary">{r.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{r.hint}</span>
                  {r.status ? <span className={cn('size-1.5 shrink-0 rounded-full', r.status === 'connected' ? 'bg-success' : r.status === 'failed' ? 'bg-danger' : 'bg-warning')} /> : null}
                  {r.insert ? <ChevronRight className="size-[12px] shrink-0 text-muted opacity-0 group-hover/row:opacity-100" /> : null}
                </button>
              );
            })
          )}
        </div>
        {caps ? (
          <div className="flex items-center gap-3 px-3 py-2 text-[11px] text-muted hairline-t">
            {caps.version ? <span>Claude Code {caps.version}</span> : null}
            {caps.model ? <span className="truncate">{caps.model}</span> : null}
            {caps.outputStyle ? <span>{caps.outputStyle}</span> : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

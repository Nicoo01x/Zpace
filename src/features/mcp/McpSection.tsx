import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Plug, RefreshCw, Trash2, Plus, Globe, Terminal, ExternalLink } from 'lucide-react';
import { useProjects } from '@/stores/projects';
import { useSessions } from '@/stores/sessions';
import { useUI } from '@/stores/ui';
import { useCapabilities } from '@/stores/capabilities';
import { readTextFile, writeTextFile, pathExists, openUrl } from '@/native/system';
import { loadMcpEntries, transport, type McpConfig, type McpEntry as Entry } from './mcp-config';
import { isTauri } from '@/lib/platform';
import { Button } from '@/components/ui/Button';
import { LivingBox, LivingField, LivingItem, LivingReveal } from '@/components/ui/Living';
import { TextInput } from '@/components/ui/TextInput';
import { Select } from '@/components/ui/Select';
import { MacFolder } from '@/components/ui/MacFolder';
import { toast } from '@/features/notifications/toast-store';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/**
 * Settings › MCP servers: what Claude Code will load — the user's servers
 * (`~/.claude.json`), the project's (`.mcp.json`) and the ones set for this
 * project locally — with the live status and tool count the running
 * session reports. Project servers can be added and removed here (the file
 * is rewritten); the others are Claude Code's own (`claude mcp …`).
 */
export function McpSection() {
  const projects = useProjects((s) => s.projects);
  const activeProjectId = useUI((s) => s.activeProjectId);
  const [projectId, setProjectId] = useState(activeProjectId ?? projects[0]?.id ?? '');
  const project = projects.find((p) => p.id === projectId);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  // Live: the newest session of the project that reported its init.
  const live = useCapabilities(
    useShallow((c) => {
      const sessions = Object.values(useSessions.getState().sessions).filter((s) => s.projectId === projectId);
      const caps = sessions.map((s) => c.bySession[s.id]).filter(Boolean).sort((a, b) => b.receivedAt - a.receivedAt)[0];
      return caps ? { servers: caps.mcpServers, tools: caps.tools } : null;
    }),
  );

  const load = useCallback(async () => {
    if (!isTauri) return;
    setLoading(true);
    try {
      setEntries(await loadMcpEntries(project?.path));
    } finally {
      setLoading(false);
    }
  }, [project]);
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const toolsOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const tool of live?.tools ?? []) {
      const m = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(tool);
      if (m) map.set(m[1], (map.get(m[1]) ?? 0) + 1);
    }
    return map;
  }, [live]);
  const statusOf = (name: string) => live?.servers.find((s) => s.name === name)?.status;

  const removeProjectServer = async (name: string) => {
    if (!project) return;
    const file = `${project.path.replace(/[\\/]+$/, '')}\\.mcp.json`;
    try {
      const cfg = JSON.parse(await readTextFile(file)) as { mcpServers?: Record<string, McpConfig> };
      delete cfg.mcpServers?.[name];
      await writeTextFile(file, JSON.stringify(cfg, null, 2) + '\n');
      toast.success(t('MCP server removed'), { description: name, mark: 'note' });
      void load();
    } catch (e) {
      toast.error(t('Could not update .mcp.json'), { description: String(e) });
    }
  };

  const groups: Array<{ scope: Entry['scope']; title: string; hint: string }> = [
    { scope: 'project', title: t('Project'), hint: project ? `${project.path}\\.mcp.json` : '' },
    { scope: 'local', title: t('This project, locally'), hint: t('~/.claude.json › projects') },
    { scope: 'user', title: t('User'), hint: t('~/.claude.json') },
  ];

  return (
    <LivingBox clip={false} className="flex flex-col gap-4">
      <LivingItem still className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-primary">{t('MCP servers')}</div>
          <div className="mt-0.5 text-[12px] text-secondary">{t('What Claude Code loads for this project, with the status and tools the running session reports.')}</div>
        </div>
        <Select size="sm" value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <Button size="sm" variant="ghost" onClick={() => void load()} aria-label={t('Reload')}>
          <RefreshCw className={cn('size-[13px]', loading && 'animate-spin')} />
        </Button>
        <Button size="sm" onClick={() => setAdding(true)} disabled={!project}>
          <Plus className="size-[13px]" /> {t('Add to project')}
        </Button>
      </LivingItem>
      <LivingReveal open={!!(adding && project)}>{project ? <AddForm projectPath={project.path} onDone={() => { setAdding(false); void load(); }} /> : null}</LivingReveal>
      {!live ? <LivingItem still className="rounded-lg bg-surface-inset px-3 py-2 text-[12px] text-muted">{t('Status and tools show once a chat session of this project has started.')}</LivingItem> : null}
      {groups.map((g) => {
        const list = entries.filter((e) => e.scope === g.scope);
        return (
          <LivingItem still key={g.scope}>
            <div className="mb-1.5 flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
              {g.scope === 'project' && project ? <MacFolder color={project.color || undefined} size={12} /> : null}
              {g.title}
              <span className="truncate font-mono normal-case tracking-normal opacity-70">{g.hint}</span>
            </div>
            {list.length === 0 ? (
              <div className="px-1 text-[12px] text-muted">{t('None.')}</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {list.map((e) => {
                  const tr = transport(e.config);
                  const status = statusOf(e.name);
                  const tools = toolsOf.get(e.name);
                  return (
                    <div key={`${e.scope}:${e.name}`} className="flex items-center gap-3 rounded-lg px-3 py-2 shadow-[0_0_0_1px_var(--border)]">
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-inset text-secondary">{tr.kind === 'http' ? <Globe className="size-[14px]" /> : <Terminal className="size-[14px]" />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[13px]">
                          <span className="font-medium text-primary">{e.name}</span>
                          {status ? (
                            <span className={cn('inline-flex items-center gap-1 text-[11px]', status === 'connected' ? 'text-success' : status === 'failed' ? 'text-danger' : 'text-muted')}>
                              <span className="size-1.5 rounded-full bg-current" /> {status}
                            </span>
                          ) : null}
                          {tools ? <span className="text-[11px] text-muted">{t('{n} tools', { n: tools })}</span> : null}
                        </div>
                        <div className="truncate font-mono text-[11.5px] text-secondary">{tr.label}</div>
                      </div>
                      {e.config.url ? (
                        <Button size="sm" variant="ghost" onClick={() => void openUrl(e.config.url!)} aria-label={t('Open')}>
                          <ExternalLink className="size-[13px]" />
                        </Button>
                      ) : null}
                      {e.scope === 'project' ? (
                        <Button size="sm" variant="ghost" onClick={() => void removeProjectServer(e.name)} aria-label={t('Remove')}>
                          <Trash2 className="size-[13px] text-danger" />
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </LivingItem>
        );
      })}
      <LivingItem still className="flex items-start gap-2 rounded-lg bg-surface-inset px-3 py-2 text-[11.5px] leading-relaxed text-muted">
        <Plug className="mt-0.5 size-[13px] shrink-0" />
        <span>
          {t('Servers that need a login (OAuth) open it in your system browser — that flow belongs to Claude Code itself. User and local servers are managed with `claude mcp add / remove` in a terminal.')
            .split('`')
            .map((part, i) => (i % 2 ? <code key={i} className="font-mono text-[11px]">{part}</code> : <span key={i}>{part}</span>))}
        </span>
      </LivingItem>
    </LivingBox>
  );
}

function AddForm({ projectPath, onDone }: { projectPath: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'stdio' | 'http'>('stdio');
  const [command, setCommand] = useState('npx -y @modelcontextprotocol/server-filesystem .');
  const [url, setUrl] = useState('https://');
  const valid = name.trim() && (kind === 'stdio' ? command.trim() : /^https?:\/\//.test(url));
  const save = async () => {
    if (!valid) return;
    const file = `${projectPath.replace(/[\\/]+$/, '')}\\.mcp.json`;
    let cfg: { mcpServers?: Record<string, McpConfig> } = {};
    if (await pathExists(file)) {
      try {
        cfg = JSON.parse(await readTextFile(file));
      } catch {
        cfg = {};
      }
    }
    cfg.mcpServers ??= {};
    if (kind === 'stdio') {
      const [cmd, ...args] = command.trim().split(/\s+/);
      cfg.mcpServers[name.trim()] = { command: cmd, args };
    } else {
      cfg.mcpServers[name.trim()] = { type: 'http', url: url.trim() };
    }
    try {
      await writeTextFile(file, JSON.stringify(cfg, null, 2) + '\n');
      toast.success(t('MCP server added'), { description: t('Restart the session so Claude Code loads it.'), mark: 'note' });
      onDone();
    } catch (e) {
      toast.error(t('Could not update .mcp.json'), { description: String(e) });
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="grid gap-3 rounded-lg bg-surface-inset p-3 sm:grid-cols-[160px_130px_1fr_auto]"
    >
      <LivingField index={0} className="flex flex-col gap-1">
        <label className="contents">
        <span className="text-[11.5px] text-secondary">{t('Name')}</span>
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="filesystem" spellCheck={false} />
        </label>
      </LivingField>
      <LivingField index={1} className="flex flex-col gap-1">
        <label className="contents">
        <span className="text-[11.5px] text-secondary">{t('Transport')}</span>
        <Select size="sm" value={kind} onChange={setKind} options={[{ value: 'stdio', label: 'stdio' }, { value: 'http', label: 'http' }]} />
        </label>
      </LivingField>
      <LivingField index={2} className="flex flex-col gap-1">
        <label className="contents">
        <span className="text-[11.5px] text-secondary">{kind === 'stdio' ? t('Command') : 'URL'}</span>
        {kind === 'stdio' ? <TextInput value={command} onChange={(e) => setCommand(e.target.value)} spellCheck={false} className="font-mono" /> : <TextInput value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} className="font-mono" />}
        </label>
      </LivingField>
      <LivingField index={3} className="flex items-end gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button size="sm" type="submit" disabled={!valid}>
          {t('Add')}
        </Button>
      </LivingField>
    </form>
  );
}

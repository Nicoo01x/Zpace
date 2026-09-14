import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, MessageSquare, Trash2, Plus, X, Image as ImageIcon, FileText, File as FileIcon, Link2, FolderOpen } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { useAgents, EMPTY_AGENT, type AgentDraft, type AgentFile, type Effort, type PermissionMode } from '@/stores/agents';
import { useProjects } from '@/stores/projects';
import { useSettings, MODELS } from '@/stores/settings';
import { useUI } from '@/stores/ui';
import { useEnvironment } from '@/stores/environment';
import { useCapabilities, type AssetInfo } from '@/stores/capabilities';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LivingBox, LivingItem, LivingList, LivingReveal } from '@/components/ui/Living';
import { PERMISSION_MODES } from '@/features/agent/permissionMode';
import { AGENT_LABEL } from '@/features/agent/agents';
import { loadMcpEntries, transport, type McpEntry } from '@/features/mcp/mcp-config';
import { SHAPES, COLORS } from '@/features/mascot/bloub/skins';
import { EXPRESSIONS } from '@/features/mascot/bloub/expressions';
import { SHAPE_LABEL, EXPR_LABEL } from '@/features/mascot/labels';
import { pickFiles, revealInFileManager, trashPath, fileSrc } from '@/native/system';
import { toast } from '@/features/notifications/toast-store';
import { useAgentEditor } from './editor';
import { chatWithAgent, importAgentFiles } from './room-runtime';
import { exportAgentAsSubagent } from './subagents';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { AgentAvatar } from './AgentAvatar';

/**
 * The agent editor, in four tabs: who it is (name, its creature, the engine),
 * how it works (instructions, rules, links), what it knows (background
 * notes, its library of photos and documents) and what it carries (skills,
 * MCP servers, tool patterns). Saving is enough; "Save and chat" opens its
 * own session to try it.
 */
export function AgentEditorDialog() {
  const target = useAgentEditor((s) => s.target);
  const close = useAgentEditor((s) => s.close);
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && close()}>
      <DialogContent size="lg">{target ? <AgentForm key={target.agentId ?? 'new'} agentId={target.agentId} onDone={close} /> : null}</DialogContent>
    </Dialog>
  );
}

type Tab = 'who' | 'how' | 'library' | 'tools';
const NO_SKILLS: AssetInfo[] = [];
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function AgentForm({ agentId, onDone }: { agentId?: string; onDone: () => void }) {
  const existing = useAgents((s) => (agentId ? s.agents[agentId] : undefined));
  const count = useAgents((s) => Object.keys(s.agents).length);
  const defaultModel = useSettings((s) => s.claude.defaultModel || 'opus');
  const report = useEnvironment((s) => s.report);
  const projects = useProjects((s) => s.projects);
  const activeProjectId = useUI((s) => s.activeProjectId);
  const project = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  // A new agent gets the next colour and shape in the row, so a team does not come out all alike.
  const [draft, setDraft] = useState<AgentDraft>(() => (existing ? { ...EMPTY_AGENT, ...existing } : { ...EMPTY_AGENT, model: defaultModel, color: COLORS[(count + 7) % COLORS.length].hex, shape: SHAPES[count % SHAPES.length].id }));
  const [tab, setTab] = useState<Tab>('who');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [custom, setCustom] = useState(draft.color);
  const patch = (p: Partial<AgentDraft>) => setDraft((d) => ({ ...d, ...p }));

  // What it can carry: the skills on this machine and in the project, and Claude Code's MCP servers.
  const loadAssets = useCapabilities((s) => s.loadAssets);
  const skills = useCapabilities(useShallow((s) => s.assets[project?.path ?? '']?.data.skills ?? NO_SKILLS));
  const [servers, setServers] = useState<McpEntry[]>([]);
  useEffect(() => {
    void loadAssets(project?.path);
    let alive = true;
    void loadMcpEntries(project?.path).then((e) => alive && setServers(e));
    return () => {
      alive = false;
    };
  }, [loadAssets, project?.path]);
  const skillsSorted = useMemo(() => [...skills].sort((a, b) => a.invoke.localeCompare(b.invoke)), [skills]);

  const engines = useMemo(() => {
    const found = (k: 'claude' | 'codex' | 'gemini' | 'opencode') => !!report?.[k]?.found;
    return [
      { value: 'claude', label: AGENT_LABEL.claude, hint: found('claude') ? (report?.claude.version ?? t('installed')) : t('not found') },
      ...(['codex', 'gemini', 'opencode'] as const).map((k) => ({ value: k, label: AGENT_LABEL[k], hint: found(k) ? t('terminal only') : t('not found'), disabled: true })),
    ];
  }, [report]);

  // The library lives in the agent's folder, so files need an id: a new agent is created on first import.
  const [id, setId] = useState<string | undefined>(existing?.id);
  const valid = draft.name.trim().length > 0;
  const save = (): string | undefined => {
    if (!valid) return undefined;
    const clean: AgentDraft = { ...draft, name: draft.name.trim() };
    if (id) {
      useAgents.getState().updateAgent(id, clean);
      return id;
    }
    const created = useAgents.getState().addAgent(clean).id;
    setId(created);
    return created;
  };
  const submit = () => {
    if (save()) onDone();
  };
  const tryIt = async () => {
    const saved = save();
    if (!saved) return;
    onDone();
    await chatWithAgent(saved, project?.id);
  };
  const remove = () => {
    if (!id) return;
    useAgents.getState().removeAgent(id);
    onDone();
  };
  const toggle = (key: 'skills' | 'mcp', v: string) => patch({ [key]: draft[key].includes(v) ? draft[key].filter((x) => x !== v) : [...draft[key], v] } as Partial<AgentDraft>);
  const addLink = () => {
    const v = linkDraft.trim();
    if (!v) return;
    patch({ links: [...draft.links, v] });
    setLinkDraft('');
  };
  const addFiles = async (images: boolean) => {
    if (!draft.name.trim()) {
      toast.info(t('Name the agent first'), { description: t('Its library lives in a folder of its own.') });
      return;
    }
    const picked = await pickFiles({ images });
    if (!picked.length) return;
    const saved = id ?? save();
    if (!saved) return;
    try {
      const added = await importAgentFiles(saved, picked);
      patch({ files: [...draft.files, ...added] });
    } catch (e) {
      toast.error(t('Could not copy the files'), { description: String(e) });
    }
  };
  const exportSub = async (scope: 'user' | 'project') => {
    const saved = save();
    if (!saved) return;
    const agent = useAgents.getState().agents[saved];
    if (!agent) return;
    try {
      const target = await exportAgentAsSubagent(agent, scope, project?.path);
      toast.success(t('Subagent saved'), { description: target });
    } catch (e) {
      toast.error(t('Could not save the subagent'), { description: String(e) });
    }
  };
  const removeFile = async (f: AgentFile) => {
    patch({ files: draft.files.filter((x) => x.path !== f.path) });
    await trashPath(f.path).catch(() => undefined);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex min-h-0 flex-col"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Bot className="size-4 text-accent" />
          {existing ? t('Edit agent') : t('New agent')}
        </DialogTitle>
        <DialogDescription>{t('A persona on top of Claude Code: its name, its instructions, the skills it should use and the servers it may load. Chat with it alone, or put it in a room with others.')}</DialogDescription>
      </DialogHeader>
      <div className="px-5 pt-1">
        <SegmentedControl<Tab>
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'who', label: t('Identity') },
            { value: 'how', label: t('Instructions') },
            { value: 'library', label: t('Library') },
            { value: 'tools', label: t('Tools') },
          ]}
          aria-label={t('Section')}
        />
      </div>
      <DialogBody className="flex min-h-[380px] flex-col gap-4 pb-3 pt-3">
        {tab === 'who' ? (
          <>
            <div className="flex items-start gap-5">
              <div className="flex shrink-0 flex-col items-center gap-2 pt-1">
                <AgentAvatar agent={{ shape: draft.shape, color: draft.color, expression: draft.expression, name: draft.name || t('Agent') }} size={96} live />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11.5px] text-secondary">{t('Name')}</span>
                  <TextInput autoFocus value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder={t('e.g. Reviewer, Dev senior, Redactor')} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11.5px] text-secondary">{t('Expression')}</span>
                    <Select size="sm" value={draft.expression} onChange={(v) => patch({ expression: v })} options={EXPRESSIONS.map((e) => ({ value: e.id, label: t(EXPR_LABEL[e.id] ?? e.id) }))} align="start" className="w-full" />
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11.5px] text-secondary">{t('Colour')}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {COLORS.map((c) => {
                        const on = draft.color.toLowerCase() === c.hex.toLowerCase();
                        return (
                          <button key={c.id} type="button" role="radio" aria-checked={on} aria-label={c.id} onClick={() => { patch({ color: c.hex }); setCustom(c.hex); }} className={cn('inline-flex size-5 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] press', on && 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)]')} style={{ background: c.hex }}>
                            {on ? <Check className="size-3" style={{ color: c.id === 'creme' ? '#333' : '#fff' }} strokeWidth={3} /> : null}
                          </button>
                        );
                      })}
                      <label className="relative inline-flex size-5 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--border-strong)]" title={t('Custom colour')}>
                        <span className="size-3 rounded-full" style={{ background: 'conic-gradient(#e8483f, #f0b429, #3ecf8e, #3b93f0, #8b5cf6, #e8483f)' }} />
                        <input type="color" aria-label={t('Custom colour')} value={/^#[0-9a-f]{6}$/i.test(custom) ? custom : '#000000'} onChange={(e) => { setCustom(e.target.value); patch({ color: e.target.value }); }} className="absolute inset-0 cursor-pointer opacity-0" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11.5px] text-secondary">{t('Shape')}</span>
              <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label={t('Shape')}>
                {SHAPES.map((sh) => {
                  const on = draft.shape === sh.id;
                  return (
                    <button key={sh.id} type="button" role="radio" aria-checked={on} onClick={() => patch({ shape: sh.id })} title={t(SHAPE_LABEL[sh.id] ?? sh.id)} className={cn('flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 press', on ? 'bg-surface-active shadow-[inset_0_0_0_1px_var(--border-strong)]' : 'hover:bg-surface-hover')}>
                      <AgentAvatar agent={{ shape: sh.id, color: draft.color, expression: draft.expression, name: t(SHAPE_LABEL[sh.id] ?? sh.id) }} size={36} />
                      <span className="text-[10.5px] text-secondary">{t(SHAPE_LABEL[sh.id] ?? sh.id)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] text-secondary">{t('Engine')}</span>
                <Select size="sm" value="claude" onChange={() => undefined} options={engines} align="start" className="w-full" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] text-secondary">{t('Model')}</span>
                <Select size="sm" value={draft.model} onChange={(v) => patch({ model: v })} options={MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.hint }))} align="start" className="w-full" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] text-secondary">{t('Permissions')}</span>
                <Select<PermissionMode | 'inherit'> size="sm" value={draft.permissionMode ?? 'inherit'} onChange={(v) => patch({ permissionMode: v === 'inherit' ? undefined : v })} options={[{ value: 'inherit', label: t('Same as the app') }, ...PERMISSION_MODES.map((m) => ({ value: m.id, label: t(m.label), hint: t(m.hint) }))]} align="start" className="w-full" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] text-secondary">{t('Effort')}</span>
                <Select<Effort | 'inherit'> size="sm" value={draft.effort ?? 'inherit'} onChange={(v) => patch({ effort: v === 'inherit' ? undefined : v })} options={[{ value: 'inherit', label: t('Same as the app') }, ...EFFORTS.map((e) => ({ value: e, label: e }))]} align="start" className="w-full" />
              </label>
            </div>
          </>
        ) : null}

        {tab === 'how' ? (
          <>
            <Field label={t('Instructions')} hint={t('What it is, how it works, what it should never do. This is the heart of the agent.')}>
              <Textarea value={draft.instructions} onChange={(e) => patch({ instructions: e.target.value })} minRows={5} maxRows={12} placeholder={t('"You review pull requests: security first, then correctness, then style. Short, concrete, with file:line references."')} className="rounded-md bg-surface-inset px-3 py-2 text-[12.5px] leading-[1.6]" />
            </Field>
            <Field label={t('Rules')} hint={t('One per line. Hard rules it must always follow — "8px grid only", "never touch the database schema".')}>
              <Textarea value={draft.rules} onChange={(e) => patch({ rules: e.target.value })} minRows={3} maxRows={10} placeholder={t('Use the brand palette only · Every screen needs a loading and an empty state · Ask before deleting anything')} className="rounded-md bg-surface-inset px-3 py-2 font-mono text-[12px] leading-[1.6]" />
            </Field>
            <Field label={t('Links')} hint={t('Docs, Figma files, tickets — it knows they exist and can fetch them when it has web access.')}>
              <LivingList className="flex flex-col gap-1">
                {draft.links.map((l) => (
                  <LivingItem key={l} className="flex items-center gap-2 rounded-md bg-surface-inset px-2 py-1 text-[12px]">
                    <Link2 className="size-[12px] shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate font-mono text-secondary">{l}</span>
                    <button type="button" aria-label={t('Remove')} onClick={() => patch({ links: draft.links.filter((x) => x !== l) })} className="inline-flex size-5 items-center justify-center rounded text-muted press hover:bg-surface-active hover:text-primary">
                      <X className="size-3" />
                    </button>
                  </LivingItem>
                ))}
              </LivingList>
              <div className="flex items-center gap-2">
                <TextInput size="sm" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="https://…" mono onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} className="min-w-0 flex-1" />
                <Button size="sm" type="button" onClick={addLink} disabled={!linkDraft.trim()} leading={<Plus />}>
                  {t('Add')}
                </Button>
              </div>
            </Field>
          </>
        ) : null}

        {tab === 'library' ? (
          <>
            <Field label={t('Background')} hint={t('What it should know by heart: a brand guide, a glossary, the team’s conventions, a product summary. Goes into its prompt as is.')}>
              <Textarea value={draft.knowledge} onChange={(e) => patch({ knowledge: e.target.value })} minRows={5} maxRows={14} placeholder={t('Paste it here — headings and lists help.')} className="rounded-md bg-surface-inset px-3 py-2 text-[12.5px] leading-[1.6]" />
            </Field>
            <Field label={t('Photos and documents')} hint={t('Copied into the agent’s own folder; it can open them with its file tools — reference photos, mockups, PDFs, specs.')}>
              {draft.files.length ? (
                <LivingList className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {draft.files.map((f) => (
                    <LivingItem key={f.path}>
                      <FileCard file={f} onRemove={() => void removeFile(f)} />
                    </LivingItem>
                  ))}
                </LivingList>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" type="button" onClick={() => void addFiles(true)} leading={<ImageIcon />}>
                  {t('Add photos')}
                </Button>
                <Button size="sm" type="button" onClick={() => void addFiles(false)} leading={<FileText />}>
                  {t('Add documents')}
                </Button>
                {draft.files[0] ? (
                  <Button size="sm" variant="ghost" type="button" onClick={() => void revealInFileManager(draft.files[0].path)} leading={<FolderOpen />}>
                    {t('Open folder')}
                  </Button>
                ) : null}
              </div>
            </Field>
          </>
        ) : null}

        {tab === 'tools' ? (
          <>
            <Picker
              title={t('Skills')}
              hint={skillsSorted.length ? t('The ones it should reach for when they apply.') : t('No skills found on this machine or in {project}.', { project: project?.name ?? t('the project') })}
              items={skillsSorted.map((s: AssetInfo) => ({ id: s.invoke, label: s.invoke, hint: s.description, tag: s.source.startsWith('plugin:') ? s.source.slice(7) : s.source }))}
              selected={draft.skills}
              onToggle={(v) => toggle('skills', v)}
            />
            <Picker
              title={t('MCP servers')}
              hint={servers.length ? t('Only the ones ticked are loaded for this agent; none ticked = whatever Claude Code loads by default.') : t('No MCP servers configured for Claude Code yet (Settings › MCP).')}
              items={servers.map((s) => ({ id: s.name, label: s.name, hint: transport(s.config).label, tag: s.scope }))}
              selected={draft.mcp}
              onToggle={(v) => toggle('mcp', v)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Allowed tools')} hint={t('Tool patterns it may use without asking, one per line — Read, Edit, Bash(npm test:*).')}>
                <Textarea value={draft.allowedTools} onChange={(e) => patch({ allowedTools: e.target.value })} minRows={3} maxRows={6} placeholder={'Read\nEdit\nBash(npm test:*)'} className="rounded-md bg-surface-inset px-3 py-2 font-mono text-[12px] leading-[1.6]" />
              </Field>
              <Field label={t('Blocked tools')} hint={t('Tool patterns it can never use, one per line.')}>
                <Textarea value={draft.disallowedTools} onChange={(e) => patch({ disallowedTools: e.target.value })} minRows={3} maxRows={6} placeholder={'Bash(rm:*)\nWebFetch'} className="rounded-md bg-surface-inset px-3 py-2 font-mono text-[12px] leading-[1.6]" />
              </Field>
            </div>
            <Field label={t('Claude Code')} hint={t('Writes it as a subagent file (~/.claude/agents or the project’s .claude/agents) so any Claude Code session can delegate to it.')}>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" type="button" leading={<ClaudeLogo size={13} />} disabled={!valid} onClick={() => void exportSub('user')}>
                  {t('Export as user subagent')}
                </Button>
                <Button size="sm" type="button" leading={<ClaudeLogo size={13} />} disabled={!valid || !project} onClick={() => void exportSub('project')}>
                  {project ? t('Export into {project}', { project: project.name }) : t('Export into the project')}
                </Button>
              </div>
            </Field>
          </>
        ) : null}

        {existing ? (
          <LivingBox clip={false} className="mt-auto flex flex-col gap-2">
            <LivingItem still className="flex items-center gap-2">
              <button type="button" onClick={() => setConfirmDelete((v) => !v)} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted press hover:bg-surface-hover hover:text-danger">
                <Trash2 className="size-[13px]" /> {t('Delete agent')}
              </button>
            </LivingItem>
            <LivingReveal open={confirmDelete}>
              <div className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
                <span className="min-w-0 flex-1">{t('Its rooms keep going without it; its chats stay as sessions.')}</span>
                <Button size="xs" variant="danger" type="button" onClick={remove}>
                  {t('Delete')}
                </Button>
              </div>
            </LivingReveal>
          </LivingBox>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" type="button" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button size="sm" type="button" disabled={!valid} leading={<MessageSquare />} onClick={() => void tryIt()}>
          {t('Save and chat')}
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={!valid}>
          {existing ? t('Save') : t('Create agent')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[11px] leading-relaxed text-muted">{hint}</span> : null}
    </div>
  );
}

/** One file of the library: a thumbnail for photos, an icon for the rest. */
function FileCard({ file, onRemove }: { file: AgentFile; onRemove: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (file.kind !== 'image') return;
    let alive = true;
    void fileSrc(file.path).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [file.kind, file.path]);
  return (
    <div className="group/file relative flex items-center gap-2 overflow-hidden rounded-md bg-surface-inset p-1.5 pr-7">
      <span className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-surface text-muted shadow-[0_0_0_1px_var(--border)]">
        {src ? <img src={src} alt="" className="size-full object-cover" draggable={false} /> : file.kind === 'text' ? <FileText className="size-4" /> : file.kind === 'image' ? <ImageIcon className="size-4" /> : <FileIcon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-primary">{file.name}</span>
        {file.size ? <span className="block text-[10.5px] text-muted">{formatBytes(file.size)}</span> : null}
      </span>
      <button type="button" aria-label={t('Remove')} onClick={onRemove} className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded text-muted opacity-0 press hover:bg-surface-active hover:text-primary group-hover/file:opacity-100">
        <X className="size-3" />
      </button>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** A list of things to tick: skills, servers. */
function Picker({ title, hint, items, selected, onToggle }: { title: string; hint: string; items: Array<{ id: string; label: string; hint?: string; tag?: string }>; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] text-secondary">{title}</span>
        {selected.length ? <span className="text-[11px] text-muted">{t('{n} selected', { n: selected.length })}</span> : null}
      </div>
      {items.length ? (
        <LivingList className="flex max-h-[168px] flex-col gap-0.5 overflow-y-auto rounded-md bg-surface-inset p-1">
          {items.map((it) => {
            const on = selected.includes(it.id);
            return (
              <LivingItem key={it.id} still>
                <button type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(it.id)} className={cn('flex w-full items-center gap-2 rounded-[5px] px-2 py-1 text-left text-[12px] press', on ? 'bg-surface text-primary shadow-[0_0_0_1px_var(--border)]' : 'text-secondary hover:bg-surface-hover hover:text-primary')}>
                  <span className={cn('inline-flex size-3.5 shrink-0 items-center justify-center rounded-[4px]', on ? 'bg-accent text-white' : 'shadow-[inset_0_0_0_1px_var(--border-strong)]')}>{on ? <Check className="size-2.5" strokeWidth={3} /> : null}</span>
                  <span className="shrink-0 font-mono text-[11.5px]">{it.label}</span>
                  {it.hint ? <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{it.hint}</span> : <span className="flex-1" />}
                  {it.tag ? <span className="shrink-0 rounded-[4px] bg-surface-active px-1 text-[10px] text-muted">{it.tag}</span> : null}
                </button>
              </LivingItem>
            );
          })}
        </LivingList>
      ) : null}
      <span className="text-[11px] leading-relaxed text-muted">{hint}</span>
    </div>
  );
}

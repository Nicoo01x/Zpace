import { useCallback, useEffect, useState } from 'react';
import { Globe, Terminal } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { useStudio } from '@/stores/studio';
import { useSessions } from '@/stores/sessions';
import { useCapabilities } from '@/stores/capabilities';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LivingSwitch } from '@/components/ui/Living';
import { loadMcpEntries } from '@/features/mcp/mcp-config';
import { toast } from '@/features/notifications/toast-store';
import { BLANK_MCP, deleteMcp, mcpConfigOf, mcpDocOf, writeMcp, type McpDoc } from './files';
import { DeleteInline, Field, FieldBox, PendingBar, SaveButton, StageHeader, TitleInput } from './parts';
import { useUnsavedGuard } from './guard';
import type { ResolvedScope } from './scope';

/**
 * One MCP server: a name, how Claude Code reaches it — a command with its
 * arguments and environment, or a URL with headers — written to the user's
 * `~/.claude.json` or the project's `.mcp.json`. Servers set for a project
 * locally (Claude Code's own `claude mcp add` in local scope) are shown
 * read-only.
 */
const same = (d: McpDoc) => `${d.name.trim()}|${JSON.stringify(mcpConfigOf(d))}`;

export function McpEditor({ scope, id, locked }: { scope: ResolvedScope; id: string | null; locked?: boolean }) {
  // Live: the newest session of the scope that reported its servers (any session, for the user's Claude).
  const live = useCapabilities(
    useShallow((c) => {
      const sessions = Object.values(useSessions.getState().sessions).filter((s) => scope.kind === 'user' || s.projectId === scope.project?.id);
      const caps = sessions.map((s) => c.bySession[s.id]).filter(Boolean).sort((a, b) => b.receivedAt - a.receivedAt)[0];
      return caps ?? null;
    }),
  );
  const [doc, setDoc] = useState<McpDoc | null>(id ? null : BLANK_MCP);
  const [saved, setSaved] = useState<McpDoc | null>(id ? null : BLANK_MCP);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void loadMcpEntries(scope.project?.path)
      .then((entries) => {
        const e = entries.find((x) => x.name === id && (scope.kind === 'user' ? x.scope === 'user' : x.scope !== 'user'));
        if (!alive) return;
        if (!e) {
          setError(t('This server is gone.'));
          return;
        }
        const d = mcpDocOf(e.name, e.config);
        setDoc(d);
        setSaved(d);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [id, scope]);
  const dirty = !!doc && !!saved && same(doc) !== same(saved);
  useUnsavedGuard(dirty);
  const patch = (p: Partial<McpDoc>) => setDoc((d) => (d ? { ...d, ...p } : d));
  const valid = !!doc && /^[\w.-]+$/.test(doc.name.trim()) && (doc.transport === 'http' ? doc.url.trim().length > 0 : doc.command.trim().length > 0) && !locked;

  const save = useCallback(async (): Promise<boolean> => {
    if (!doc || !valid) return false;
    setBusy(true);
    try {
      await writeMcp(scope, doc);
      const next = { ...doc, id: doc.name.trim(), name: doc.name.trim() };
      setDoc(next);
      setSaved(next);
      const studio = useStudio.getState();
      studio.bump();
      studio.setDirty(false);
      if (studio.selected !== next.id || studio.draft) studio.go('mcp', next.id);
      return true;
    } catch (e) {
      toast.error(t('Could not save the server'), { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [doc, valid, scope]);
  useEffect(() => {
    if (!dirty) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, dirty]);

  const remove = async () => {
    if (!doc?.id) return;
    try {
      await deleteMcp(scope, doc.id);
      useStudio.getState().setDirty(false);
      useStudio.getState().go('mcp');
      useStudio.getState().bump();
    } catch (e) {
      toast.error(t('Could not remove the server'), { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (error) return <div className="px-7 py-6 text-[12.5px] text-danger">{error}</div>;
  if (!doc) return null;
  const file = scope.kind === 'user' ? '~/.claude.json' : '.mcp.json';
  const status = live?.mcpServers.find((x) => x.name === doc.id)?.status;
  const tools = live ? live.tools.filter((x) => x.startsWith(`mcp__${doc.id}__`)).length : 0;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PendingBar onSave={save} busy={busy} />
      <StageHeader
        kicker={
          <>
            <span>{t('MCP server')}</span>
            <span className="text-muted/60">·</span>
            <span className="normal-case tracking-normal">{locked ? t('set locally by Claude Code, read-only') : file}</span>
          </>
        }
        title={
          <div className="flex items-center gap-3">
            <TitleInput value={doc.name} onChange={(v) => patch({ name: v })} placeholder="github" mono readOnly={locked} autoFocus={!id} />
            {status ? (
              <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-[12px]', status === 'connected' ? 'text-success' : status === 'failed' ? 'text-danger' : 'text-muted')}>
                <span className="size-1.5 rounded-full bg-current" /> {status}
                {tools ? <span className="text-muted">· {t('{n} tools', { n: tools })}</span> : null}
              </span>
            ) : null}
          </div>
        }
        actions={!locked ? <SaveButton dirty={dirty && valid} busy={busy} onSave={save} label={id ? undefined : t('Add server')} /> : null}
      />
      <FieldBox>
        <div className="flex items-center gap-3">
          <SegmentedControl<'stdio' | 'http'> size="sm" value={doc.transport} onChange={(v) => patch({ transport: v })} options={[{ value: 'stdio', label: t('Command'), icon: <Terminal /> }, { value: 'http', label: 'HTTP', icon: <Globe /> }]} aria-label={t('Transport')} />
        </div>
        <LivingSwitch k={doc.transport} className="grid gap-3">
          {doc.transport === 'stdio' ? (
            <>
              <Field label={t('Command')}>
                <TextInput value={doc.command} onChange={(e) => patch({ command: e.target.value })} placeholder="npx" mono disabled={locked} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('Arguments, one per line')}>
                  <Textarea value={doc.args} onChange={(e) => patch({ args: e.target.value })} minRows={3} maxRows={8} placeholder={'-y\n@modelcontextprotocol/server-github'} readOnly={locked} spellCheck={false} className="rounded-md bg-surface px-3 py-2 font-mono text-[12px] leading-[1.6] shadow-[inset_0_0_0_1px_var(--border)]" />
                </Field>
                <Field label={t('Environment, KEY=value per line')}>
                  <Textarea value={doc.env} onChange={(e) => patch({ env: e.target.value })} minRows={3} maxRows={8} placeholder="GITHUB_TOKEN=…" readOnly={locked} spellCheck={false} className="rounded-md bg-surface px-3 py-2 font-mono text-[12px] leading-[1.6] shadow-[inset_0_0_0_1px_var(--border)]" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="URL">
                <TextInput value={doc.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://mcp.example.com/mcp" mono disabled={locked} />
              </Field>
              <Field label={t('Headers, Name: value per line')}>
                <Textarea value={doc.headers} onChange={(e) => patch({ headers: e.target.value })} minRows={3} maxRows={8} placeholder="Authorization: Bearer …" readOnly={locked} spellCheck={false} className="rounded-md bg-surface px-3 py-2 font-mono text-[12px] leading-[1.6] shadow-[inset_0_0_0_1px_var(--border)]" />
              </Field>
            </>
          )}
        </LivingSwitch>
      </FieldBox>
      {id && !locked ? <DeleteInline onDelete={() => void remove()} what={t('Removed from {file}; nothing is uninstalled.', { file })} /> : null}
    </div>
  );
}

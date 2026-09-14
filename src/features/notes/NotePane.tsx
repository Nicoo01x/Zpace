import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pin, PinOff, Tag, X, Copy, Download, Folder, Trash2, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LivingItem, LivingList } from '@/components/ui/Living';
import { useNotes } from '@/stores/notes';
import { useProjects } from '@/stores/projects';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { Markdown } from '@/features/agent/Markdown';
import { toast } from '@/features/notifications/toast-store';
import { formatRelative } from '@/lib/format';
import { isTauri } from '@/lib/platform';
import { writeTextFile } from '@/native/system';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { RichNoteEditor } from './RichNoteEditor';
import { BoardPane } from './BoardPane';
import { DropdownMenuCheckboxItem } from '@/components/ui/DropdownMenu';
import { t } from '@/i18n';

type Mode = 'edit' | 'split' | 'preview';

/**
 * Note editor. Default is the rich, plain-looking editor (select text for the
 * format bubble); "Markdown source" switches to the raw textarea with live
 * preview. Both write the same Markdown body. Autosaves (debounced) into the
 * notes store, which mirrors to SQLite. Ctrl/⌘ S saves immediately.
 */
export const NotePane = memo(function NotePane({ noteId, focused }: { noteId: string; focused: boolean }) {
  const note = useNotes((s) => s.notes[noteId]);
  const update = useNotes((s) => s.updateNote);
  const projects = useProjects((s) => s.projects);
  const { deleteNote } = useWorkspaceActions();
  const [mode, setMode] = useState<Mode>('edit');
  const [source, setSource] = useState(false);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [tagDraft, setTagDraft] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<number | null>(null);
  const lastSaved = useRef({ title: note?.title ?? '', body: note?.body ?? '' });

  // Switch notes: load fresh values.
  const [loadedFor, setLoadedFor] = useState(noteId);
  if (loadedFor !== noteId && note) {
    setLoadedFor(noteId);
    setTitle(note.title);
    setBody(note.body);
    lastSaved.current = { title: note.title, body: note.body };
  }

  const flush = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (lastSaved.current.title !== title || lastSaved.current.body !== body) {
      lastSaved.current = { title, body };
      update(noteId, { title: title.trim(), body });
    }
  }, [body, noteId, title, update]);

  useEffect(() => {
    if (lastSaved.current.title === title && lastSaved.current.body === body) return;
    saveTimer.current = window.setTimeout(flush, 350);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [title, body, flush]);

  useEffect(() => {
    if (focused && source && mode !== 'preview') bodyRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, noteId]);

  const stats = useMemo(() => {
    const words = body.trim() ? body.trim().split(/\s+/).length : 0;
    return { words, chars: body.length };
  }, [body]);

  const wrapSelection = (before: string, after = before) => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = body.slice(s, e);
    const next = body.slice(0, s) + before + selected + after + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, e + before.length);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      flush();
      toast.neutral(t('Saved'), { duration: 1200, origin: null });
      return;
    }
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      wrapSelection('**');
      return;
    }
    if (mod && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      wrapSelection('_');
      return;
    }
    if (mod && e.key === '`') {
      e.preventDefault();
      wrapSelection('`');
      return;
    }
    const el = e.currentTarget;
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en } = el;
      const next = body.slice(0, s) + '  ' + body.slice(en);
      setBody(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const { selectionStart: s } = el;
      const lineStart = body.lastIndexOf('\n', s - 1) + 1;
      const line = body.slice(lineStart, s);
      const m = /^(\s*)([-*+]|\d+[.)])\s(\[[ x]\]\s)?/.exec(line);
      if (m) {
        e.preventDefault();
        const content = line.slice(m[0].length);
        if (!content.trim()) {
          // Empty bullet → end the list.
          const next = body.slice(0, lineStart) + body.slice(s);
          setBody(next);
          requestAnimationFrame(() => el.setSelectionRange(lineStart, lineStart));
          return;
        }
        const marker = /^\d+/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].endsWith(')') ? ')' : '.'}` : m[2];
        const prefix = `\n${m[1]}${marker} ${m[3] ? '[ ] ' : ''}`;
        const next = body.slice(0, s) + prefix + body.slice(s);
        setBody(next);
        requestAnimationFrame(() => el.setSelectionRange(s + prefix.length, s + prefix.length));
      }
    }
  };

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, '');
    if (!t || !note) return;
    if (!note.tags.includes(t)) update(noteId, { tags: [...note.tags, t] });
    setTagDraft('');
  };

  const exportMarkdown = async () => {
    const text = `# ${title || t('Untitled')}\n\n${body}`;
    if (!isTauri) {
      await navigator.clipboard.writeText(text);
      toast.neutral(t('Markdown copied'));
      return;
    }
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: `${(title || 'note').replace(/[\\/:*?"<>|]+/g, '-')}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (!path) return;
    await writeTextFile(path, text);
    toast.success(t('Note exported'), { description: path });
  };

  if (!note) return <div className="flex h-full items-center justify-center text-[12.5px] text-muted">{t('Note deleted')}</div>;

  const project = projects.find((p) => p.id === note.projectId);

  if (note.kind === 'board') {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex h-10 shrink-0 items-center gap-2 px-4 hairline-b">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={flush}
            placeholder={t('Board')}
            aria-label={t('Board title')}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-primary outline-none placeholder:text-muted"
          />
          {project ? (
            <span className="inline-flex h-[22px] items-center gap-1 rounded-md bg-surface-inset px-1.5 text-[11.5px] text-secondary">
              <Folder className="size-3 text-muted" />
              {project.name}
            </span>
          ) : null}
          <IconButton label={note.pinned ? t('Unpin') : t('Pin')} size="sm" onClick={() => update(noteId, { pinned: !note.pinned })} active={note.pinned}>
            {note.pinned ? <PinOff /> : <Pin />}
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={t('More')} tooltip={false} size="sm">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('Project')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={note.projectId ?? ''} onValueChange={(v) => update(noteId, { projectId: v || undefined })}>
                <DropdownMenuRadioItem value="">{t('No project')}</DropdownMenuRadioItem>
                {projects.map((p) => (
                  <DropdownMenuRadioItem key={p.id} value={p.id}>
                    {p.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} danger onSelect={() => deleteNote(noteId)}>
                {t('Delete board')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-h-0 flex-1">
          <BoardPane noteId={noteId} />
        </div>
      </div>
    );
  }

  return (
    <div className="note-paper flex h-full min-h-0 flex-col bg-note-paper text-primary">
      {/* toolbar — plain, with a thin yellow rule under it */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-4 shadow-[inset_0_-2px_0_var(--note-paper-strong)]">
        {source ? (
          <SegmentedControl
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'edit', label: t('Edit') },
              { value: 'split', label: t('Split') },
              { value: 'preview', label: t('Preview') },
            ]}
            aria-label={t('Editor mode')}
          />
        ) : (
          <span className="text-[11.5px] text-muted">{t('Select text to format')}</span>
        )}
        <span className="flex-1" />
        <span className="hidden text-[11.5px] tabular text-muted sm:inline">
          {t('{n} words', { n: stats.words })} · {t('edited {when}', { when: formatRelative(note.updatedAt) })}
        </span>
        <IconButton label={note.pinned ? t('Unpin') : t('Pin')} size="sm" onClick={() => update(noteId, { pinned: !note.pinned })} active={note.pinned}>
          {note.pinned ? <PinOff /> : <Pin />}
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={t('More')} tooltip={false} size="sm">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('Project')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={note.projectId ?? ''} onValueChange={(v) => update(noteId, { projectId: v || undefined })}>
              <DropdownMenuRadioItem value="">{t('No project')}</DropdownMenuRadioItem>
              {projects.map((p) => (
                <DropdownMenuRadioItem key={p.id} value={p.id}>
                  {p.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={source} onCheckedChange={(v) => setSource(!!v)}>
              {t('Markdown source')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={<Copy />}
              onSelect={() => {
                void navigator.clipboard.writeText(`# ${title}\n\n${body}`);
                toast.neutral(t('Markdown copied'));
              }}
            >
              {t('Copy as Markdown')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Download />} onSelect={() => void exportMarkdown()}>
              {t('Export .md…')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<Trash2 />} danger onSelect={() => deleteNote(noteId)}>
              {t('Delete note')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* title + meta */}
      <div className="shrink-0 px-(--content-padding) pt-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              bodyRef.current?.focus();
            }
          }}
          placeholder={t('Untitled')}
          aria-label={t('Note title')}
          className="w-full bg-transparent text-[20px] font-semibold tracking-[-0.015em] text-primary outline-none placeholder:text-muted"
        />
        <LivingList className="mt-2 flex flex-wrap items-center gap-1.5">
          {project ? (
            <span className="inline-flex h-[22px] items-center gap-1 rounded-md bg-surface-inset px-1.5 text-[11.5px] text-secondary">
              <Folder className="size-3 text-muted" />
              {project.name}
            </span>
          ) : null}
          {note.tags.map((t) => (
            <LivingItem key={t} className="group/tag inline-flex h-[22px] items-center gap-1 rounded-md bg-surface-inset px-1.5 text-[11.5px] text-secondary">
              <Tag className="size-3 text-muted" />
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => update(noteId, { tags: note.tags.filter((x) => x !== t) })}
                className="ml-0.5 inline-flex size-3.5 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:text-primary group-hover/tag:opacity-100"
              >
                <X className="size-2.5" />
              </button>
            </LivingItem>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              }
              if (e.key === 'Backspace' && !tagDraft && note.tags.length) update(noteId, { tags: note.tags.slice(0, -1) });
            }}
            onBlur={addTag}
            placeholder={t('Add tag')}
            aria-label={t('Add tag')}
            className="h-[22px] w-[132px] bg-transparent text-[11.5px] text-secondary outline-none placeholder:text-muted/70"
          />
        </LivingList>
      </div>

      {/* body */}
      <div className={cn('mt-4 flex min-h-0 flex-1', source && mode === 'split' && 'divide-x divide-border')}>
        {!source ? (
          <RichNoteEditor key={noteId} value={body} onChange={setBody} placeholder={t('Write…')} onSave={() => { flush(); toast.neutral(t('Saved'), { duration: 1200, origin: null }); }} focused={focused} />
        ) : null}
        {source && mode !== 'preview' ? (
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={flush}
            placeholder={t('Write in Markdown…')}
            aria-label={t('Note body')}
            spellCheck={false}
            className={cn(
              'selectable h-full min-h-0 flex-1 resize-none bg-transparent px-(--content-padding) pb-8 font-mono text-content leading-[1.7] text-primary outline-none placeholder:text-muted',
              mode === 'split' && 'w-1/2 flex-none',
            )}
          />
        ) : null}
        {source && mode !== 'edit' ? (
          <div className={cn('selectable min-h-0 flex-1 overflow-y-auto px-(--content-padding) pb-8', mode === 'split' && 'w-1/2 flex-none')}>
            {body.trim() ? <Markdown text={body} className="prose-note" /> : <div className="text-[13px] text-muted">{t('Nothing to preview yet.')}</div>}
          </div>
        ) : null}
      </div>
    </div>
  );
});

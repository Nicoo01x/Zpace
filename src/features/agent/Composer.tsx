import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowUp, FileText, Folder, Image as ImageIcon, Paperclip, Square, X, ListPlus, ChevronUp, ChevronDown, Send, Mic, Swords } from 'lucide-react';
import { useArenaLauncher } from '@/features/arena/launcher';
import { speechRecognize, speechLang } from '@/native/speech';
import { useQueue, queueFor } from '@/stores/queue';
import { useClips } from '@/stores/clips';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { useSessions } from '@/stores/sessions';
import { useSettings } from '@/stores/settings';
import { takeDraft, takeImages, insertIntoComposer } from './composer-drafts';
import { setSessionModel } from './session-model';
import { useWorkspaceActions, claudeLaunchDefaults } from '@/features/sessions/useWorkspaceActions';
import { useCapabilities, NO_ASSETS } from '@/stores/capabilities';
import { filterSuggestions, mentionSuggestions, slashSuggestions, type Suggestion } from './suggestions';
import { listProjectFiles } from '@/native/system';
import { Textarea } from '@/components/ui/Textarea';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { AttachmentStrip } from './blocks/AttachmentStrip';
import { runtime } from '@/providers/runtime';
import type { Attachment } from '@/types/agent';
import { uid } from '@/lib/id';
import { pickFiles, pickFolder } from '@/native/system';
import { basename } from '@/lib/format';
import { springs, easings } from '@/lib/motion';
import { isTauri, isWindows } from '@/lib/platform';
import { toast } from '@/features/notifications/toast-store';
import { cyclePermissionMode } from './permissionMode';
import { useTerminals } from '@/stores/terminals';
import { useProjects } from '@/stores/projects';
import { useSelectionContext, selectionMention } from '@/stores/selection';
import { FileIcon } from '@/features/files/FileIcon';
import { useUI } from '@/stores/ui';
import { git } from '@/native/git';
import { terminalTail } from '@/features/terminal/registry';
import { MODELS } from '@/stores/settings';
import { formatCost, formatNumber } from '@/lib/format';
import { t } from '@/i18n';

/**
 * Composer — a prompt line, not a chat box:
 *   ────────────────────────────────────────
 *   ❯ Ask Claude anything…            ⌘ ↑
 *   ────────────────────────────────────────
 * Enter sends (configurable), Shift+Enter breaks the line, Shift+Tab cycles
 * the permission mode, "/" and "@" open suggestions, images paste or drop in.
 */
export const Composer = memo(function Composer({ sessionId, focused }: { sessionId: string; focused: boolean }) {
  const session = useSessions((s) => s.sessions[sessionId]);
  const sendKey = useSettings((s) => s.sendKey);
  const project = useProjects((s) => s.projects.find((p) => p.id === session?.projectId));
  const openSettings = useUI((s) => s.openSettings);
  const { launchClaude, openFile, closeActivePane } = useWorkspaceActions();

  const [value, setValue] = useState(() => takeDraft(sessionId) ?? '');
  const caps = useCapabilities((c) => c.bySession[sessionId]);
  const assets = useCapabilities((c) => c.assets[project?.path ?? '']?.data ?? NO_ASSETS);
  const loadAssets = useCapabilities((c) => c.loadAssets);
  const [files, setFiles] = useState<string[]>([]);
  // Skills / commands / agents from disk, and the project's file list for @mentions.
  useEffect(() => {
    void loadAssets(project?.path);
    if (!project || !isTauri) return;
    let cancelled = false;
    void listProjectFiles(project.path, 8000)
      .then((list) => !cancelled && setFiles(list))
      .catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, [project, loadAssets]);
  const snippets = useClips(useShallow((c) => c.snippets.filter((x) => !x.projectId || x.projectId === session?.projectId)));
  const slashItems = useMemo(() => slashSuggestions(caps, assets, snippets), [caps, assets, snippets]);
  const [attachments, setAttachments] = useState<Attachment[]>(() => takeImages(sessionId).map((img) => ({ id: uid('att'), kind: 'image' as const, name: img.name, url: img.url, mime: img.mime })));

  // Text dropped into this composer from elsewhere (the capabilities panel, "ask about this file").
  useEffect(() => {
    const onInsert = (e: Event) => {
      if ((e as CustomEvent<{ sessionId: string }>).detail.sessionId !== sessionId) return;
      const text = takeDraft(sessionId);
      if (!text) return;
      setValue((v) => (v && !v.endsWith(' ') ? v + ' ' : v) + text);
      requestAnimationFrame(() => {
        const el = ref.current;
        el?.focus();
        el?.setSelectionRange(el.value.length, el.value.length);
      });
    };
    window.addEventListener('conduit:composer-insert', onInsert);
    return () => window.removeEventListener('conduit:composer-insert', onInsert);
  }, [sessionId]);

  // Screenshots and other images handed to this session while it is open.
  useEffect(() => {
    const onImage = (e: Event) => {
      if ((e as CustomEvent<{ sessionId: string }>).detail.sessionId !== sessionId) return;
      const next = takeImages(sessionId).map((img) => ({ id: uid('att'), kind: 'image' as const, name: img.name, url: img.url, mime: img.mime }));
      if (next.length) setAttachments((a) => [...a, ...next]);
    };
    window.addEventListener('conduit:composer-image', onImage);
    // An image queued between this composer's first render and this subscription would be lost otherwise
    // (a session created *for* a screenshot is rendered synchronously, before its effects run).
    const drain = window.setTimeout(() => onImage(new CustomEvent('conduit:composer-image', { detail: { sessionId } })), 0);
    return () => {
      window.clearTimeout(drain);
      window.removeEventListener('conduit:composer-image', onImage);
    };
  }, [sessionId]);
  const [dragging, setDragging] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [hasFocus, setHasFocus] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const busy = session?.status === 'running' || session?.status === 'waiting';
  const language = useSettings((st) => st.language);
  const [listening, setListening] = useState(false);
  /** Dictate: one utterance through Windows' recognizer, dropped at the caret. */
  const dictate = useCallback(async () => {
    if (listening || !isWindows) return;
    setListening(true);
    try {
      const text = (await speechRecognize(speechLang(language))).trim();
      if (text) {
        setValue((v) => (v && !/\s$/.test(v) ? `${v} ${text}` : v + text));
        requestAnimationFrame(() => {
          const el = ref.current;
          el?.focus();
          el?.setSelectionRange(el.value.length, el.value.length);
        });
      }
    } catch (e) {
      toast.error(t('Dictation failed'), { description: e instanceof Error ? e.message : String(e), key: 'dictate' });
    } finally {
      setListening(false);
    }
  }, [language, listening]);

  useEffect(() => {
    if (focused) ref.current?.focus();
  }, [focused, sessionId]);

  const suggestions = useMemo(() => {
    const caret = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    if (/^\/[\w:-]*$/.test(before)) {
      return { type: 'slash' as const, items: filterSuggestions(slashItems, before), token: before };
    }
    const m = /(?:^|\s)(@[\w./\\:-]*)$/.exec(before);
    if (m) {
      return { type: 'mention' as const, items: filterSuggestions(mentionSuggestions(files, m[1], caps, assets), m[1], 12), token: m[1] };
    }
    return null;
  }, [value, slashItems, files, caps, assets]);

  const activeSuggest = suggestions ? Math.min(suggestIndex, Math.max(0, suggestions.items.length - 1)) : 0;

  const replaceToken = useCallback(
    (text: string) => {
      const el = ref.current;
      const caret = el?.selectionStart ?? value.length;
      const before = value.slice(0, caret);
      const after = value.slice(caret);
      const token = suggestions?.token ?? '';
      const next = before.slice(0, before.length - token.length) + text + after;
      setValue(next);
      setSuggestIndex(0);
      requestAnimationFrame(() => {
        el?.focus();
        const pos = before.length - token.length + text.length;
        el?.setSelectionRange(pos, pos);
      });
    },
    [suggestions, value],
  );

  /** Mentions resolve to real content: a picked path, git status, terminal output. */
  const applySuggestion = useCallback(
    (sug: Suggestion | string) => {
      const text = typeof sug === 'string' ? sug : sug.insert;
      if (typeof sug !== 'string' && sug.tui) {
        // Interactive-only command: Claude's own terminal, beside this chat, with the command typed.
        replaceToken('');
        if (!project) {
          toast.info(t('Open a project first'));
          return;
        }
        // Same conversation, not a new one: stop the chat's stream-json process and resume the
        // Claude session in the TUI (`--resume <id>`) with the command as its first prompt. The chat
        // resumes the same id again on its next message.
        const providerSessionId = session?.providerSessionId;
        const defaults = claudeLaunchDefaults(useSettings.getState().claude);
        const extra = providerSessionId ? `${defaults.extraArgs} --resume ${providerSessionId}`.trim() : defaults.extraArgs;
        void (async () => {
          if (providerSessionId) await runtime.dispose(sessionId).catch(() => void 0);
          const ui = useUI.getState();
          ui.splitPane(ui.activePaneId, 'horizontal', { kind: 'empty' });
          launchClaude(project.id, { ...defaults, continueLast: false, extraArgs: extra, prompt: text });
        })();
        return;
      }
      if (text.startsWith('/snippet:')) {
        const sn = snippets.find((x) => `/snippet:${x.name}` === text);
        replaceToken(sn ? sn.body : '');
        return;
      }
      if (text === '@file') {
        void pickFiles().then((paths) => replaceToken(paths.length ? paths.map((p) => '@' + p).join(' ') + ' ' : ''));
        return;
      }
      if (text === '@folder') {
        void pickFolder('Reference folder').then((p) => replaceToken(p ? '@' + p + '/ ' : ''));
        return;
      }
      if (text === '@git') {
        if (!project || !isTauri) return replaceToken('');
        void Promise.all([git.summary(project.path), git.status(project.path)])
          .then(([sum, files]) => {
            const lines = files.map((f) => (f.staged ? 'staged ' : '') + f.status + ' ' + f.path);
            replaceToken('\n```\ngit: ' + sum.branch + ' (↑' + sum.ahead + ' ↓' + sum.behind + ')\n' + (lines.join('\n') || 'working tree clean') + '\n```\n');
          })
          .catch(() => replaceToken(''));
        return;
      }
      if (text === '@terminal') {
        const state = useTerminals.getState();
        const tab = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
        const tail = tab ? terminalTail(tab.id, 40) : '';
        if (!tail) toast.info(t('No terminal output to insert'));
        replaceToken(tail ? '\n```\n' + tail + '\n```\n' : '');
        return;
      }
      // Agents expand to a sentence; everything else is the token plus a space (argument hints stay as a placeholder).
      replaceToken(text.endsWith(' ') ? text : text + ' ');
    },
    [project, replaceToken, launchClaude, session?.providerSessionId, sessionId, snippets],
  );

  /** Local slash commands; anything else goes to Claude verbatim. */
  const runLocalSlash = useCallback(
    (text: string): boolean => {
      if (!session) return false;
      const [cmd, ...rest] = text.trim().split(/\s+/);
      const arg = rest.join(' ');
      if (cmd.startsWith('/snippet:')) {
        // Typed by hand: expand it in place (with whatever followed it) instead of sending.
        const sn = snippets.find((x) => `/snippet:${x.name}` === cmd);
        window.setTimeout(() => setValue(sn ? `${sn.body}${arg ? ` ${arg}` : ''}` : text), 0);
        return true;
      }
      if (cmd === '/clear') {
        void runtime.dispose(sessionId).then(() => {
          useSessions.getState().clearEvents(sessionId);
          useSessions.getState().updateSession(sessionId, { providerSessionId: undefined, usage: { ...session.usage, contextUsed: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } });
          toast.neutral(t('Conversation cleared'), { origin: null });
        });
        return true;
      }
      if (cmd === '/cost') {
        const u = session.usage;
        toast.info(formatCost(u.costUsd) + ' this session', {
          description: formatNumber(u.inputTokens) + ' in · ' + formatNumber(u.outputTokens) + ' out · ' + formatNumber(u.contextUsed) + ' in context',
          origin: null,
          duration: 6000,
        });
        return true;
      }
      if (cmd === '/model') {
        const id = arg.trim();
        if (!id) {
          toast.info('Usage: /model opus | sonnet | haiku | <model id>', { description: t('Current: {value}', { value: session.modelLabel }), origin: null });
          return true;
        }
        setSessionModel(session, MODELS.find((x) => x.id === id.toLowerCase())?.id ?? id);
        return true;
      }
      if (cmd === '/help') {
        openSettings('keyboard');
        return true;
      }
      if (cmd === '/arena') {
        if (!project?.git?.isRepo) {
          toast.info(t('The arena needs a git repository'), { origin: null });
          return true;
        }
        useArenaLauncher.getState().open(project.id, arg);
        return true;
      }
      // Session options: stored on the session and applied when its process restarts —
      // so the running stream-json process is dropped and resumes (same conversation) on the next message.
      const setOption = (patch: Partial<NonNullable<typeof session.options>>, label: string) => {
        useSessions.getState().updateSession(sessionId, { options: { ...(session.options ?? {}), ...patch } });
        void runtime.dispose(sessionId).catch(() => void 0);
        toast.success(label, { description: t('Applies from the next message, same conversation.'), origin: null });
        return true;
      };
      if (cmd === '/effort') {
        const level = arg.trim().toLowerCase();
        if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(level)) {
          toast.info('Usage: /effort low | medium | high | xhigh | max', { description: session.options?.effort ? t('Current: {value}', { value: session.options.effort }) : undefined, origin: null });
          return true;
        }
        return setOption({ effort: level }, `Effort: ${level}`);
      }
      if (cmd === '/add-dir') {
        const dir = arg.trim();
        if (!dir) {
          toast.info('Usage: /add-dir <path>', { description: session.options?.addDirs?.join(', ') || undefined, origin: null });
          return true;
        }
        return setOption({ addDirs: Array.from(new Set([...(session.options?.addDirs ?? []), dir])) }, `Added ${dir}`);
      }
      if (cmd === '/autocompact') {
        const v = arg.trim();
        if (!v) {
          toast.info('Usage: /autocompact auto | <tokens>', { origin: null });
          return true;
        }
        return setOption({ autocompact: v }, `Auto-compact: ${v}`);
      }
      if (cmd === '/agent') {
        const v = arg.trim();
        return setOption({ agent: v || undefined }, v ? `Agent: ${v}` : 'Agent cleared');
      }
      if (cmd === '/fallback-model') {
        const v = arg.trim();
        return setOption({ fallbackModel: v || undefined }, v ? `Fallback model: ${v}` : 'Fallback cleared');
      }
      if (cmd === '/permissions' || cmd === '/permission-mode') {
        const v = arg.trim();
        const modes = ['default', 'acceptEdits', 'plan', 'bypassPermissions'] as const;
        const pick = modes.find((m) => m.toLowerCase() === v.toLowerCase() || m.toLowerCase().startsWith(v.toLowerCase()));
        if (!v || !pick) {
          toast.info('Usage: /permissions default | acceptEdits | plan | bypassPermissions', { origin: null });
          return true;
        }
        return setOption({ permissionMode: pick }, `Permissions: ${pick}`);
      }
      // Zpace already has a screen for these — no need to bounce to a terminal.
      if (cmd === '/config' || cmd === '/settings') return (openSettings('claude'), true);
      if (cmd === '/theme') return (openSettings('appearance'), true);
      if (cmd === '/keybindings') return (openSettings('keyboard'), true);
      if (cmd === '/usage') return (useSettings.getState().set('showUsage', true), toast.info(t('Usage and limits'), { description: t('See the gauge in the title bar.'), origin: null }), true);
      if (cmd === '/memory') {
        const p = project ? `${project.path}${project.path.includes('\\') ? '\\' : '/'}CLAUDE.md` : null;
        if (p) openFile(p, project?.id, 'split');
        return true;
      }
      if (cmd === '/diff' || cmd === '/branch' || cmd === '/commit') return (useUI.getState().toggleGitPanel(), true);
      if (cmd === '/copy') {
        const last = [...(useSessions.getState().events[sessionId] ?? [])].reverse().find((e) => e.type === 'assistant_message');
        if (last && 'text' in last) {
          void navigator.clipboard.writeText(String(last.text));
          toast.neutral(t('Copied'), { origin: null, duration: 1200 });
        }
        return true;
      }
      if (cmd === '/exit' || cmd === '/quit') {
        void runtime.dispose(sessionId);
        closeActivePane();
        return true;
      }
      return false;
    },
    [openSettings, session, sessionId, project, openFile, closeActivePane, snippets],
  );

  // Selected lines in a file pane of this project: shown as a chip, sent with the message unless detached.
  const selection = useSelectionContext((st) => st.current);
  const selectionForHere = selection && (!selection.projectId || !session || selection.projectId === session.projectId) ? selection : null;
  const [selectionDetached, setSelectionDetached] = useState<string | null>(null);
  const selectionKey = selectionForHere ? `${selectionForHere.path}:${selectionForHere.startLine}-${selectionForHere.endLine}` : null;
  const selectionAttached = !!selectionForHere && selectionDetached !== selectionKey;

  const queued = useQueue(useShallow((q) => queueFor(q.queues, sessionId)));
  /** The message as it would be sent (selection chip included), or null when there is nothing. */
  const compose = useCallback(() => {
    const typed = value.trim();
    const withSel = selectionAttached && selectionForHere && !typed.startsWith('/');
    const text = withSel
      ? `${typed ? `${typed}\n\n` : ''}${selectionMention(selectionForHere)}:\n\`\`\`${selectionForHere.language}\n${selectionForHere.code}\n\`\`\``
      : typed;
    if (!text && attachments.length === 0) return null;
    return { text, withSel };
  }, [attachments.length, selectionAttached, selectionForHere, value]);
  /** Line the message up behind the running turn (Alt+Enter, or Enter while the agent is busy). */
  const enqueue = useCallback(() => {
    const c = compose();
    if (!c || !session) return;
    useQueue.getState().enqueue(sessionId, c.text, attachments);
    setValue('');
    setAttachments([]);
    if (c.withSel) useSelectionContext.getState().clear();
  }, [attachments, compose, session, sessionId]);

  const send = useCallback(() => {
    const typed = value.trim();
    const withSel = selectionAttached && selectionForHere && !typed.startsWith('/');
    const text = withSel
      ? `${typed ? `${typed}\n\n` : ''}${selectionMention(selectionForHere)}:\n\`\`\`${selectionForHere.language}\n${selectionForHere.code}\n\`\`\``
      : typed;
    if (!text && attachments.length === 0) return;
    if (!session) return;
    if (text.startsWith('/') && attachments.length === 0 && runLocalSlash(text)) {
      setValue('');
      return;
    }
    void runtime.send(sessionId, text, attachments);
    setValue('');
    setAttachments([]);
    if (withSel) useSelectionContext.getState().clear();
  }, [attachments, runLocalSlash, session, sessionId, value, selectionAttached, selectionForHere]);

  const stop = useCallback(() => void runtime.cancel(sessionId), [sessionId]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const next: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.type.startsWith('image/')) {
        const url = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.readAsDataURL(f);
        });
        next.push({ id: uid('att'), kind: 'image', name: f.name || 'pasted-image.png', url, size: f.size, mime: f.type });
      } else {
        next.push({ id: uid('att'), kind: 'file', name: f.name, size: f.size, mime: f.type, path: (f as File & { path?: string }).path });
      }
    }
    if (next.length) setAttachments((a) => [...a, ...next]);
  }, []);

  const addPaths = useCallback((paths: string[], kind: 'file' | 'folder' = 'file') => {
    setAttachments((a) => [...a, ...paths.map((p) => ({ id: uid('att'), kind: /\.(png|jpe?g|gif|webp)$/i.test(p) ? ('image' as const) : kind, name: basename(p), path: p }))]);
  }, []);

  // Native OS drag & drop (Tauri delivers paths, not File objects).
  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      un = await getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type === 'over') setDragging(true);
        else if (e.payload.type === 'drop') {
          setDragging(false);
          if (focused) addPaths(e.payload.paths);
        } else setDragging(false);
      });
    })();
    return () => un?.();
  }, [addPaths, focused]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const m = cyclePermissionMode();
      toast.neutral(t('{mode} on', { mode: t(m.label) }), { description: t(m.hint), key: 'permission-mode', origin: null, duration: 1800 });
      return;
    }
    if (suggestions && suggestions.items.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestIndex((i) => (i + 1) % suggestions.items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestIndex((i) => (i - 1 + suggestions.items.length) % suggestions.items.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const it = suggestions.items[activeSuggest];
        if (it) applySuggestion(it);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setValue((v) => v + ' ');
        return;
      }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter') {
      if (e.shiftKey) return; // newline
      if (e.altKey) {
        e.preventDefault();
        enqueue();
        return;
      }
      if (sendKey === 'enter' || mod) {
        e.preventDefault();
        // While the agent works, Enter lines the message up instead of interrupting.
        if (busy) enqueue();
        else send();
      }
    }
    if (e.key === 'Escape' && busy) stop();
    if (e.key.toLowerCase() === 'm' && mod && e.shiftKey) {
      e.preventDefault();
      void dictate();
    }
  };

  const canSend = Boolean(value.trim()) || attachments.length > 0;

  return (
    <div
      className="relative shrink-0 hairline-t"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
      }}
    >
      {/* suggestions */}
      <AnimatePresence>
        {suggestions && suggestions.items.length ? (
          <motion.div
            key={suggestions.type}
            role="listbox"
            initial={{ opacity: 0, y: 6, scale: 0.98, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 4, scale: 0.98, filter: 'blur(3px)', transition: { duration: 0.12 } }}
            transition={{ default: springs.pop, opacity: { duration: 0.12 }, filter: { duration: 0.16 } }}
            style={{ transformOrigin: 'bottom left', left: 'calc(var(--content-padding) + 26px)' }}
            className="absolute bottom-full z-30 mb-2 w-[460px] max-w-[calc(100%-2*var(--content-padding))] rounded-lg bg-surface-raised p-1 shadow-popover"
          >
            <div className="max-h-[min(46vh,380px)] overflow-y-auto">
              {suggestions.items.map((it, i) => {
                const Icon = it.icon;
                const first = i === 0 || suggestions.items[i - 1].group !== it.group;
                return (
                  <div key={it.id}>
                    {first ? <div className={cn('px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-muted', i === 0 ? 'pt-1.5' : 'pt-2')}>{t(it.group)}</div> : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === activeSuggest}
                      onMouseEnter={() => setSuggestIndex(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySuggestion(it)}
                      className={cn('relative flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-ui', i === activeSuggest ? 'text-primary' : 'text-secondary')}
                    >
                      {i === activeSuggest ? <motion.span layoutId="composer-suggest" transition={{ type: 'spring', stiffness: 700, damping: 44, mass: 0.7 }} className="absolute inset-0 -z-10 rounded-md bg-surface-hover" /> : null}
                      <Icon className="size-[13px] shrink-0 text-muted" />
                      <span className="shrink-0 font-mono text-[12.5px] text-primary">{it.label}</span>
                      {it.argumentHint ? <span className="shrink-0 font-mono text-[11px] text-muted">{it.argumentHint}</span> : null}
                      <span className="ml-auto min-w-0 truncate pl-3 text-[11.5px] text-muted">{it.hint}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {queued.length ? (
          <motion.div key="queue" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }} transition={springs.snappy} className="overflow-hidden px-(--content-padding)">
            <div className="mt-3 rounded-lg bg-surface-inset px-2.5 py-2">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                <ListPlus className="size-[12px]" />
                {t('Queued · {n}', { n: queued.length })}
                <span className="flex-1" />
                <button type="button" onClick={() => useQueue.getState().clear(sessionId)} className="rounded px-1 normal-case tracking-normal hover:bg-surface-hover hover:text-primary">
                  {t('Clear')}
                </button>
              </div>
              <ol className="flex flex-col gap-0.5">
                {queued.map((m, i) => (
                  <li key={m.id} className="group/q flex items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] text-secondary hover:bg-surface-hover">
                    <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{m.text.replace(/\s+/g, ' ')}</span>
                    {m.attachments?.length ? <span className="text-[11px] text-muted">{t('{n} files', { n: m.attachments.length })}</span> : null}
                    <span className="hidden shrink-0 items-center gap-0.5 group-hover/q:inline-flex">
                      <button type="button" aria-label={t('Move up')} disabled={i === 0} onClick={() => useQueue.getState().move(sessionId, m.id, -1)} className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-surface-active hover:text-primary disabled:opacity-30">
                        <ChevronUp className="size-[12px]" />
                      </button>
                      <button type="button" aria-label={t('Move down')} disabled={i === queued.length - 1} onClick={() => useQueue.getState().move(sessionId, m.id, 1)} className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-surface-active hover:text-primary disabled:opacity-30">
                        <ChevronDown className="size-[12px]" />
                      </button>
                      <Tooltip content={t('Send now')} side="top">
                        <button
                          type="button"
                          aria-label={t('Send now')}
                          disabled={busy}
                          onClick={() => {
                            useQueue.getState().remove(sessionId, m.id);
                            void runtime.send(sessionId, m.text, m.attachments ?? []);
                          }}
                          className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-surface-active hover:text-primary disabled:opacity-30"
                        >
                          <Send className="size-[12px]" />
                        </button>
                      </Tooltip>
                      <button type="button" aria-label={t('Remove')} onClick={() => useQueue.getState().remove(sessionId, m.id)} className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-surface-active hover:text-danger">
                        <X className="size-[12px]" />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {selectionForHere ? (
          <motion.div key={selectionKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }} transition={springs.pop} className="px-(--content-padding) pt-3">
            <div className="flex items-center gap-2 pl-[26px]">
              <button
                type="button"
                title={selectionAttached ? t('Sent with the message — click to insert the reference instead') : t('Click to insert the reference')}
                onClick={() => {
                  insertIntoComposer(sessionId, `${selectionMention(selectionForHere)} `);
                  setSelectionDetached(selectionKey);
                }}
                className={cn(
                  'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full pl-2 pr-2.5 font-mono text-[12px] transition-colors',
                  selectionAttached ? 'bg-accent-soft text-accent hover:brightness-95' : 'bg-surface-inset text-secondary hover:text-primary',
                )}
              >
                <FileIcon name={basename(selectionForHere.path)} size={13} />
                <span className="truncate">
                  {basename(selectionForHere.path)}
                  <span className="opacity-70">
                    :{selectionForHere.startLine}
                    {selectionForHere.endLine !== selectionForHere.startLine ? `-${selectionForHere.endLine}` : ''}
                  </span>
                </span>
                <span className="text-[10.5px] opacity-70">{selectionAttached ? t('attached') : t('detached')}</span>
              </button>
              <button type="button" aria-label={selectionAttached ? t('Detach') : t('Attach')} onClick={() => setSelectionDetached(selectionAttached ? selectionKey : null)} className="inline-flex size-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-primary">
                {selectionAttached ? <X className="size-3.5" /> : <Paperclip className="size-3.5" />}
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {attachments.length ? (
        <div className="px-(--content-padding) pt-3">
          <AttachmentStrip attachments={attachments} onRemove={(id) => setAttachments((a) => a.filter((x) => x.id !== id))} className="pl-[26px]" />
        </div>
      ) : null}

      {/* prompt line */}
      <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-2 px-(--content-padding) py-[10px]">
        <motion.span
          animate={busy ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
          transition={busy ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          className={cn('flex h-[22px] items-center font-mono text-content transition-colors duration-(--motion-fast)', busy ? 'text-accent-warm' : hasFocus ? 'text-primary' : 'text-secondary')}
        >
          ❯
        </motion.span>
        <Textarea
          ref={ref}
          bare
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setHasFocus(true)}
          onBlur={() => setHasFocus(false)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          placeholder={t('Ask Claude anything…')}
          aria-label={t('Message')}
          minRows={1}
          maxRows={10}
          className="py-[1px] font-mono text-content leading-[1.6] placeholder:text-muted/80"
        />
        <div className={cn('flex h-[22px] items-center gap-0.5 transition-opacity duration-(--motion-normal)', hasFocus || canSend || busy || listening ? 'opacity-100' : 'opacity-0 hover:opacity-100')}>
          {project?.git?.isRepo ? (
            <Tooltip content={t('Agent arena: the same task to several agents, compare and keep one')} side="top">
              <button type="button" aria-label={t('Agent arena…')} onClick={() => useArenaLauncher.getState().open(project.id, value.trim())} className="inline-flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-primary">
                <Swords className="size-[13px]" />
              </button>
            </Tooltip>
          ) : null}
          {/* dictation rides on Windows' recognizer; the button only shows where it works */}
          {isTauri && isWindows ? (
            <Tooltip content={listening ? t('Listening…') : t('Dictate')} shortcut="mod+shift+m" side="top">
              <button type="button" aria-label={t('Dictate')} aria-pressed={listening} onClick={() => void dictate()} className={cn('inline-flex size-6 items-center justify-center rounded-md transition-colors', listening ? 'bg-danger/12 text-danger' : 'text-muted hover:bg-surface-hover hover:text-primary')}>
                {listening ? (
                  <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }} className="inline-flex">
                    <Mic className="size-[13px]" />
                  </motion.span>
                ) : (
                  <Mic className="size-[13px]" />
                )}
              </button>
            </Tooltip>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={t('Attach')} tooltip={false} size="xs">
                <Paperclip />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end">
              <DropdownMenuItem icon={<FileText />} onSelect={() => void pickFiles().then((p) => addPaths(p))}>
                {t('Files…')}
              </DropdownMenuItem>
              <DropdownMenuItem icon={<ImageIcon />} onSelect={() => void pickFiles({ images: true }).then((p) => addPaths(p))}>
                {t('Images…')}
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Folder />} onSelect={() => void pickFolder(t('Attach folder')).then((p) => p && addPaths([p], 'folder'))}>
                {t('Folder…')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                icon={<ImageIcon />}
                onSelect={() => {
                  if (!('clipboard' in navigator) || !('read' in navigator.clipboard)) return;
                  void navigator.clipboard
                    .read()
                    .then(async (items) => {
                      for (const it of items) {
                        const t = it.types.find((x) => x.startsWith('image/'));
                        if (t) await addFiles([new File([await it.getType(t)], 'clipboard.png', { type: t })]);
                      }
                    })
                    .catch(() => toast.info(t('Nothing to paste')));
                }}
              >
                {t('Paste image from clipboard')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AnimatePresence mode="popLayout" initial={false}>
            {busy && canSend ? (
              <motion.button
                key="queue"
                type="button"
                aria-label={t('Add to queue')}
                title={t('Add to queue (Enter or Alt+Enter while the agent works)')}
                onClick={enqueue}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.1 } }}
                transition={springs.snappy}
                className="mr-1 inline-flex h-6 items-center gap-1 rounded-full bg-accent-soft px-2 text-[11.5px] font-medium text-accent hover:brightness-95"
              >
                <ListPlus className="size-[12px]" /> {t('Queue')}
              </motion.button>
            ) : null}
            {busy ? (
              <motion.button
                key="stop"
                type="button"
                aria-label={t('Stop')}
                onClick={stop}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.1 } }}
                transition={springs.snappy}
                className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-inverse transition-opacity hover:opacity-85"
              >
                <Square className="size-[9px]" fill="currentColor" />
              </motion.button>
            ) : (
              <motion.button
                key="send"
                type="button"
                aria-label={t('Send')}
                disabled={!canSend}
                onClick={send}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.1 } }}
                transition={springs.snappy}
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-full transition-[background-color,color] duration-(--motion-normal) ease-(--ease-out)',
                  canSend ? 'bg-primary text-inverse hover:opacity-85' : 'bg-surface-inset text-muted',
                )}
              >
                <ArrowUp className="size-[13px]" strokeWidth={2.4} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {dragging ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: easings.out }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent-soft font-mono text-[12.5px] text-accent backdrop-blur-[2px]"
          >
            {t('Drop files to attach')}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="hairline-b h-px w-full" />
    </div>
  );
});

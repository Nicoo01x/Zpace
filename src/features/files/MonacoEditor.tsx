import { useEffect, useRef, useState } from 'react';
import { Editor, type OnMount } from '@monaco-editor/react';
import { Copy, Scissors, ClipboardPaste, TextSelect, Command, TerminalSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Tooltip } from '@/components/ui/Tooltip';
import { springs } from '@/lib/motion';
import { monaco } from './monaco';
import { wireEditorZoom, addZoomReset } from './editor-zoom';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { ClaudeLogo, AgentLogo } from '@/features/agent/BrandIcon';
import { AGENT_KINDS, AGENT_LABEL, type AgentKind } from '@/features/agent/agents';
import { useEnvironment } from '@/stores/environment';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';
import { uid } from '@/lib/id';
import { engineById } from '@/features/browser/engines';
import { EngineLogo } from '@/features/browser/EngineLogo';
import { t } from '@/i18n';
import { copied } from '@/stores/clips';
import { readClipboardText } from '@/lib/clipboard';

export interface EditorSelection {
  code: string;
  startLine: number;
  endLine: number;
  /** end of the selection, viewport px */
  anchor: { x: number; y: number };
}

export default function MonacoEditor({
  value,
  onChange,
  language,
  readOnly,
  theme,
  onAskClaude,
  onOpenInAgent,
  addedLines,
  onSelectionChange,
  revealLine,
  findPath,
  notedLines,
  revealNonce,
  wrap,
}: {
  value: string;
  onChange: (v: string) => void;
  language: string;
  readOnly: boolean;
  theme: 'conduit-light' | 'conduit-dark';
  /** Right-click → "Ask Claude about this code": the selection (or the current line). */
  onAskClaude?: (sel: EditorSelection) => void;
  /** Right-click → "Open in <agent>" with the selection as the first prompt. */
  onOpenInAgent?: (agent: AgentKind, sel: EditorSelection) => void;
  /** 1-based inclusive line ranges an agent added: painted green with a gutter bar. */
  addedLines?: Array<[number, number]>;
  /** The selection, a beat after it settles (null when it collapses) — the chat beside offers it as a chip. */
  onSelectionChange?: (sel: EditorSelection | null) => void;
  /** Scroll to and highlight this line (1-based) on mount and whenever it changes. */
  revealLine?: number;
  /** The file this editor shows, so the header's magnifier finds the right editor. */
  findPath?: string;
  /** Lines carrying margin notes: a mark in the gutter and a faint tint. */
  notedLines?: Array<[number, number]>;
  /** Bumps to reveal `revealLine` again even when the number did not change. */
  revealNonce?: number;
  /** Soft-wrap long lines (prose: a skill, a prompt, a memory file). */
  wrap?: boolean;
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const env = useEnvironment((s) => s.report);
  const defaultAgent = useSettings((s) => s.defaultAgent);
  const engine = engineById(useSettings((s) => s.browser.searchEngine));
  const [selText, setSelText] = useState('');
  /** The floating bar over a selection: where it goes (editor-relative px) and what is selected. */
  const [bar, setBar] = useState<{ x: number; y: number; text: string } | null>(null);
  /** A bar action folds the bar away first. */
  const act = (fn: () => void) => {
    setBar(null);
    fn();
  };
  const searchWeb = (text = selText) => {
    const q = text.trim();
    if (!q) return;
    const ui = useUI.getState();
    ui.splitPane(ui.activePaneId, 'horizontal', { kind: 'browser', browserId: uid('web'), url: engine.query.replace('%s', encodeURIComponent(q)) });
  };
  const found = (a: AgentKind) => (a === 'claude' ? true : (env?.[a]?.found ?? false));
  const agentOrder: AgentKind[] = [defaultAgent, ...AGENT_KINDS.filter((a) => a !== defaultAgent)];
  const grabRef = useRef<() => EditorSelection>(() => ({ code: '', startLine: 1, endLine: 1, anchor: { x: 0, y: 0 } }));
  const trigger = (action: string) => {
    editorRef.current?.trigger('conduit', action, null);
    if (action === 'editor.action.clipboardCopyAction' || action === 'editor.action.clipboardCutAction') {
      const ed = editorRef.current;
      const sel = ed?.getSelection();
      const text = sel && ed ? ed.getModel()?.getValueInRange(sel) : '';
      if (text) copied(text);
    }
  };
  /** Set while the command palette is about to open, so the closing menu does not refocus the editor over it. */
  const paletteRef = useRef(false);
  const paste = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const text = await readClipboardText();
      const sel = editor.getSelection();
      if (sel) editor.executeEdits('conduit', [{ range: sel, text, forceMoveMarkers: true }]);
      editor.focus();
    } catch {
      /* clipboard unavailable */
    }
  };
  const addedRef = useRef<ReturnType<Parameters<OnMount>[0]['createDecorationsCollection']> | null>(null);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    addedRef.current ??= editor.createDecorationsCollection();
    addedRef.current.set(
      (addedLines ?? []).map(([a, b]) => ({
        range: new monaco.Range(a, 1, b, 1),
        options: {
          isWholeLine: true,
          className: 'conduit-added-line',
          linesDecorationsClassName: 'conduit-added-gutter',
          overviewRuler: { color: 'rgba(44,138,85,0.8)', position: monaco.editor.OverviewRulerLane.Left },
          minimap: { color: 'rgba(44,138,85,0.8)', position: monaco.editor.MinimapPosition.Gutter },
        },
      })),
    );
  }, [addedLines, value]);
  // A search hit: centre the line and put the cursor there (once the content is in) — once per request, never again on later edits.
  const revealRef = useRef<number | undefined>(revealLine);
  const revealedRef = useRef<string | null>(null);
  useEffect(() => {
    revealRef.current = revealLine;
    const editor = editorRef.current;
    if (!editor || !revealLine || !value) return;
    const key = `${revealLine}:${revealNonce ?? 0}`;
    if (revealedRef.current === key) return;
    revealedRef.current = key;
    editor.revealLineInCenter(revealLine);
    editor.setPosition({ lineNumber: revealLine, column: 1 });
    editor.focus();
  }, [revealLine, revealNonce, value]);
  const notedRef = useRef<ReturnType<Parameters<OnMount>[0]['createDecorationsCollection']> | null>(null);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    notedRef.current ??= editor.createDecorationsCollection();
    notedRef.current.set(
      (notedLines ?? []).map(([a, b]) => ({
        range: new monaco.Range(a, 1, b, 1),
        options: { isWholeLine: true, className: 'conduit-noted-line', linesDecorationsClassName: 'conduit-noted-gutter', overviewRuler: { color: 'rgba(63,130,246,0.7)', position: monaco.editor.OverviewRulerLane.Right } },
      })),
    );
  }, [notedLines, value]);
  // The pane header's magnifier: Monaco's own find widget.
  useEffect(() => {
    const onFind = (e: Event) => {
      const want = (e as CustomEvent<{ path: string }>).detail.path;
      if (findPath && want.toLowerCase() !== findPath.toLowerCase()) return;
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const action = editor.getAction('actions.find');
      if (action) void action.run();
      else trigger('actions.find');
    };
    window.addEventListener('conduit:file-find', onFind);
    return () => window.removeEventListener('conduit:file-find', onFind);
  });
  const selRef = useRef(onSelectionChange);
  useEffect(() => {
    selRef.current = onSelectionChange;
  });
  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    wireEditorZoom();
    addZoomReset(editor);
    if (revealRef.current) {
      const line = revealRef.current;
      window.setTimeout(() => {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.focus();
      }, 30);
    }
    let timer: number | undefined;
    // The bar sits just above the first selected line (below the last one when there is no room), and follows scrolling.
    const placeBar = () => {
      const sel = editor.getSelection();
      const model = editor.getModel();
      const text = sel && model && !sel.isEmpty() ? model.getValueInRange(sel) : '';
      if (!text.trim()) {
        setBar(null);
        return;
      }
      const start = editor.getScrolledVisiblePosition(sel!.getStartPosition());
      const end = editor.getScrolledVisiblePosition(sel!.getEndPosition());
      const layout = editor.getLayoutInfo();
      if (!start || !end) {
        setBar(null);
        return;
      }
      const above = start.top >= 44;
      const y = above ? start.top - 38 : end.top + end.height + 6;
      if (y < 0 || y > layout.height - 30) {
        setBar(null);
        return;
      }
      const x = Math.max(8, Math.min((above ? start.left : end.left) + 4, layout.width - 320));
      setBar({ x, y, text });
    };
    editor.onDidChangeCursorSelection(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const sel = editor.getSelection();
        if (!sel || sel.isEmpty()) selRef.current?.(null);
        else selRef.current?.(grabRef.current());
        placeBar();
      }, 180);
    });
    editor.onDidScrollChange(() => placeBar());
    editor.onDidChangeModelContent(() => setBar(null));
    // Paint what was known before the editor existed.
    if (addedLines?.length) {
      addedRef.current = editor.createDecorationsCollection(
        addedLines.map(([a, b]) => ({ range: new monaco.Range(a, 1, b, 1), options: { isWholeLine: true, className: 'conduit-added-line', linesDecorationsClassName: 'conduit-added-gutter' } })),
      );
    }
    const grab = (): EditorSelection => {
      const model = editor.getModel();
      let sel = editor.getSelection();
      if (!model || !sel) return { code: '', startLine: 1, endLine: 1, anchor: { x: 0, y: 0 } };
      if (sel.isEmpty()) {
        const line = sel.startLineNumber;
        sel = sel.setStartPosition(line, 1).setEndPosition(line, model.getLineMaxColumn(line));
      }
      const end = sel.getEndPosition();
      const vis = editor.getScrolledVisiblePosition(end);
      const box = editor.getDomNode()?.getBoundingClientRect();
      return {
        code: model.getValueInRange(sel),
        startLine: sel.startLineNumber,
        endLine: sel.endLineNumber,
        anchor: { x: (box?.left ?? 0) + (vis?.left ?? 0), y: (box?.top ?? 0) + (vis?.top ?? 0) + (vis?.height ?? 18) },
      };
    };
    grabRef.current = grab;
    // Ctrl/⌘ K still asks Claude; the menu itself is ours (see below) so it can carry the marks.
    editor.addAction({
      id: 'conduit.askClaude',
      label: 'Ask Claude about this code',
      keybindings: [2048 | 41 /* Ctrl/Cmd+K */],
      run: () => onAskClaude?.(grab()),
    });
  };
  return (
    <ContextMenu onOpenChange={(o) => { if (o) setSelText(editorRef.current?.getModel()?.getValueInRange(editorRef.current.getSelection()!) ?? ''); }}>
      <ContextMenuTrigger asChild>
        <div className="relative h-full w-full">
          <AnimatePresence>
            {bar ? (
              <motion.div
                key="selection-bar"
                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97, transition: { duration: 0.1 } }}
                transition={springs.snappy}
                onMouseDown={(e) => e.preventDefault()}
                style={{ left: bar.x, top: bar.y }}
                className="absolute z-20 flex h-8 items-center gap-0.5 rounded-lg bg-surface-raised p-1 shadow-popover"
              >
                <Tooltip content={t('Ask Claude about this code')} shortcut="mod+k" side="top">
                  <button type="button" onClick={() => act(() => onAskClaude?.(grabRef.current()))} className="inline-flex h-6 items-center gap-1.5 rounded-md bg-claude-soft px-2 text-[12px] font-medium text-claude hover:brightness-95">
                    <ClaudeLogo size={13} /> {t('Ask')}
                  </button>
                </Tooltip>
                {/* Claude Code as a terminal is a terminal glyph — a second Claude mark next to "Ask" read as the same thing. */}
                <Tooltip content={t('Open in Claude Code (terminal) with this code')} side="top">
                  <button type="button" onClick={() => act(() => onOpenInAgent?.('claude', grabRef.current()))} className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-secondary hover:bg-surface-hover hover:text-primary">
                    <TerminalSquare className="size-[13px]" />
                  </button>
                </Tooltip>
                {agentOrder
                  .filter((a) => a !== 'claude' && found(a))
                  .map((a) => (
                    <Tooltip key={a} content={t('Open in {agent} with this code', { agent: AGENT_LABEL[a] })} side="top">
                      <button type="button" onClick={() => act(() => onOpenInAgent?.(a, grabRef.current()))} className="inline-flex size-6 items-center justify-center rounded-md hover:bg-surface-hover">
                        <AgentLogo agent={a} size={13} />
                      </button>
                    </Tooltip>
                  ))}
                <span className="mx-0.5 h-4 w-px bg-border" />
                <Tooltip content={t('Search on {engine}', { engine: engine.label })} side="top">
                  <button
                    type="button"
                    onClick={() => act(() => searchWeb(bar.text))}
                    className="inline-flex size-6 items-center justify-center rounded-md hover:bg-surface-hover"
                  >
                    <EngineLogo engine={engine} size={13} />
                  </button>
                </Tooltip>
                <Tooltip content={t('Copy')} shortcut="mod+c" side="top">
                  <button type="button" onClick={() => trigger('editor.action.clipboardCopyAction')} className="inline-flex size-6 items-center justify-center rounded-md text-secondary hover:bg-surface-hover hover:text-primary">
                    <Copy className="size-[13px]" />
                  </button>
                </Tooltip>
                {!readOnly ? (
                  <Tooltip content={t('Cut')} shortcut="mod+x" side="top">
                    <button type="button" onClick={() => trigger('editor.action.clipboardCutAction')} className="inline-flex size-6 items-center justify-center rounded-md text-secondary hover:bg-surface-hover hover:text-primary">
                      <Scissors className="size-[13px]" />
                    </button>
                  </Tooltip>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <Editor
      onMount={onMount}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      language={language}
      theme={theme}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace',
        fontSize: 12.5,
        lineHeight: 20,
        scrollBeyondLastLine: false,
        renderLineHighlight: 'line',
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
        wordWrap: wrap ? 'on' : 'off',
        glyphMargin: false,
        folding: true,
        lineNumbersMinChars: 3,
        padding: { top: 8, bottom: 8 },
        automaticLayout: true,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        renderWhitespace: 'selection',
        contextmenu: false,
        mouseWheelZoom: true,
      }}
    />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="min-w-[300px]"
        onCloseAutoFocus={(e) => {
          // The menu unmounts after its exit animation; giving the editor the focus then would close a quick input opened meanwhile.
          e.preventDefault();
          if (!paletteRef.current) editorRef.current?.focus();
        }}
      >
        <ContextMenuItem icon={<ClaudeLogo />} shortcut="mod+k" onSelect={() => onAskClaude?.(grabRef.current())}>
          {t('Ask Claude about this code')}
        </ContextMenuItem>
        {agentOrder.filter(found).map((a) => (
          <ContextMenuItem key={a} icon={a === 'claude' ? <TerminalSquare /> : <AgentLogo agent={a} />} onSelect={() => onOpenInAgent?.(a, grabRef.current())}>
            {a === 'claude' ? t('Open in Claude Code (terminal) with this code') : t('Open in {agent} with this code', { agent: AGENT_LABEL[a] })}
          </ContextMenuItem>
        ))}
        {selText.trim() ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem icon={<EngineLogo engine={engine} size={14} />} onSelect={() => searchWeb()}>
              {t('Search “{q}” on {engine}', { q: selText.trim().length > 28 ? selText.trim().slice(0, 28) + '…' : selText.trim(), engine: engine.label })}
            </ContextMenuItem>
          </>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Scissors />} shortcut="mod+x" disabled={readOnly} onSelect={() => trigger('editor.action.clipboardCutAction')}>
          {t('Cut')}
        </ContextMenuItem>
        <ContextMenuItem icon={<Copy />} shortcut="mod+c" onSelect={() => trigger('editor.action.clipboardCopyAction')}>
          {t('Copy')}
        </ContextMenuItem>
        <ContextMenuItem icon={<ClipboardPaste />} shortcut="mod+v" disabled={readOnly} onSelect={() => void paste()}>
          {t('Paste')}
        </ContextMenuItem>
        <ContextMenuItem icon={<TextSelect />} shortcut="mod+a" onSelect={() => trigger('editor.action.selectAll')}>
          {t('Select all')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={<Command />}
          shortcut="F1"
          onSelect={() => {
            // Monaco hides its quick input the moment the editor blurs: open it once the menu is gone for good (exit animation included).
            paletteRef.current = true;
            window.setTimeout(() => {
              paletteRef.current = false;
              const editor = editorRef.current;
              if (!editor) return;
              editor.focus();
              const action = editor.getAction('editor.action.quickCommand');
              if (action) void action.run();
              else trigger('editor.action.quickCommand');
            }, 320);
          }}
        >
          {t('Command palette')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

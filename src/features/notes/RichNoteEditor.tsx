import { useEffect, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { Bold, Italic, Underline, Strikethrough, Highlighter, Code, Heading1, Heading2, List, ListOrdered, ListChecks, Quote } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/i18n';

/**
 * The default note editor: plain text that formats on demand. Select some
 * text and a Discord-style bubble appears above it — bold, italic, underline,
 * strike, highlight, code, headings, lists, checklist, quote. Markdown
 * shortcuts work while typing (`**bold**`, `# `, `- `, `[ ] `), and the note
 * is stored as Markdown, so previews, search and export keep working.
 */
export function RichNoteEditor({ value, onChange, onSave, focused, placeholder = 'Write…' }: { value: string; onChange: (markdown: string) => void; onSave?: () => void; focused: boolean; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Markdown,
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'note-rich prose-agent prose-note selectable outline-none', spellcheck: 'false' },
      handleKeyDown: (_view, e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          onSave?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getMarkdown()),
  });

  useEffect(() => {
    if (focused && editor && !editor.isFocused) editor.commands.focus('end');
    // Only when the pane gains focus; the editor keeps its own caret otherwise.
  }, [focused, editor]);

  if (!editor) return null;
  return (
    <div className="relative h-full min-h-0 overflow-y-auto px-(--content-padding) pb-10">
      <FormatBubble editor={editor} />
      <EditorContent editor={editor} className="min-h-full" />
    </div>
  );
}

function FormatBubble({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      highlight: ed.isActive('highlight'),
      code: ed.isActive('code'),
      h1: ed.isActive('heading', { level: 1 }),
      h2: ed.isActive('heading', { level: 2 }),
      bullet: ed.isActive('bulletList'),
      ordered: ed.isActive('orderedList'),
      task: ed.isActive('taskList'),
      quote: ed.isActive('blockquote'),
    }),
  });
  const c = () => editor.chain().focus();
  return (
    <BubbleMenu editor={editor} updateDelay={80} options={{ placement: 'top', offset: 8 }} className="note-bubble">
      <div className="flex items-center gap-0.5 rounded-[10px] bg-[var(--text-primary)] p-1 text-inverse shadow-[0_8px_28px_rgba(0,0,0,0.28),0_1px_3px_rgba(0,0,0,0.2)]">
        <Btn label={t('Bold')} shortcut="mod+b" active={state.bold} onClick={() => c().toggleBold().run()}>
          <Bold />
        </Btn>
        <Btn label={t('Italic')} shortcut="mod+i" active={state.italic} onClick={() => c().toggleItalic().run()}>
          <Italic />
        </Btn>
        <Btn label={t('Underline')} shortcut="mod+u" active={state.underline} onClick={() => c().toggleUnderline().run()}>
          <Underline />
        </Btn>
        <Btn label={t('Strikethrough')} shortcut="mod+shift+s" active={state.strike} onClick={() => c().toggleStrike().run()}>
          <Strikethrough />
        </Btn>
        <Btn label={t('Highlight')} shortcut="mod+shift+h" active={state.highlight} onClick={() => c().toggleHighlight().run()}>
          <Highlighter />
        </Btn>
        <Btn label={t('Code')} shortcut="mod+e" active={state.code} onClick={() => c().toggleCode().run()}>
          <Code />
        </Btn>
        <span className="mx-0.5 h-4 w-px bg-white/20" />
        <Btn label={t('Heading 1')} active={state.h1} onClick={() => c().toggleHeading({ level: 1 }).run()}>
          <Heading1 />
        </Btn>
        <Btn label={t('Heading 2')} active={state.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
          <Heading2 />
        </Btn>
        <Btn label={t('Bullet list')} active={state.bullet} onClick={() => c().toggleBulletList().run()}>
          <List />
        </Btn>
        <Btn label={t('Numbered list')} active={state.ordered} onClick={() => c().toggleOrderedList().run()}>
          <ListOrdered />
        </Btn>
        <Btn label={t('Checklist')} active={state.task} onClick={() => c().toggleTaskList().run()}>
          <ListChecks />
        </Btn>
        <Btn label={t('Quote')} active={state.quote} onClick={() => c().toggleBlockquote().run()}>
          <Quote />
        </Btn>
      </div>
    </BubbleMenu>
  );
}

function Btn({ label, shortcut, active, onClick, children }: { label: string; shortcut?: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip content={label} shortcut={shortcut} side="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-md transition-colors duration-(--motion-fast) [&>svg]:size-[15px]',
          active ? 'bg-white/22 text-white' : 'text-white/75 hover:bg-white/12 hover:text-white',
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

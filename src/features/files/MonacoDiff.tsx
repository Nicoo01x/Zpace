import { useEffect, useRef } from 'react';
import { wireEditorZoom, addZoomReset } from './editor-zoom';
import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import './monaco';

export default function MonacoDiff({
  original,
  modified,
  language,
  inline,
  theme,
}: {
  original: string;
  modified: string;
  language: string;
  inline: boolean;
  theme: 'conduit-light' | 'conduit-dark';
}) {
  // The wrapper library disposes the two text models before the widget lets go of them, which Monaco reports
  // as "TextModel got disposed before DiffEditorWidget model got reset": detach the models first.
  const editorRef = useRef<Parameters<DiffOnMount>[0] | null>(null);
  useEffect(
    () => () => {
      try {
        editorRef.current?.setModel(null);
      } catch {
        /* already gone */
      }
    },
    [],
  );
  return (
    <DiffEditor
      onMount={(editor) => {
        editorRef.current = editor;
        wireEditorZoom();
        addZoomReset(editor);
      }}
      original={original}
      modified={modified}
      language={language}
      theme={theme}
      options={{
        readOnly: true,
        renderSideBySide: !inline,
        renderOverviewRuler: false,
        minimap: { enabled: false },
        fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace',
        fontSize: 12.5,
        lineHeight: 20,
        scrollBeyondLastLine: false,
        renderLineHighlight: 'none',
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
        diffWordWrap: 'on',
        ignoreTrimWhitespace: false,
        glyphMargin: false,
        folding: false,
        lineNumbersMinChars: 3,
        padding: { top: 8, bottom: 8 },
        automaticLayout: true,
        mouseWheelZoom: true,
      }}
    />
  );
}

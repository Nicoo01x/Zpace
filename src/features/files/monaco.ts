import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import { useUI } from '@/stores/ui';
import { uid } from '@/lib/id';

/**
 * Bundle Monaco locally (no CDN — this is a desktop app) and register the
 * two editor themes that follow the design tokens.
 */

self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

// Ctrl/⌘+click on a URL in code opens Zpace's own browser beside the file
// (Monaco's default is window.open, which the webview turns into a bare popup).
monaco.editor.registerLinkOpener({
  open(resource) {
    const url = resource.toString(true);
    if (!/^https?:\/\//i.test(url)) return false;
    const ui = useUI.getState();
    ui.splitPane(ui.activePaneId, 'horizontal', { kind: 'browser', browserId: uid('web'), url });
    return true;
  },
});

monaco.editor.defineTheme('conduit-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '9c9ca1', fontStyle: 'italic' },
    { token: 'keyword', foreground: '7a3e9d' },
    { token: 'string', foreground: '2a7f4f' },
    { token: 'number', foreground: 'a86f14' },
    { token: 'type', foreground: '3567c6' },
  ],
  colors: {
    'editor.background': '#fbfbfa',
    'editor.foreground': '#1d1d1f',
    'editor.lineHighlightBackground': '#00000006',
    'editorLineNumber.foreground': '#b5b5ba',
    'editorLineNumber.activeForeground': '#6e6e73',
    'editor.selectionBackground': '#5865e02e',
    'diffEditor.insertedTextBackground': '#2c8a5526',
    'diffEditor.removedTextBackground': '#d4443b24',
    'diffEditor.insertedLineBackground': '#2c8a5514',
    'diffEditor.removedLineBackground': '#d4443b12',
    'scrollbarSlider.background': '#00000018',
    'scrollbarSlider.hoverBackground': '#00000028',
    'editorGutter.background': '#fbfbfa',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#00000014',
  },
});

monaco.editor.defineTheme('conduit-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6e6e73', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c98be0' },
    { token: 'string', foreground: '7ee0a5' },
    { token: 'number', foreground: 'f0c465' },
    { token: 'type', foreground: '9dbcf7' },
  ],
  colors: {
    'editor.background': '#141414',
    'editor.foreground': '#e8e8e8',
    'editor.lineHighlightBackground': '#ffffff08',
    'editorLineNumber.foreground': '#4a4a4e',
    'editorLineNumber.activeForeground': '#a1a1a6',
    'editor.selectionBackground': '#7c86f03a',
    'diffEditor.insertedTextBackground': '#5dc98a2a',
    'diffEditor.removedTextBackground': '#f0716728',
    'diffEditor.insertedLineBackground': '#5dc98a14',
    'diffEditor.removedLineBackground': '#f0716714',
    'scrollbarSlider.background': '#ffffff18',
    'scrollbarSlider.hoverBackground': '#ffffff28',
    'editorGutter.background': '#141414',
    'editorWidget.background': '#1c1c1c',
    'editorWidget.border': '#ffffff14',
  },
});

export { monaco };

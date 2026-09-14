import { monaco } from './monaco';
import { useSettings } from '@/stores/settings';

/**
 * Ctrl + wheel (and Ctrl + / Ctrl −) zoom the code in every Monaco editor
 * at once — Monaco keeps one zoom level for all of them. The level is saved
 * in the settings so the size you left is the size you get back; Ctrl+0 in
 * an editor puts it back to normal.
 */
let wired = false;

export function wireEditorZoom() {
  if (wired) return;
  wired = true;
  const saved = useSettings.getState().editorZoom;
  if (saved) monaco.editor.EditorZoom.setZoomLevel(saved);
  let timer: number | undefined;
  monaco.editor.EditorZoom.onDidChangeZoomLevel((level) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (useSettings.getState().editorZoom !== level) useSettings.getState().set('editorZoom', level);
    }, 250);
  });
}

/** Ctrl+0 → back to the normal size (Monaco's own reset lives on the numpad). */
export function addZoomReset(editor: monaco.editor.IStandaloneCodeEditor | monaco.editor.IStandaloneDiffEditor) {
  const target = 'getModifiedEditor' in editor ? editor.getModifiedEditor() : editor;
  target.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, () => monaco.editor.EditorZoom.setZoomLevel(0));
}

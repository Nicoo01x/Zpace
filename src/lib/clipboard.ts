import { invoke, isTauri } from '@/native/bridge';

/**
 * The clipboard, the way that works in a WebView2 window. The async
 * `navigator.clipboard` API is tied to focus and to a permission the webview
 * does not always grant, and it fails silently; the OS clipboard through Rust
 * (`arboard`) does not care who has focus. Native first, then the web API,
 * then the old `execCommand` as the last resort for text.
 */
export async function copyText(text: string): Promise<boolean> {
  if (isTauri) {
    try {
      await invoke('clipboard_write_text', { text });
      return true;
    } catch {
      /* an older binary without the command: fall through */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* no focus or no permission: fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** The clipboard's text, '' when there is none or it cannot be read. */
export async function readClipboardText(): Promise<string> {
  if (isTauri) {
    try {
      return await invoke<string>('clipboard_read_text');
    } catch {
      /* fall through */
    }
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

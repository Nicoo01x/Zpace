import type { EnvironmentReport, GitSummary } from '@/types/workspace';
import type { AssetInfo } from '@/stores/capabilities';
import { invoke, isTauri } from './bridge';
import { platform } from '@/lib/platform';

/** Detect Claude Code, git, node, WSL distros and available shells. */
export async function detectEnvironment(): Promise<EnvironmentReport> {
  if (!isTauri) {
    // Browser preview: plausible Windows machine.
    return {
      platform,
      claude: { found: true, version: '2.1.269 (Claude Code)', path: 'C:\\Users\\dev\\.local\\bin\\claude.exe' },
      git: { found: true, version: 'git version 2.50.0.windows.2', path: 'C:\\Program Files\\Git\\cmd\\git.exe' },
      node: { found: true, version: 'v24.19.0', path: 'C:\\Program Files\\nodejs\\node.exe' },
      wsl: { available: true, distros: ['Ubuntu', 'Debian'], default: 'Ubuntu' },
      shells: [
        { id: 'pwsh', kind: 'pwsh', label: 'PowerShell 7', path: 'pwsh.exe', args: ['-NoLogo'] },
        { id: 'powershell', kind: 'powershell', label: 'Windows PowerShell', path: 'powershell.exe', args: ['-NoLogo'] },
        { id: 'cmd', kind: 'cmd', label: 'Command Prompt', path: 'cmd.exe', args: [] },
        { id: 'gitbash', kind: 'gitbash', label: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['--login', '-i'] },
        { id: 'wsl:Ubuntu', kind: 'wsl', label: 'WSL · Ubuntu', path: 'wsl.exe', args: ['-d', 'Ubuntu'], distro: 'Ubuntu' },
        { id: 'wsl:Debian', kind: 'wsl', label: 'WSL · Debian', path: 'wsl.exe', args: ['-d', 'Debian'], distro: 'Debian' },
      ],
    };
  }
  return invoke<EnvironmentReport>('detect_environment');
}

export async function gitSummary(path: string): Promise<GitSummary | null> {
  if (!isTauri) return null;
  try {
    return await invoke<GitSummary>('git_summary', { path });
  } catch {
    return null;
  }
}

/** C:\Users\me\proj  →  /mnt/c/Users/me/proj */
export function toWslPath(winPath: string): string {
  const m = /^([a-zA-Z]):[\\/](.*)$/.exec(winPath);
  if (!m) return winPath.replace(/\\/g, '/');
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}

/** /mnt/c/Users/me/proj  →  C:\Users\me\proj */
export function fromWslPath(wslPath: string): string {
  const m = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(wslPath);
  if (!m) return wslPath;
  return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
}

/** `defaultPath` opens the picker inside that folder (a project, when choosing one of its sub-folders). */
export async function pickFolder(title = 'Open project', defaultPath?: string): Promise<string | null> {
  if (!isTauri) {
    // Browser preview: fake a folder pick.
    const name = window.prompt('Folder path (browser preview)', defaultPath ?? 'C:\\Users\\dev\\projects\\new-project');
    return name || null;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const res = await open({ directory: true, multiple: false, title, defaultPath });
  return typeof res === 'string' ? res : null;
}

export async function pickFiles(opts: { images?: boolean } = {}): Promise<string[]> {
  if (!isTauri) return [];
  const { open } = await import('@tauri-apps/plugin-dialog');
  const res = await open({
    multiple: true,
    filters: opts.images ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] : undefined,
  });
  if (!res) return [];
  return Array.isArray(res) ? res : [res];
}

export async function revealInFileManager(path: string): Promise<void> {
  if (!isTauri) return;
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}

export async function openPath(path: string): Promise<void> {
  if (!isTauri) return;
  const { openPath: op } = await import('@tauri-apps/plugin-opener');
  await op(path);
}

/** A page of Windows Settings (`privacy-speech`, `privacy-microphone`, …): the `ms-settings:` scheme through the shell. */
export async function openWindowsSettings(page: string): Promise<void> {
  const uri = `ms-settings:${page}`;
  try {
    await openUrl(uri);
  } catch {
    // The opener's URL scope is for the web; as a "path" the shell resolves the scheme itself.
    await openPath(uri);
  }
}

export async function openUrl(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const { openUrl: ou } = await import('@tauri-apps/plugin-opener');
  await ou(url);
}

export async function nativeNotify(title: string, body?: string): Promise<void> {
  if (!isTauri) {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
    return;
  }
  const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === 'granted';
  if (granted) sendNotification({ title, body });
}

export async function isWindowFocused(): Promise<boolean> {
  if (!isTauri) return document.hasFocus();
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow().isFocused();
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path, maxBytes: 4_000_000 });
}

export interface ClaudeUsage {
  subscription?: string;
  tier?: string;
  windows: Array<{ kind: string; utilization: number; resetsAt?: number }>;
  fetchedAt: number;
}

/** The plan's real limits, from Anthropic's usage endpoint with Claude Code's own login. */
export async function claudeUsage(): Promise<ClaudeUsage> {
  return invoke<ClaudeUsage>('claude_usage');
}

/** URL the webview can load the file from (Tauri's asset protocol; a plain path outside Tauri). */
export async function fileSrc(path: string): Promise<string> {
  if (!isTauri) return path;
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  return convertFileSrc(path);
}

/** The first bytes of any file (base64) and its size — for the hex view of binaries. */
export async function readFileHead(path: string, maxBytes = 4096): Promise<{ size: number; base64: string }> {
  return invoke<{ size: number; base64: string }>('read_file_head', { path, maxBytes });
}

export async function createFile(path: string): Promise<void> {
  await invoke('create_file', { path });
}
export async function createDir(path: string): Promise<void> {
  await invoke('create_dir', { path });
}
export async function renamePath(from: string, to: string): Promise<void> {
  await invoke('rename_path', { from, to });
}
/** Recycle Bin / Trash, never a hard delete. */
export async function trashPath(path: string): Promise<void> {
  await invoke('trash_path', { path });
}

/** Copy a file; parents of the target are created, an existing target is replaced. Returns the bytes copied. */
export async function copyFile(from: string, to: string): Promise<number> {
  if (!isTauri) return 0;
  return invoke<number>('copy_file', { from, to });
}

/** The app's data folder (`%APPDATA%/dev.conduit.app` on Windows), no trailing separator. */
export async function appDataDir(): Promise<string> {
  const { appDataDir: d } = await import('@tauri-apps/api/path');
  return (await d()).replace(/[\\/]+$/, '');
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invoke('write_text_file', { path, contents });
}

export async function listDir(path: string): Promise<Array<{ name: string; isDir: boolean }>> {
  if (!isTauri) return [];
  return invoke<Array<{ name: string; isDir: boolean }>>('read_dir', { path });
}

/** Every file under a project root (relative, forward slashes), capped. */
export async function listProjectFiles(root: string, limit = 20_000): Promise<string[]> {
  if (!isTauri) return [];
  return invoke<string[]>('list_files', { root, limit });
}

export async function pathExists(path: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('path_exists', { path });
}

export async function openDevTools(): Promise<void> {
  if (!isTauri) return;
  await invoke('open_devtools');
}

const BACKSLASH = String.fromCharCode(92);

/** Windows drive-letter or POSIX absolute path? */
export function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith(BACKSLASH + BACKSLASH);
}

/** Join a project root and a relative path using the root's separator style. */
export function joinPath(root: string, rel: string): string {
  const sep = root.includes(BACKSLASH) ? BACKSLASH : '/';
  const trimmedRoot = root.replace(/[\\/]+$/, '');
  const trimmedRel = rel.replace(/^[\\/]+/, '').split(/[\\/]/).join(sep);
  return `${trimmedRoot}${sep}${trimmedRel}`;
}


/** Skills, custom commands and subagents available to Claude Code (user, project, plugins). */
export async function scanAgentAssets(project?: string): Promise<{ skills: AssetInfo[]; commands: AssetInfo[]; agents: AssetInfo[] }> {
  if (!isTauri) return { skills: [], commands: [], agents: [] };
  return invoke('scan_agent_assets', { project: project ?? null });
}

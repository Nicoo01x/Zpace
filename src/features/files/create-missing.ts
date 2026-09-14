import { createFile, createDir, joinPath } from '@/native/system';
import { useExplorer } from './explorer-store';
import { toast } from '@/features/notifications/toast-store';
import { dirname } from '@/lib/format';
import { t } from '@/i18n';

/** Does the query look like a path to create (a name with an extension, or a folder with a trailing slash)? */
export function creatableName(q: string): { rel: string; dir: boolean } | null {
  const s = q.trim().replace(/^[./\\]+/, '');
  if (!s || /[:*?"<>|]/.test(s)) return null;
  if (/[/\\]$/.test(s)) return { rel: s.replace(/[/\\]+$/, ''), dir: true };
  if (/\.[A-Za-z0-9]{1,8}$/.test(s)) return { rel: s, dir: false };
  return null;
}

/** Create the file or folder under the project root; files open right away. */
export async function createMissing(projectPath: string, rel: string, dir: boolean, openFile?: (path: string) => void): Promise<void> {
  const sep = projectPath.includes('\\') ? '\\' : '/';
  const target = joinPath(projectPath, rel.split(/[/\\]/).join(sep));
  try {
    if (dir) await createDir(target);
    else await createFile(target);
    useExplorer.getState().bump(dirname(target));
    toast.success(dir ? t('Folder created') : t('File created'), { description: rel, origin: null });
    if (!dir) openFile?.(target);
  } catch (e) {
    toast.error(t('Could not create'), { description: e instanceof Error ? e.message : String(e), origin: null });
  }
}

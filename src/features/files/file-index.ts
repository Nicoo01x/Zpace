import { listProjectFiles } from '@/native/system';

/** Relative file list of a project, cached briefly so quick pickers open instantly. */
const cache = new Map<string, { at: number; list: string[] }>();
const inflight = new Map<string, Promise<string[]>>();
const TTL = 45_000;

export function projectFiles(projectPath: string, limit = 8000): Promise<string[]> {
  const hit = cache.get(projectPath);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.list);
  const pending = inflight.get(projectPath);
  if (pending) return pending;
  const p = listProjectFiles(projectPath, limit)
    .then((list) => {
      cache.set(projectPath, { at: Date.now(), list });
      return list;
    })
    .catch(() => hit?.list ?? [])
    .finally(() => inflight.delete(projectPath));
  inflight.set(projectPath, p);
  return p;
}

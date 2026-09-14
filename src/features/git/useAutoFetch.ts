import { useEffect } from 'react';
import { useSettings } from '@/stores/settings';
import { useProjects } from '@/stores/projects';
import { git } from '@/native/git';
import { gitSummary } from '@/native/system';
import { isTauri } from '@/lib/platform';

const INTERVAL = 5 * 60_000;

/** Every 5 minutes: `git fetch --prune` per project + refresh ahead/behind. */
export function useAutoFetch() {
  const enabled = useSettings((s) => s.git.autoFetch);
  useEffect(() => {
    if (!enabled || !isTauri) return;
    let stopped = false;
    const tick = async () => {
      for (const p of useProjects.getState().projects) {
        if (stopped) return;
        if (!p.git?.isRepo) continue;
        try {
          await git.fetch(p.path);
        } catch {
          /* offline or no remote — the summary refresh below still works */
        }
        const g = await gitSummary(p.path);
        if (g && !stopped) useProjects.getState().setGit(p.id, g);
      }
    };
    const id = window.setInterval(() => { if (!document.hidden) void tick(); }, INTERVAL);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [enabled]);
}

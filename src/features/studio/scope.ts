import { useEffect, useState } from 'react';
import { homeDir } from '@/features/mcp/mcp-config';
import { useProjects } from '@/stores/projects';
import { joinPath } from '@/native/system';
import type { Project } from '@/types/workspace';
import type { StudioScope } from '@/stores/studio';
import { scopeKey } from '@/stores/studio';
import { t } from '@/i18n';

/**
 * Where a scope keeps its things on disk. The user's Claude lives in
 * `~/.claude` (skills/, agents/, commands/, CLAUDE.md, settings.json); a
 * project's in `<project>/.claude`, with CLAUDE.md and .mcp.json at the
 * project root. `base` is the folder the builder session works in.
 */
export interface ResolvedScope {
  key: string;
  kind: 'user' | 'project';
  label: string;
  project?: Project;
  /** `~/.claude` or `<project>/.claude`. */
  root: string;
  /** `~` or the project folder. */
  base: string;
  /** Claude Code's settings file of this scope. */
  settings: string;
  /** Memory files, in the order Claude Code reads them; some may not exist yet. */
  memory: Array<{ path: string; label: string }>;
}

export async function resolveScope(scope: StudioScope): Promise<ResolvedScope | null> {
  if (scope.kind === 'user') {
    const home = await homeDir();
    const root = joinPath(home, '.claude');
    return {
      key: scopeKey(scope),
      kind: 'user',
      label: t('Your Claude'),
      root,
      base: home,
      settings: joinPath(root, 'settings.json'),
      memory: [{ path: joinPath(root, 'CLAUDE.md'), label: '~/.claude/CLAUDE.md' }],
    };
  }
  const project = useProjects.getState().projects.find((p) => p.id === scope.projectId);
  if (!project) return null;
  const base = project.path.replace(/[\\/]+$/, '');
  const root = joinPath(base, '.claude');
  return {
    key: scopeKey(scope),
    kind: 'project',
    label: project.name,
    project,
    root,
    base,
    settings: joinPath(root, 'settings.json'),
    memory: [
      { path: joinPath(base, 'CLAUDE.md'), label: 'CLAUDE.md' },
      { path: joinPath(root, 'CLAUDE.md'), label: '.claude/CLAUDE.md' },
      { path: joinPath(base, 'CLAUDE.local.md'), label: 'CLAUDE.local.md' },
    ],
  };
}

/** The resolved scope, re-read when the scope (or the project it points at) changes. */
export function useResolvedScope(scope: StudioScope): ResolvedScope | null {
  const [resolved, setResolved] = useState<ResolvedScope | null>(null);
  const projectPath = useProjects((s) => (scope.kind === 'project' ? s.projects.find((p) => p.id === scope.projectId)?.path : undefined));
  const projectName = useProjects((s) => (scope.kind === 'project' ? s.projects.find((p) => p.id === scope.projectId)?.name : undefined));
  useEffect(() => {
    let alive = true;
    void resolveScope(scope).then((r) => alive && setResolved(r));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.kind === 'project' ? scope.projectId : '', projectPath, projectName]);
  return resolved;
}

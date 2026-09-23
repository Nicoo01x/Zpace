import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCapabilities, NO_ASSETS, type AssetInfo } from '@/stores/capabilities';
import { useStudio, type StudioKind } from '@/stores/studio';
import { pathExists } from '@/native/system';
import { loadMcpEntries, transport } from '@/features/mcp/mcp-config';
import { readHooks } from './files';
import type { ResolvedScope } from './scope';

/**
 * What a scope has, per kind, as one flat list for the rail and the
 * overview. Skills, subagents and commands come from the capabilities
 * store (already scanned for the composer); memory files, MCP servers and
 * hooks are read from disk here and re-read whenever the Studio's revision
 * bumps (a session of the Studio finished a turn, something was saved).
 */
export interface StudioItem {
  id: string;
  kind: StudioKind;
  name: string;
  hint: string;
  /** Where it comes from; tagged in the list only when it says something the scope does not. */
  source: 'user' | 'project' | 'local' | 'plugin';
  sourceLabel?: string;
  /** Read-only (a plugin's file). */
  locked?: boolean;
  /** Memory files that do not exist yet are still listed, to be created. */
  missing?: boolean;
}

function assetItem(kind: StudioKind, a: AssetInfo): StudioItem {
  const plugin = a.source.startsWith('plugin:');
  return { id: a.path, kind, name: kind === 'skills' ? a.name : a.invoke.replace(/^\//, ''), hint: a.description, source: plugin ? 'plugin' : (a.source as 'user' | 'project'), sourceLabel: plugin ? a.source.slice(7) : undefined, locked: plugin };
}

export interface Catalog {
  skills: StudioItem[];
  agents: StudioItem[];
  commands: StudioItem[];
  memory: StudioItem[];
  mcp: StudioItem[];
  hooks: StudioItem[];
  loading: boolean;
}

const EMPTY: StudioItem[] = [];

export function useCatalog(scope: ResolvedScope | null): Catalog {
  const projectPath = scope?.kind === 'project' ? scope.project?.path : undefined;
  const revision = useStudio((s) => s.revision);
  const loadAssets = useCapabilities((c) => c.loadAssets);
  const assets = useCapabilities(useShallow((c) => c.assets[projectPath ?? '']?.data ?? NO_ASSETS));
  useEffect(() => {
    if (!scope) return;
    void loadAssets(projectPath, revision > 0);
  }, [scope, projectPath, revision, loadAssets]);

  const scopeKind = scope?.kind;
  const fromAssets = useMemo(() => {
    if (!scopeKind) return { skills: EMPTY, agents: EMPTY, commands: EMPTY };
    const own = (a: AssetInfo) => (scopeKind === 'project' ? a.source === 'project' : a.source === 'user' || a.source.startsWith('plugin:'));
    return {
      skills: assets.skills.filter(own).map((a) => assetItem('skills', a)),
      agents: assets.agents.filter(own).map((a) => assetItem('agents', a)),
      commands: assets.commands.filter(own).map((a) => assetItem('commands', a)),
    };
  }, [assets, scopeKind]);

  // What was read from disk, and for which scope + revision: anything else on screen is still loading.
  const diskKey = scope ? `${scope.key}:${revision}` : '';
  const [disk, setDisk] = useState<{ key: string; memory: StudioItem[]; mcp: StudioItem[]; hooks: StudioItem[] }>({ key: '', memory: EMPTY, mcp: EMPTY, hooks: EMPTY });
  useEffect(() => {
    if (!scope) return;
    let alive = true;
    void (async () => {
      const memory: StudioItem[] = [];
      for (const m of scope.memory) memory.push({ id: m.path, kind: 'memory', name: m.label, hint: m.path, source: scope.kind, missing: !(await pathExists(m.path)) });
      const entries = await loadMcpEntries(projectPath).catch(() => []);
      const mcp: StudioItem[] = entries
        .filter((e) => (scope.kind === 'user' ? e.scope === 'user' : e.scope !== 'user'))
        .map((e) => ({ id: e.name, kind: 'mcp', name: e.name, hint: transport(e.config).label, source: e.scope, sourceLabel: e.scope === 'local' ? 'local' : undefined, locked: e.scope === 'local' }));
      const rows = await readHooks(scope.settings).catch(() => []);
      const hooks: StudioItem[] = rows.map((h) => ({ id: h.id, kind: 'hooks', name: h.event + (h.matcher ? ` · ${h.matcher}` : ''), hint: h.command, source: scope.kind }));
      if (alive) setDisk({ key: diskKey, memory, mcp, hooks });
    })();
    return () => {
      alive = false;
    };
  }, [scope, projectPath, diskKey]);

  return { ...fromAssets, memory: disk.memory, mcp: disk.mcp, hooks: disk.hooks, loading: disk.key !== diskKey };
}

export function itemsOf(c: Catalog, kind: StudioKind): StudioItem[] {
  return kind === 'overview' ? EMPTY : c[kind];
}

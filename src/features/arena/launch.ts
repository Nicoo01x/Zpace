import { useArena, type Arena, type ArenaVariant } from '@/stores/arena';
import { joinPath } from '@/native/system';
import { useProjects } from '@/stores/projects';
import { useSessions } from '@/stores/sessions';
import { useSettings, modelContext } from '@/stores/settings';
import { useUI, collectLeaves } from '@/stores/ui';
import { git } from '@/native/git';
import { runtime, titleFrom } from '@/providers/runtime';
import { toast } from '@/features/notifications/toast-store';
import { celebrate } from '@/features/mascot/celebrate';
import { basename } from '@/lib/format';
import { uid } from '@/lib/id';
import { t } from '@/i18n';

/**
 * Launching an arena: one branch and one worktree per variant beside the
 * project folder, one session each, the same prompt to all of them — with
 * the angle each variant was asked to take. Choosing a variant commits its
 * worktree, merges the branch into the project and clears the others;
 * discarding one drops its session, worktree and branch.
 */
export interface Angle {
  id: string;
  label: string;
  /** What the agent is told; empty = no steer. */
  instruction: string;
  /** The same, for people (translated). */
  hint: string;
}

export const ANGLES: Angle[] = [
  { id: 'free', label: 'Your call', instruction: '', hint: 'No steer — however the agent would do it' },
  { id: 'simple', label: 'The simplest thing', instruction: 'the simplest change that works — minimal surface, no new abstractions', hint: 'The smallest change that works, no new abstractions' },
  { id: 'robust', label: 'Robust, with tests', instruction: 'robust: cover the edge cases and add or update tests', hint: 'Edge cases covered, tests added or updated' },
  { id: 'alt', label: 'A different approach', instruction: 'deliberately take a different approach from the obvious one and explain the trade-off', hint: 'Deliberately not the obvious way, trade-off explained' },
  { id: 'perf', label: 'Performance', instruction: 'optimise for performance and memory; measure when you can', hint: 'Fast and lean, measured when possible' },
  { id: 'custom', label: 'Custom…', instruction: '', hint: '' },
];

export interface VariantSpec {
  model: string;
  angle: string;
  /** For 'custom'. */
  custom?: string;
}

export interface LaunchInput {
  projectId: string;
  prompt: string;
  variants: VariantSpec[];
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24)
      .replace(/-+$/g, '') || 'task'
  );
}

export function angleInstruction(spec: VariantSpec): { label: string; instruction: string } {
  if (spec.angle === 'custom') {
    const text = (spec.custom ?? '').trim();
    return { label: text || t('Custom…'), instruction: text };
  }
  const a = ANGLES.find((x) => x.id === spec.angle) ?? ANGLES[0];
  return { label: t(a.label), instruction: a.instruction };
}

/** The message every variant gets: the task, then the rules of the arena and its own angle. */
export function variantPrompt(prompt: string, n: number, total: number, dir: string, instruction: string): string {
  const angle = instruction ? `\nThe approach for this variant: ${instruction}.` : '';
  return `${prompt.trim()}\n\n---\nYou are variant ${n} of ${total}: the same task is being worked on in parallel in ${total} separate git worktrees, and the user will compare the results and keep one.${angle}\nWork only inside this worktree (${dir}). Do not commit, do not switch branches, do not touch the other worktrees.\nWhen you finish, end with a short summary (3–4 lines, in the language of the task): what you changed and the trade-offs of this approach.`;
}

function worktreeHome(root: string): { parent: string; name: string } {
  const clean = root.replace(/[\\/]+$/, '');
  const parent = clean.slice(0, Math.max(clean.lastIndexOf('\\'), clean.lastIndexOf('/')));
  return { parent, name: basename(clean) };
}

export async function launchArena(input: LaunchInput): Promise<Arena | undefined> {
  const project = useProjects.getState().projects.find((p) => p.id === input.projectId);
  if (!project || !input.prompt.trim() || !input.variants.length) return undefined;
  let head: { sha: string; branch: string };
  try {
    head = await git.head(project.path);
  } catch (e) {
    toast.error(t('Not a git repository'), { description: e instanceof Error ? e.message : String(e) });
    return undefined;
  }
  const title = titleFrom(input.prompt) || t('Arena');
  const stem = `${slug(title)}-${uid().slice(-4)}`;
  const { parent, name } = worktreeHome(project.path);
  const total = input.variants.length;
  const variants: ArenaVariant[] = [];
  for (let i = 0; i < total; i++) {
    const spec = input.variants[i];
    const n = i + 1;
    const branch = `arena/${stem}-v${n}`;
    const dir = joinPath(parent, `${name}.worktrees/arena-${stem}-v${n}`);
    try {
      await git.worktreeAdd(project.path, dir, branch, head.sha);
    } catch (e) {
      // Roll back what was made so far; a half arena is worse than none.
      for (const v of variants) {
        await git.worktreeRemove(project.path, v.dir, true, v.branch).catch(() => void 0);
        useSessions.getState().removeSession(v.sessionId);
      }
      toast.error(t('Could not create the worktree'), { description: e instanceof Error ? e.message : String(e) });
      return undefined;
    }
    const { label, instruction } = angleInstruction(spec);
    const model = spec.model || useSettings.getState().claude.defaultModel || 'opus';
    const s = useSessions.getState().createSession({ projectId: project.id, title: `V${n} · ${title}`, model, contextMax: modelContext(model) });
    useSessions.getState().updateSession(s.id, { worktree: { path: dir, branch } });
    variants.push({ id: uid('var'), n, sessionId: s.id, branch, dir, model, angle: spec.angle, angleLabel: label, verdict: 'open' });
    void runtime.send(s.id, variantPrompt(input.prompt, n, total, dir, instruction));
  }
  const arena: Arena = { id: uid('arena'), projectId: project.id, title, prompt: input.prompt.trim(), base: head.sha, baseBranch: head.branch, createdAt: Date.now(), variants };
  useArena.getState().add(arena);
  useProjects.getState().toggleExpanded(project.id, true);
  openArena(arena.id);
  toast.success(t('Arena started'), { description: t('{n} agents on "{title}"', { n: total, title }), mark: 'commit' });
  return arena;
}

/** Show the arena in the active pane. */
export function openArena(arenaId: string) {
  const ui = useUI.getState();
  const leaves = collectLeaves(ui.layout);
  const already = leaves.find((l) => l.content.kind === 'arena' && l.content.arenaId === arenaId);
  if (already) {
    ui.setActivePane(already.id);
    return;
  }
  const target = leaves.find((l) => l.id === ui.activePaneId) ?? leaves[0];
  ui.setPaneContent(target.id, { kind: 'arena', arenaId });
  ui.setActivePane(target.id);
}

async function dropSession(sessionId: string) {
  // Wait for the process to go: on Windows its working directory cannot be deleted while it lives.
  await runtime.dispose(sessionId).catch(() => void 0);
  const ui = useUI.getState();
  for (const l of collectLeaves(ui.layout)) {
    if (l.content.kind === 'session' && l.content.sessionId === sessionId) ui.setPaneContent(l.id, { kind: 'empty' });
  }
  if (ui.activeSessionId === sessionId) ui.setActiveSession(null);
  useSessions.getState().removeSession(sessionId);
}

/** Session, worktree and branch go. */
export async function discardVariant(arenaId: string, variantId: string, opts: { quiet?: boolean } = {}) {
  const arena = useArena.getState().arenas[arenaId];
  const v = arena?.variants.find((x) => x.id === variantId);
  const project = arena && useProjects.getState().projects.find((p) => p.id === arena.projectId);
  if (!arena || !v || !project) return;
  await dropSession(v.sessionId);
  try {
    await git.worktreeRemove(project.path, v.dir, true, v.branch);
  } catch (e) {
    if (!opts.quiet) toast.warning(t('Worktree not removed'), { description: e instanceof Error ? e.message : String(e) });
  }
  useArena.getState().setVerdict(arenaId, variantId, 'discarded');
}

/**
 * Bring a variant home: commit its worktree, merge the branch into the
 * project, drop its worktree (the branch stays, merged) and clear the other
 * open variants. The session survives and continues in the project folder.
 */
export async function chooseVariant(arenaId: string, variantId: string, opts: { discardOthers?: boolean } = {}): Promise<boolean> {
  const arena = useArena.getState().arenas[arenaId];
  const v = arena?.variants.find((x) => x.id === variantId);
  const project = arena && useProjects.getState().projects.find((p) => p.id === arena.projectId);
  if (!arena || !v || !project) return false;
  const session = useSessions.getState().sessions[v.sessionId];
  if (session && (session.status === 'running' || session.status === 'waiting')) {
    toast.info(t('Still working'), { description: t('Wait for the variant to finish (or stop it) before choosing it.') });
    return false;
  }
  const landed = await git.changes(v.dir, arena.base).catch(() => []);
  try {
    await git.commitAll(v.dir, `${arena.title} (V${v.n})`);
    await git.merge(project.path, v.branch, `Merge ${v.branch}: ${arena.title} (V${v.n})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('CONFLICT:')) {
      const files = msg.slice('CONFLICT:'.length).split('\n').filter(Boolean);
      toast.error(t('Merge conflict — nothing was changed'), { description: files.length ? files.slice(0, 6).join(', ') + (files.length > 6 ? ` +${files.length - 6}` : '') : t('Resolve it by hand, or ask the session to rebase on {branch}.', { branch: arena.baseBranch }), duration: 0 });
    } else {
      toast.error(t('Could not merge'), { description: msg, duration: 0 });
    }
    return false;
  }
  // The session goes on in the project folder from its next message (the process restarts there).
  await runtime.dispose(v.sessionId).catch(() => void 0);
  useSessions.getState().updateSession(v.sessionId, { worktree: undefined });
  await git.worktreeRemove(project.path, v.dir, true).catch(() => void 0);
  useArena.getState().patchVariant(arenaId, variantId, { verdict: 'chosen', landed });
  useArena.getState().update(arenaId, { mergedAt: Date.now() });
  if (opts.discardOthers !== false) {
    for (const other of arena.variants) if (other.id !== variantId && other.verdict === 'open') await discardVariant(arenaId, other.id, { quiet: true });
  }
  toast.success(t('V{n} merged into {branch}', { n: v.n, branch: arena.baseBranch }), { description: arena.title, mark: 'commit' });
  celebrate('commit');
  return true;
}

/** Discard what is still open and forget the arena. Chosen variants (already merged) are left alone. */
export async function removeArena(arenaId: string) {
  const arena = useArena.getState().arenas[arenaId];
  if (!arena) return;
  for (const v of arena.variants) if (v.verdict === 'open') await discardVariant(arenaId, v.id, { quiet: true });
  const ui = useUI.getState();
  for (const l of collectLeaves(ui.layout)) if (l.content.kind === 'arena' && l.content.arenaId === arenaId) ui.setPaneContent(l.id, { kind: 'empty' });
  useArena.getState().remove(arenaId);
}

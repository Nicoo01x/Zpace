import type { GitBranch, GitCommit, GitFileStatus, GitSummary } from '@/types/workspace';
import { invoke, isTauri } from './bridge';

/**
 * Git bridge. Every call goes to the `git` CLI through Rust. In the browser
 * preview the calls reject with NativeUnavailable and the panels show the
 * "desktop only" state.
 */

export interface Worktree {
  path: string;
  branch: string;
  head: string;
  main: boolean;
}

export interface ChangedFile {
  file: string;
  status: 'M' | 'A' | 'D';
  additions: number;
  deletions: number;
  /** Last write on disk, ms since the epoch (0 for a deleted file). */
  modified: number;
}

export const git = {
  worktrees: (path: string) => invoke<Worktree[]>('git_worktrees', { path }),
  worktreeAdd: (path: string, dest: string, branch: string, base?: string) => invoke<void>('git_worktree_add', { path, dest, branch, base }),
  worktreeRemove: (path: string, dest: string, force = false, deleteBranch?: string) => invoke<void>('git_worktree_remove', { path, dest, force, deleteBranch }),
  available: isTauri,
  summary: (path: string) => invoke<GitSummary>('git_summary', { path }),
  status: (path: string) => invoke<GitFileStatus[]>('git_status_files', { path }),
  log: (path: string, limit = 40) => invoke<GitCommit[]>('git_log', { path, limit }),
  /** Commits per day over the last year (the contribution map). */
  activity: (path: string, days = 365) => invoke<Array<{ date: string; count: number }>>('git_activity', { path, days }),
  userName: (path?: string) => invoke<string | null>('git_user_name', { path: path ?? null }),
  branches: (path: string) => invoke<GitBranch[]>('git_branches', { path }),
  checkout: (path: string, branch: string, create = false) => invoke<string>('git_checkout', { path, branch, create }),
  deleteBranch: (path: string, branch: string) => invoke<string>('git_delete_branch', { path, branch }),
  fetch: (path: string) => invoke<string>('git_fetch', { path }),
  stage: (path: string, file: string) => invoke<void>('git_stage', { path, file }),
  stageAll: (path: string) => invoke<void>('git_stage_all', { path }),
  unstage: (path: string, file: string) => invoke<void>('git_unstage', { path, file }),
  discard: (path: string, file: string) => invoke<void>('git_discard', { path, file }),
  commit: (path: string, message: string) => invoke<string>('git_commit', { path, message }),
  push: (path: string) => invoke<string>('git_push', { path }),
  pull: (path: string) => invoke<string>('git_pull', { path }),
  clone: (url: string, dest: string) => invoke<string>('git_clone', { url, dest }),
  /** The file at `base` (HEAD by default) vs. the working tree. */
  diffFile: (path: string, file: string, base?: string) => invoke<{ original: string; modified: string }>('git_diff_file', { path, file, base }),
  head: (path: string) => invoke<{ sha: string; branch: string }>('git_head', { path }),
  /** Everything that differs from `base` (HEAD by default), untracked files included, with line counts. */
  changes: (path: string, base?: string) => invoke<ChangedFile[]>('git_changes', { path, base }),
  /** Stage everything and commit; false when there was nothing to commit. */
  commitAll: (path: string, message: string) => invoke<boolean>('git_commit_all', { path, message }),
  /** Merge a branch into the current one (merge commit). A conflict is backed out and rejects with `CONFLICT:<files>`. */
  merge: (path: string, branch: string, message: string) => invoke<string>('git_merge', { path, branch, message }),
};

/** Make a path relative to a project root (git wants repo-relative paths). */
export function relativeTo(root: string, path: string): string {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const r = norm(root).toLowerCase();
  const p = norm(path);
  return p.toLowerCase().startsWith(r + '/') ? p.slice(r.length + 1) : p;
}

import type { WorkspaceActions } from './useWorkspaceActions';

/**
 * The workspace actions for code that runs outside React (the voice
 * assistant's tools). `App` binds the hook's latest value; `workspaceActions()`
 * throws before the app has mounted.
 */
let current: WorkspaceActions | null = null;

export function bindWorkspaceActions(actions: WorkspaceActions) {
  current = actions;
}

export function workspaceActions(): WorkspaceActions {
  if (!current) throw new Error('Workspace actions are not bound yet');
  return current;
}

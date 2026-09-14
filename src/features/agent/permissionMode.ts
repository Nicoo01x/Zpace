import { useSettings } from '@/stores/settings';
import { T } from '@/i18n';

export const PERMISSION_MODES = [
  { id: 'default', label: T('ask mode'), hint: T('asks before edits and commands') },
  { id: 'acceptEdits', label: T('auto mode'), hint: T('edits are applied without asking') },
  { id: 'plan', label: T('plan mode'), hint: T('read-only, proposes a plan') },
  { id: 'bypassPermissions', label: T('bypass mode'), hint: T('no prompts at all') },
] as const;

export type PermissionModeId = (typeof PERMISSION_MODES)[number]['id'];

export function cyclePermissionMode() {
  const s = useSettings.getState();
  const i = PERMISSION_MODES.findIndex((m) => m.id === s.claude.permissionMode);
  const next = PERMISSION_MODES[(i + 1) % PERMISSION_MODES.length];
  s.patch({ claude: { ...s.claude, permissionMode: next.id } });
  return next;
}


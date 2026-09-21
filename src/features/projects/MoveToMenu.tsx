import { FolderInput, FolderPlus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { ProjectFolder } from '@/types/workspace';
import { useProjects } from '@/stores/projects';
import { ContextMenuItem, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from '@/components/ui/ContextMenu';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import type { FolderItem } from './folder-items';
import { t } from '@/i18n';

const NO_FOLDERS: ProjectFolder[] = [];

/**
 * "Move to ▸" in a sidebar row's context menu: the project itself and each of
 * its sub-folders, the current place ticked, and a way to make a new folder
 * and land there in one go.
 */
export function MoveToSub({ item, projectId, current }: { item: FolderItem; projectId: string; current?: string }) {
  const projectName = useProjects((s) => s.projects.find((p) => p.id === projectId)?.name ?? '');
  const folders = useProjects(useShallow((s) => s.projects.find((p) => p.id === projectId)?.folders ?? NO_FOLDERS));
  const { moveToFolder, newFolder } = useWorkspaceActions();
  // A folder that no longer exists counts as the root.
  const value = current && folders.some((f) => f.id === current) ? current : '';
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger icon={<FolderInput />}>{t('Move to')}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-[180px]">
        <ContextMenuRadioGroup value={value} onValueChange={(v) => moveToFolder(item, v || undefined)}>
          <ContextMenuRadioItem value="">{projectName}</ContextMenuRadioItem>
          {folders.map((f) => (
            <ContextMenuRadioItem key={f.id} value={f.id}>
              {f.name}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={<FolderPlus />}
          onSelect={() => {
            void newFolder(projectId).then((f) => {
              if (f) moveToFolder(item, f.id);
            });
          }}
        >
          {t('New folder…')}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

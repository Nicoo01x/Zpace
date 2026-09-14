import { useProjects } from '@/stores/projects';
import { GitBody } from './GitPanel';
import { t } from '@/i18n';

/** The git panel undocked into a workspace pane. */
export function GitPaneView({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  if (!project) return <div className="flex h-full items-center justify-center text-[12.5px] text-muted">{t('Add a project to use git.')}</div>;
  return (
    <div className="h-full min-h-0 overflow-auto">
      <GitBody key={project.id} projectId={project.id} path={project.path} />
    </div>
  );
}

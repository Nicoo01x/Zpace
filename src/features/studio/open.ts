import { useStudio, type StudioScope } from '@/stores/studio';

/** Open the Studio — on a scope when one is given, otherwise where it was left. From the sidebar, the palette, a plugin. */
export function openStudio(scope?: StudioScope) {
  const s = useStudio.getState();
  if (scope && JSON.stringify(scope) !== JSON.stringify(s.scope)) s.setScope(scope);
  s.setOpen(true);
}

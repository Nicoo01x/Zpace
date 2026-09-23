import { useEffect } from 'react';
import { useStudio } from '@/stores/studio';

/** Tells the Studio the stage has unsaved changes, so moving away parks the move behind the unsaved-changes bar. */
export function useUnsavedGuard(dirty: boolean) {
  const setDirty = useStudio((s) => s.setDirty);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}

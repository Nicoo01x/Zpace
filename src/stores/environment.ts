import { create } from 'zustand';
import type { EnvironmentReport } from '@/types/workspace';

export interface EnvironmentState {
  report: EnvironmentReport | null;
  loading: boolean;
  error: string | null;
  setReport: (r: EnvironmentReport) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

/** Resolves once environment detection has produced a report (immediately if it already has). */
export function whenEnvironmentReady(): Promise<EnvironmentReport> {
  const cur = useEnvironment.getState().report;
  if (cur) return Promise.resolve(cur);
  return new Promise((resolve) => {
    const unsub = useEnvironment.subscribe((s) => {
      if (s.report) {
        unsub();
        resolve(s.report);
      }
    });
  });
}

export const useEnvironment = create<EnvironmentState>((set) => ({
  report: null,
  loading: false,
  error: null,
  setReport: (report) => set({ report, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));

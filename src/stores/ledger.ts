import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';

/**
 * What the agents cost, by day and by project: every time a session's usage
 * grows, the difference lands on today's row for its project. Sessions only
 * know their running total, so this is what makes "this week per project"
 * and "today" possible after the fact. Kept for 90 days.
 */
export interface LedgerCell {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  turns: number;
}

interface LedgerState {
  /** day (local YYYY-MM-DD) → projectId → totals */
  days: Record<string, Record<string, LedgerCell>>;
  add: (projectId: string, delta: Partial<LedgerCell>) => void;
}

export function dayKey(ms = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const KEEP_DAYS = 90;

export const useLedger = create<LedgerState>()(
  persist(
    (set) => ({
      days: {},
      add: (projectId, delta) =>
        set((s) => {
          const key = dayKey();
          const day = { ...(s.days[key] ?? {}) };
          const cur = day[projectId] ?? { costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0 };
          day[projectId] = {
            costUsd: cur.costUsd + (delta.costUsd ?? 0),
            inputTokens: cur.inputTokens + (delta.inputTokens ?? 0),
            outputTokens: cur.outputTokens + (delta.outputTokens ?? 0),
            turns: cur.turns + (delta.turns ?? 0),
          };
          const days = { ...s.days, [key]: day };
          const cutoff = dayKey(Date.now() - KEEP_DAYS * 86_400_000);
          for (const k of Object.keys(days)) if (k < cutoff) delete days[k];
          return { days };
        }),
    }),
    { name: 'conduit.ledger', version: 1, storage: durableStorage() },
  ),
);

/** Totals per project over the last `n` days (today included), biggest first. */
export function byProject(days: LedgerState['days'], n: number): Array<{ projectId: string } & LedgerCell> {
  const from = dayKey(Date.now() - (n - 1) * 86_400_000);
  const acc = new Map<string, LedgerCell>();
  for (const [k, row] of Object.entries(days)) {
    if (k < from) continue;
    for (const [pid, cell] of Object.entries(row)) {
      const cur = acc.get(pid) ?? { costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0 };
      acc.set(pid, { costUsd: cur.costUsd + cell.costUsd, inputTokens: cur.inputTokens + cell.inputTokens, outputTokens: cur.outputTokens + cell.outputTokens, turns: cur.turns + cell.turns });
    }
  }
  return Array.from(acc, ([projectId, c]) => ({ projectId, ...c })).sort((a, b) => b.costUsd - a.costUsd);
}

/** Daily totals (all projects) for the last `n` days, oldest first — for a small bar chart. */
export function byDay(days: LedgerState['days'], n: number): Array<{ day: string; costUsd: number; turns: number }> {
  const out: Array<{ day: string; costUsd: number; turns: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = dayKey(Date.now() - i * 86_400_000);
    const row = days[key] ?? {};
    out.push({ day: key, costUsd: Object.values(row).reduce((s, c) => s + c.costUsd, 0), turns: Object.values(row).reduce((s, c) => s + c.turns, 0) });
  }
  return out;
}

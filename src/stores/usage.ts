import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { claudeUsage } from '@/native/system';
import { isTauri } from '@/lib/platform';
import { t } from '@/i18n';

/**
 * Claude Code rate-limit state, as reported by the CLI on the stream-json
 * channel (`rate_limit_event`): one entry per window (five_hour, seven_day…)
 * with utilisation and reset time. Only chat sessions feed this — the TUI in a
 * terminal keeps its own counters — so it reflects the last chat turn.
 */
export interface RateLimit {
  /** e.g. five_hour, seven_day, seven_day_opus */
  type: string;
  /** allowed | allowed_warning | rejected */
  status: string;
  /** 0..1 when the CLI reports it */
  utilization?: number;
  /** ms epoch */
  resetsAt?: number;
  overage?: string;
  updatedAt: number;
}

interface UsageState {
  limits: Record<string, RateLimit>;
  updatedAt: number | null;
  /** Plan name from the login (pro, max…), once the API has answered. */
  plan: string | null;
  /** Last API reading (ms) and the error of the last attempt, if any. */
  fetchedAt: number | null;
  error: string | null;
  loading: boolean;
  report: (info: Record<string, unknown>) => void;
  /** Ask Anthropic for the real numbers (5-hour, weekly, per-model windows). */
  refresh: () => Promise<void>;
  clear: () => void;
}

export const useUsage = create<UsageState>()(
  persist(
    (set, get) => ({
      limits: {},
      updatedAt: null,
      plan: null,
      fetchedAt: null,
      error: null,
      loading: false,
      refresh: async () => {
        if (!isTauri || get().loading) return;
        set({ loading: true });
        try {
          const u = await claudeUsage();
          const limits: Record<string, RateLimit> = {};
          for (const w of u.windows) {
            limits[w.kind] = { type: w.kind, status: w.utilization >= 1 ? 'rejected' : w.utilization >= 0.8 ? 'allowed_warning' : 'allowed', utilization: w.utilization, resetsAt: w.resetsAt, updatedAt: u.fetchedAt };
          }
          set({ limits, updatedAt: u.fetchedAt, fetchedAt: u.fetchedAt, plan: u.subscription ?? null, error: null, loading: false });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e), loading: false });
        }
      },
      report: (info) => {
        const type = String(info.rateLimitType ?? info.rate_limit_type ?? 'unknown');
        const rawUtil = info.utilization ?? info.utilisation;
        const utilization = typeof rawUtil === 'number' ? (rawUtil > 1 ? rawUtil / 100 : rawUtil) : undefined;
        const rawReset = info.resetsAt ?? info.resets_at;
        const resetsAt = typeof rawReset === 'number' ? (rawReset < 1e12 ? rawReset * 1000 : rawReset) : typeof rawReset === 'string' ? Date.parse(rawReset) || undefined : undefined;
        const limit: RateLimit = {
          type,
          status: String(info.status ?? 'allowed'),
          utilization,
          resetsAt,
          overage: typeof info.overageStatus === 'string' ? info.overageStatus : undefined,
          updatedAt: Date.now(),
        };
        set((s) => ({ limits: { ...s.limits, [type]: limit }, updatedAt: Date.now() }));
      },
      clear: () => set({ limits: {}, updatedAt: null }),
    }),
    { name: 'conduit.usage', version: 2, partialize: (s) => ({ limits: s.limits, updatedAt: s.updatedAt, plan: s.plan, fetchedAt: s.fetchedAt }) as UsageState },
  ),
);

export function limitLabel(type: string): string {
  switch (type) {
    case 'five_hour':
      return '5-hour window';
    case 'seven_day':
      return 'Weekly (all models)';
    case 'seven_day_opus':
      return 'Weekly · Opus';
    case 'seven_day_sonnet':
      return 'Weekly · Sonnet';
    case 'seven_day_oauth_apps':
      return 'Weekly · connected apps';
    case 'seven_day_cowork':
      return 'Weekly · Cowork';
    default:
      return type.replace(/_/g, ' ');
  }
}

/** "resets in 2h 15m" style countdown. */
export function resetsIn(resetsAt: number | undefined, now = Date.now()): string {
  if (!resetsAt) return '';
  const ms = resetsAt - now;
  if (ms <= 0) return t('resetting');
  const h = Math.floor(ms / 3600e3);
  const m = Math.floor((ms % 3600e3) / 60e3);
  if (h >= 24) return t('resets in {t}', { t: `${Math.floor(h / 24)}d ${h % 24}h` });
  return t('resets in {t}', { t: `${h > 0 ? `${h}h ` : ''}${m}m` });
}

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { openUrl } from '@/native/system';
import { AUTHOR, AUTHOR_AVATAR, AUTHOR_URL, REPO } from './author';
import { t } from '@/i18n';

/** The author's GitHub avatar, with a lettered fallback while offline. */
export function AuthorAvatar({ size = 48, className = '' }: { size?: number; className?: string }) {
  const [ok, setOk] = useState(true);
  return ok ? (
    <img src={AUTHOR_AVATAR} alt="" width={size} height={size} onError={() => setOk(false)} className={`shrink-0 rounded-full bg-surface-inset object-cover shadow-[0_0_0_1px_var(--border)] ${className}`} style={{ width: size, height: size }} />
  ) : (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface-inset font-semibold text-secondary ${className}`} style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {AUTHOR.name[0]}
    </span>
  );
}

/** Name + handle, opens the profile. */
export function AuthorCard({ compact }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void openUrl(AUTHOR_URL)}
      className="group flex w-full items-center gap-3.5 rounded-lg px-3 py-2.5 text-left shadow-[0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-(--motion-fast) press hover:bg-surface-hover hover:shadow-[0_0_0_1px_var(--border-strong)]"
    >
      <AuthorAvatar size={compact ? 36 : 48} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-primary">{AUTHOR.name}</span>
        <span className="mt-0.5 block truncate text-[12px] text-secondary">github.com/{AUTHOR.github}</span>
      </span>
      <ExternalLink className="size-[14px] shrink-0 text-muted transition-colors group-hover:text-primary" />
    </button>
  );
}

/* ------------------------------------------------------------------ */

interface Contributor {
  login: string;
  avatar: string;
  url: string;
  contributions: number;
}

let cached: { at: number; list: Contributor[] } | null = null;

/** GitHub's contributor list for the repo, kept for the session (the API allows 60 unauthenticated calls an hour). */
async function fetchContributors(): Promise<Contributor[]> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.list;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contributors?per_page=40`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return [];
  const raw = (await res.json()) as Array<{ login: string; avatar_url: string; html_url: string; contributions: number; type?: string }>;
  const list = raw.filter((c) => c.type !== 'Bot').map((c) => ({ login: c.login, avatar: c.avatar_url, url: c.html_url, contributions: c.contributions }));
  cached = { at: Date.now(), list };
  return list;
}

/**
 * The smaller strip under the author: everyone who has committed to the
 * repo, straight from GitHub, the author first and ringed. Empty (and
 * absent) until the repository is public.
 */
export function Contributors() {
  const [list, setList] = useState<Contributor[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchContributors().then((l) => !cancelled && setList(l)).catch(() => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!list || list.length === 0) return null;
  const sorted = [...list].sort((a, b) => (a.login === AUTHOR.github ? -1 : b.login === AUTHOR.github ? 1 : b.contributions - a.contributions));
  return (
    <div className="mt-3 flex items-center gap-3 px-1">
      <div className="flex items-center">
        {sorted.slice(0, 12).map((c, i) => {
          const me = c.login === AUTHOR.github;
          return (
            <button
              key={c.login}
              type="button"
              title={`${c.login} · ${c.contributions}`}
              aria-label={c.login}
              onClick={() => void openUrl(c.url)}
              className={`relative rounded-full transition-transform duration-(--motion-fast) hover:z-10 hover:scale-110 ${i > 0 ? '-ml-1.5' : ''}`}
              style={{ zIndex: me ? 2 : 1 }}
            >
              <img src={c.avatar + (c.avatar.includes('?') ? '&' : '?') + 's=48'} alt="" className={`rounded-full bg-surface-inset object-cover ${me ? 'size-7 ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--background)]' : 'size-6 shadow-[0_0_0_2px_var(--background)]'}`} />
            </button>
          );
        })}
      </div>
      <span className="text-[11.5px] text-muted">{t('{n} contributors', { n: list.length })}</span>
    </div>
  );
}

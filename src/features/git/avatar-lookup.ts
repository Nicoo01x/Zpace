/**
 * Avatar URLs for a commit author. GitHub knows most of them: noreply
 * addresses carry the user id or login, other addresses go through the users
 * search (one request per address, cached), then Gravatar. Nothing but the
 * e-mail leaves the machine, and only to GitHub / Gravatar.
 */
const cache = new Map<string, Promise<string[]>>();
const STORE = 'conduit.avatars';

function stored(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
export function remember(email: string, url: string) {
  try {
    const all = stored();
    all[email] = url;
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Candidate avatar URLs for an address, best first. */
export function avatarCandidates(email: string | undefined | null): Promise<string[]> {
  const key = (email ?? '').trim().toLowerCase();
  if (!key) return Promise.resolve([]);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const known = stored()[key];
    if (known) return known === 'none' ? [] : [known];
    const out: string[] = [];
    const idMatch = /^(\d+)\+([^@]+)@users\.noreply\.github\.com$/.exec(key);
    const loginMatch = /^([^@+]+)@users\.noreply\.github\.com$/.exec(key);
    if (idMatch) out.push(`https://avatars.githubusercontent.com/u/${idMatch[1]}?s=64&v=4`);
    else if (loginMatch) out.push(`https://github.com/${loginMatch[1]}.png?size=64`);
    else {
      try {
        const r = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(key)}+in:email&per_page=1`, { headers: { Accept: 'application/vnd.github+json' } });
        if (r.ok) {
          const j = (await r.json()) as { items?: Array<{ avatar_url?: string }> };
          const u = j.items?.[0]?.avatar_url;
          if (u) out.push(`${u}${u.includes('?') ? '&' : '?'}s=64`);
        }
      } catch {
        /* offline or rate-limited: fall through */
      }
    }
    if (key.includes('@')) out.push(`https://www.gravatar.com/avatar/${await sha256(key)}?s=64&d=404`);
    return out;
  })();
  cache.set(key, p);
  return p;
}


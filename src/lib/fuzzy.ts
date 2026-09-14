/**
 * Small, fast fuzzy matcher (Sublime/VS Code-like scoring).
 * Returns null when the query does not match, otherwise a score and the matched indices.
 */
export interface FuzzyResult {
  score: number;
  indices: number[];
}

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length > t.length) return null;

  // Fast path: contiguous substring
  const sub = t.indexOf(q);
  if (sub >= 0) {
    const indices = Array.from({ length: q.length }, (_, i) => sub + i);
    let score = 100 - sub * 0.5;
    if (sub === 0 || /[\s\-_/.:]/.test(t[sub - 1] ?? '')) score += 20; // word start
    if (t.length === q.length) score += 30; // exact
    return { score, indices };
  }

  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti;
        break;
      }
      ti++;
    }
    if (found < 0) return null;
    // scoring
    if (found === prev + 1) score += 8; // consecutive
    else score += 1;
    if (found === 0 || /[\s\-_/.:]/.test(t[found - 1] ?? '')) score += 6; // word boundary
    if (target[found] !== t[found] && found > 0 && target[found - 1] === t[found - 1]) score += 4; // camelCase hump
    score -= Math.min(4, (found - prev - 1) * 0.3); // gap penalty
    indices.push(found);
    prev = found;
    ti = found + 1;
  }
  score -= (t.length - q.length) * 0.05;
  return { score, indices };
}

export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getText: (item: T) => string | string[],
  limit = 50,
): Array<{ item: T; score: number; indices: number[]; field: number }> {
  const out: Array<{ item: T; score: number; indices: number[]; field: number }> = [];
  for (const item of items) {
    const texts = ([] as string[]).concat(getText(item));
    let best: { score: number; indices: number[]; field: number } | null = null;
    texts.forEach((text, field) => {
      const r = fuzzyMatch(query, text);
      if (r && (!best || r.score - field * 5 > best.score)) best = { score: r.score - field * 5, indices: r.indices, field };
    });
    if (best) out.push({ item, ...(best as { score: number; indices: number[]; field: number }) });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

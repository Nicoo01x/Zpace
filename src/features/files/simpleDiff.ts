/**
 * Minimal line diff (LCS) — used for stats and for a unified-diff fallback
 * when the provider did not send one. Not meant for huge files.
 */
export function simpleDiff(before: string, after: string): { additions: number; deletions: number; unified: string } {
  const a = before ? before.split('\n') : [];
  const b = after ? after.split('\n') : [];
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) {
    return { additions: m, deletions: n, unified: [...a.map((l) => `-${l}`), ...b.map((l) => `+${l}`)].join('\n') };
  }
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: string[] = [];
  let additions = 0;
  let deletions = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(` ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${a[i]}`);
      deletions++;
      i++;
    } else {
      out.push(`+${b[j]}`);
      additions++;
      j++;
    }
  }
  while (i < n) {
    out.push(`-${a[i++]}`);
    deletions++;
  }
  while (j < m) {
    out.push(`+${b[j++]}`);
    additions++;
  }
  return { additions, deletions, unified: out.join('\n') };
}

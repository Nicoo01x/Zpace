import { invoke, isTauri } from './bridge';

export interface SearchHit {
  path: string;
  rel: string;
  line: number;
  column: number;
  text: string;
}

export interface SearchResult {
  hits: SearchHit[];
  filesScanned: number;
  truncated: boolean;
}

/** Text search under a folder (Rust walker; literal by default, case-insensitive by default). */
export async function searchText(root: string, query: string, opts: { regex?: boolean; caseSensitive?: boolean; include?: string; maxHits?: number; budgetMs?: number } = {}): Promise<SearchResult> {
  if (!isTauri) return { hits: [], filesScanned: 0, truncated: false };
  return invoke<SearchResult>('search_text', { root, query, regex: opts.regex, caseSensitive: opts.caseSensitive, include: opts.include, maxHits: opts.maxHits, budgetMs: opts.budgetMs });
}

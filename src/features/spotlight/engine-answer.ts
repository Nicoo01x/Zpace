import { browserAvailable, browserOpen, browserNavigate, browserSetBounds, browserSetVisible, browserClose, browserEval } from '@/native/browser';
import { listen } from '@/native/bridge';

/**
 * A search engine's AI answer, lifted out of its page: the engine's answer
 * page loads in a hidden child webview, a small script reads the answer's
 * text blocks and the sources it cites, and hands them back through the
 * title channel (U+200B + `conduit-data:` — see browser.rs). The bar renders
 * that in its own style; the page itself is one click away.
 */
export interface EngineAnswerData {
  text: string;
  sources: Array<{ title: string; url: string; host: string }>;
  done: boolean;
}

const LABEL = 'spotlight-ai';

/** Runs inside the engine's page: answer text as Markdown-ish lines, and the external links it cites. */
const EXTRACT_JS = String.raw`(() => {
 try {
  const SKIP = 'a, button, [role="button"], svg, nav, form, [aria-hidden="true"], [role="dialog"], [role="complementary"], input, textarea, select, script, style, noscript, template, iframe, header, footer, #gb, [role="banner"], [role="navigation"], [role="contentinfo"], [role="search"], [role="tablist"], [role="listbox"], [role="menu"]';
  const STOP = /^(ahorr[oó] tiempo|saved time|comentarios|feedback|[uú]til|helpful|ver m[aá]s|show more|acerca de este resultado|about this result|ir al contenido principal|skip to main content|iniciar sesi[oó]n|sign in|conversaci[oó]n en el modo ia|ai mode conversation|modo ia|ai mode$|todo$|all$|im[aá]genes|images$|v[ií]deos|videos$|noticias|news$|m[aá]s$|more$)/i;
  const BLOCK = /^(block|list-item|table-cell|table-row|flex|grid|table|table-caption)$/;
  const blockOf = (n) => { let e = n.parentElement; while (e && e !== document.body) { const d = getComputedStyle(e).display; if (BLOCK.test(d)) return e; e = e.parentElement; } return document.body; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const blocks = new Map();
  const order = [];
  let n;
  while ((n = walker.nextNode())) {
    const raw = n.textContent || '';
    if (!raw.trim()) continue;
    const pe = n.parentElement;
    if (!pe || pe.closest(SKIP)) continue;
    if (pe.getClientRects().length === 0) continue;
    const blk = blockOf(n);
    if (!blocks.has(blk)) { blocks.set(blk, []); order.push(blk); }
    blocks.get(blk).push(raw);
  }
  const lines = [];
  const seen = new Set();
  let stopped = false;
  for (const blk of order) {
    if (stopped) break;
    const t = blocks.get(blk).join('').replace(/\s+/g, ' ').trim();
    if (t.length < 3) continue;
    if (STOP.test(t)) { if (/ahorr|saved time|comentarios|feedback/i.test(t)) stopped = true; continue; }
    if (seen.has(t)) continue;
    seen.add(t);
    const tag = blk.tagName;
    const prefix = tag === 'LI' || blk.closest('li') ? '- ' : /^H[1-4]$/.test(tag) ? '## ' : tag === 'TD' || tag === 'TH' ? '| ' : '';
    if (!prefix && t.length < 18) continue;
    lines.push(prefix + t);
  }
  const sources = [];
  const hosts = new Set();
  for (const a of document.body.querySelectorAll('a[href^="http"]')) {
    try {
      let u = new URL(a.href);
      if (/google\./.test(u.hostname) && /^\/url/.test(u.pathname)) { const real = u.searchParams.get('url') || u.searchParams.get('q'); if (real) u = new URL(real); }
      if (/google\.|gstatic\.|youtube\.com/.test(u.hostname)) continue;
      if (hosts.has(u.hostname)) continue;
      const title = (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!title) continue;
      hosts.add(u.hostname);
      sources.push({ title, url: u.href, host: u.hostname.replace(/^www\./, '') });
      if (sources.length >= 6) break;
    } catch {}
  }
  const text = lines.join('\n').slice(0, 6000);
  document.title = '\u200bconduit-data:' + JSON.stringify({ kind: 'ai', text, sources, at: Date.now() });
 } catch (e) {
  document.title = '\u200bconduit-data:' + JSON.stringify({ kind: 'ai', error: String((e && e.stack) || e).slice(0, 300), at: Date.now() });
 }
})();`;

/**
 * Load the answer page hidden and stream its text through `onData` until it
 * settles (or times out). Returns a stop function; the webview is closed by it.
 */
export function fetchEngineAnswer(url: string, onData: (d: EngineAnswerData) => void): () => void {
  if (!browserAvailable) {
    console.warn('[spotlight-ai] no native browser');
    onData({ text: '', sources: [], done: true });
    return () => void 0;
  }
  let stopped = false;
  let off: (() => void) | undefined;
  let last = '';
  let stable = 0;
  let polls = 0;
  let timer: number | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) window.clearTimeout(timer);
    off?.();
    void browserClose(LABEL).catch(() => void 0);
  };
  void (async () => {
    off = await listen<{ label: string; json: string }>('browser://data', (p) => {
      if (p.label !== LABEL || stopped) return;
      try {
        const d = JSON.parse(p.json) as { text?: string; sources?: EngineAnswerData['sources']; error?: string };
        if (d.error) console.warn('[spotlight-ai] page script failed:', d.error);
        const text = d.text ?? '';
        if (text === last) stable++;
        else {
          stable = 0;
          last = text;
        }
        // Settled: the same text three polls in a row after something arrived, or the page is done streaming.
        const done = text.length > 0 && stable >= 3;
        onData({ text, sources: d.sources ?? [], done });
        if (done) stop();
      } catch {
        /* malformed */
      }
    });
    if (stopped) return;
    try {
      await browserOpen(LABEL, url, { x: -4000, y: 0, width: 900, height: 1200 });
    } catch (e) {
      if (!String(e).includes('already exists')) {
        console.error('[spotlight-ai] open failed', e);
        onData({ text: '', sources: [], done: true });
        stop();
        return;
      }
      await browserNavigate(LABEL, url).catch(() => void 0);
      await browserSetBounds(LABEL, { x: -4000, y: 0, width: 900, height: 1200 }).catch(() => void 0);
    }
    await browserSetVisible(LABEL, false).catch(() => void 0);
    const poll = () => {
      if (stopped) return;
      polls++;
      void browserEval(LABEL, EXTRACT_JS).catch(() => void 0);
      if (polls > 45) {
        onData({ text: last, sources: [], done: true });
        stop();
        return;
      }
      timer = window.setTimeout(poll, 800);
    };
    timer = window.setTimeout(poll, 1500);
  })();
  return stop;
}

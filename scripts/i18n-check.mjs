// Every string the UI translates must exist in every dictionary.
//
// Keys are collected from the source: literal `t('…')` / `tr('…')` / `T('…')` (table marker) calls plus any string that a dictionary
// already knows and that still appears verbatim in src (labels translated at render time, e.g. `t(item.label)`).
// Fails when a dictionary misses a key, carries a key nothing uses, or drops a `{placeholder}` the key has.
//
//   node scripts/i18n-check.mjs          # report
//   node scripts/i18n-check.mjs --fix    # also print the missing keys per language as a paste-ready object
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const I18N = path.join(SRC, 'i18n');
const fix = process.argv.includes('--fix');

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (/bloub$|i18n$/.test(p)) continue;
      walk(p);
    } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p);
  }
})(SRC);
const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const unescape = (s) => s.replace(/\\x27/g, "'").replace(/\\'/g, "'").replace(/\\"/g, '"');
const keyRe = /(?<![\w.])(?:t|tr|T)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const literal = new Set();
let m;
while ((m = keyRe.exec(all))) literal.add(unescape(m[1] ?? m[2]));

// Dictionaries: every `export const xx: Record<string, string> = { … }` file beside index.ts.
const dicts = {};
for (const f of fs.readdirSync(I18N)) {
  if (f === 'index.ts' || !f.endsWith('.ts')) continue;
  const src = fs.readFileSync(path.join(I18N, f), 'utf8');
  const map = new Map();
  for (const mm of src.matchAll(/^  (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),?\s*$/gm)) map.set(unescape(mm[1] ?? mm[2]), unescape(mm[3] ?? mm[4] ?? ''));
  dicts[f.replace(/\.ts$/, '')] = map;
}

const appears = (k) => [`'${k.replace(/'/g, "\\'")}'`, `'${k.replace(/'/g, '\\x27')}'`, `"${k}"`, `\`${k}\``].some((q) => all.includes(q));
const known = new Set([...literal]);
for (const map of Object.values(dicts)) for (const k of map.keys()) if (appears(k)) known.add(k);
const keys = [...known];

let failed = false;
for (const [lang, map] of Object.entries(dicts)) {
  const missing = keys.filter((k) => !map.has(k));
  const orphan = [...map.keys()].filter((k) => !known.has(k));
  const badVars = keys.filter((k) => map.has(k) && [...k.matchAll(/\{(\w+)\}/g)].some((v) => !map.get(k).includes(`{${v[1]}}`)));
  const ok = !missing.length && !orphan.length && !badVars.length;
  if (!ok) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${lang.padEnd(6)} ${map.size - orphan.length}/${keys.length}${missing.length ? ` · missing ${missing.length}` : ''}${orphan.length ? ` · orphan ${orphan.length}` : ''}${badVars.length ? ` · placeholder mismatch ${badVars.length}` : ''}`);
  for (const k of orphan.slice(0, 10)) console.log(`    orphan: ${JSON.stringify(k)}`);
  for (const k of badVars.slice(0, 10)) console.log(`    placeholder: ${JSON.stringify(k)} → ${JSON.stringify(map.get(k))}`);
  if (missing.length && !fix) for (const k of missing.slice(0, 10)) console.log(`    missing: ${JSON.stringify(k)}`);
  if (missing.length && fix) console.log(`  // ${lang}\n${missing.map((k) => `  ${JSON.stringify(k)}: '',`).join('\n')}`);
}
console.log(`${keys.length} keys · ${Object.keys(dicts).length} dictionaries`);
process.exit(failed ? 1 : 0);

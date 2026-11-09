// TypeScript port of business-flow-mac Sources/BNFlowCore/Editing.swift + AutoLearn.swift + EvalScoring.
import { chars, eqCI, isLetter, isNumber, isPunct, stripDiacritics, trimBy, trimWS, trimWSNL } from './chars';
import { escapeRe, test } from './regex';
import { lev, words } from './rules';
import { newId, type DictionaryEntry, type HistoryItem, type Snippet } from './types';

export function parseHeard(s: string): string[] {
  const seen = new Set<string>();
  return s
    .split(',')
    .map(trimWS)
    .filter((x) => {
      if (!x) return false;
      const k = x.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function makeEntry(term: string, heard: string): DictionaryEntry | null {
  const t = trimWSNL(term);
  if (!t) return null;
  return { id: newId(), term: t, heardAs: parseHeard(heard).filter((h) => !eqCI(h, t)), autoLearned: false };
}

export function insertEntry(e: DictionaryEntry, list: DictionaryEntry[]): DictionaryEntry[] {
  const out = [...list];
  const i = out.findIndex((x) => eqCI(x.term, e.term));
  if (i >= 0) {
    const m = { ...out[i], heardAs: [...out[i].heardAs] };
    m.term = e.term;
    for (const h of e.heardAs) if (!m.heardAs.some((x) => eqCI(x, h))) m.heardAs.push(h);
    m.autoLearned = m.autoLearned && e.autoLearned;
    out.splice(i, 1);
    out.unshift(m);
    return out;
  }
  out.unshift(e);
  return out;
}

export function updateEntry(id: string, term: string, heard: string, list: DictionaryEntry[]): DictionaryEntry[] {
  const t = trimWSNL(term);
  const i = list.findIndex((x) => x.id === id);
  if (!t || i < 0) return list;
  const out = [...list];
  out[i] = { ...out[i], term: t, heardAs: parseHeard(heard).filter((h) => !eqCI(h, t)), autoLearned: false };
  return out;
}

export function saveSnippet(id: string | null, trigger: string, expansion: string, list: Snippet[]): Snippet[] {
  const t = trimWSNL(trigger);
  if (!t || !expansion) return list;
  let out = [...list];
  const i = id ? out.findIndex((x) => x.id === id) : -1;
  if (id && i >= 0) {
    out[i] = { ...out[i], trigger: t, expansion };
    return out.filter((x) => x.id === id || !eqCI(x.trigger, t));
  }
  out = out.filter((x) => !eqCI(x.trigger, t));
  out.unshift({ id: newId(), trigger: t, expansion });
  return out;
}

const fold = (s: string) => stripDiacritics(s).toLowerCase();
export function filterHistory(items: HistoryItem[], query: string): HistoryItem[] {
  const ws = fold(query).split(/\s+/).filter((x) => x);
  if (!ws.length) return items;
  return items.filter((it) => {
    const hay = fold([it.text, it.rawText, it.reason, it.error].filter(Boolean).join(' '));
    return ws.every((w) => hay.includes(w));
  });
}

// MARK: AutoLearn — learn a dictionary word from a manual one-word correction in the Hub (history edit).

const tokens = (s: string) => s.split(/\s+/).filter((x) => x);
const symbolLike = (c: string) => isPunct(c) || /[$+<=>^`|~\u00a2-\u00a9\u00ac\u00ae-\u00b1\u00b4\u00b8\u00d7\u00f7]/.test(c);
const core = (w: string) => trimBy(w, symbolLike);

export function correction(inserted: string, pasted: string, later: string, dictionary: DictionaryEntry[]): { heard: string; term: string } | null {
  if (pasted === later) return null;
  const a = tokens(pasted);
  const b = tokens(later);
  if (a.length !== b.length || !a.length) return null;
  let p = 0;
  while (p < a.length && a[p] === b[p]) p++;
  let sfx = 0;
  while (sfx < a.length - p && a[a.length - 1 - sfx] === b[b.length - 1 - sfx]) sfx++;
  if (a.length - p - sfx !== 1) return null;
  const old = core(a[p]);
  const nw = core(b[p]);
  if (old === nw || chars(old).length < 3 || chars(nw).length < 3) return null;
  if (!chars(nw).every((c) => isLetter(c) || isNumber(c) || c === '-' || c === '.')) return null;
  if (!words(inserted).includes(old.toLowerCase())) return null;
  if (similarity(old.toLowerCase(), nw.toLowerCase()) < 0.5) return null;
  const known = dictionary.some((e) => eqCI(e.term, nw) && e.heardAs.some((h) => eqCI(h, old)));
  if (known) return null;
  if (old.toLowerCase() === nw.toLowerCase() && p === 0) return null;
  return { heard: old, term: nw };
}

export function learn(c: { heard: string; term: string }, dict: DictionaryEntry[]): DictionaryEntry[] {
  const out = dict.map((d) => ({ ...d, heardAs: [...d.heardAs] }));
  const i = out.findIndex((d) => d.term === c.term);
  if (i >= 0) {
    if (!out[i].heardAs.includes(c.heard)) out[i].heardAs.push(c.heard);
  } else {
    out.push({ id: newId(), term: c.term, heardAs: c.heard.toLowerCase() === c.term.toLowerCase() ? [] : [c.heard], autoLearned: true });
  }
  return out;
}

// MARK: EvalScoring

const norm = (s: string) => trimWSNL(s).replace(/[ \t]+/g, ' ');
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  const m = Math.max(chars(x).length, chars(y).length);
  return m === 0 ? 1 : 1 - lev(x, y) / m;
}
export const containsCheck = (out: string, c: string) => c.split('|').some((x) => out.includes(x));
export function notContainsCheck(out: string, c: string): boolean {
  if (chars(c).every((x) => isLetter(x))) {
    return !test(out, String.raw`(?i)(?<![\p{L}\p{N}])` + escapeRe(c) + String.raw`(?![\p{L}\p{N}])`);
  }
  return !out.includes(c);
}
export function score(mustContain: string[], mustNotContain: string[], expected: string, output: string) {
  const failed: string[] = [];
  for (const k of mustContain) if (!containsCheck(output, k)) failed.push('+' + k);
  for (const k of mustNotContain) if (!notContainsCheck(output, k)) failed.push('-' + k);
  const total = mustContain.length + mustNotContain.length;
  const passed = total - failed.length;
  const sim = similarity(output, expected);
  const ratio = total === 0 ? sim : passed / total;
  return { failed, passed, total, similarity: sim, exact: norm(output) === norm(expected), score: 0.4 * sim + 0.6 * ratio };
}

// Ported from business-flow-mac Tests/BNFlowCoreTests/TextRulesTests.swift + EditingTests.swift (same expectations).
import { describe, expect, it } from 'vitest';
import * as R from '../rules';
import { applyDictionary, categoryForBundle, processText, removeFillers } from '../pipeline';
import { formatDictation, llmAccept, type ChatProvider } from '../formatter';
import { correction, filterHistory, insertEntry, learn, makeEntry, saveSnippet, updateEntry } from '../editing';
import { defaultSettings, emptyContext, entry, newId, type DictationContext, type HistoryItem } from '../types';

const dict = [
  entry('BusinessNative', ['biznisz nétív', 'business native', 'biznisznétív']),
  entry('ClickUp'),
  entry('Supabase'),
  entry('Vercel', ['versel', 'verszel']),
  entry('Dorottya', ['Dorotya']),
];
const settings = () => ({ ...defaultSettings(), dictionary: dict });
const ctx = (p: Partial<DictationContext>): DictationContext => ({ ...emptyContext, ...p });

describe('TextRules', () => {
  it('lastWord matches words().pop for Hungarian, emoji and punctuation', () => {
    const samples = ['', 'Szia', 'Árvíztűrő tükörfúrógép', 'Szia 👋 Anna!', 'info kukac példa pont hu', 'a clickupban van', 'mar', 'I like the mar file', 'az ügyfél aki tegnap írt'];
    for (const s of samples) expect(R.lastWord(s)).toBe(R.words(s).pop() ?? '');
  });
  it('language', () => {
    expect(R.language('Holnap átküldöm az ajánlatot')).toBe('hu');
    expect(R.language('I will send the offer tomorrow')).toBe('en');
  });
  it('backtrack', () => {
    expect(R.applyBacktrack('Holnap tíz órakor, nem, inkább tizenegykor találkozzunk.')).toBe('Holnap tizenegykor találkozzunk.');
    expect(R.applyBacktrack("Let's meet on Tuesday, actually no, Wednesday at 3 pm.")).toBe("Let's meet on Wednesday at 3 pm.");
    expect(R.applyBacktrack('Szia Anna, mikor érsz rá? Ezt töröld. Szia Anna, ráérsz holnap?')).toBe('Szia Anna, ráérsz holnap?');
    expect(R.applyBacktrack('Nem inkább holnap?')).toBe('Nem inkább holnap?');
  });
  it('lists', () => {
    expect(R.applyLists('The agenda is first budget, second hiring and third the roadmap')).toBe('The agenda is:\n1. Budget\n2. Hiring\n3. Roadmap');
    expect(R.applyLists('Az első alkalommal jó volt')).toBe('Az első alkalommal jó volt');
  });
  it('Hungarian commas and question marks', () => {
    expect(R.applyHungarianCommas('Azt hiszem hogy holnap jövök')).toBe('Azt hiszem, hogy holnap jövök');
    expect(R.applyHungarianCommas('Jövök és hogy mikor')).toBe('Jövök és hogy mikor');
    expect(R.applyHungarianCommas('Az ügyfél aki tegnap írt még nem fizetett')).toBe('Az ügyfél, aki tegnap írt, még nem fizetett');
    expect(R.applyQuestionMark('Mikor tudnál ránézni a kampányra')).toBe('Mikor tudnál ránézni a kampányra?');
    expect(R.applyQuestionMark('Holnap jövök')).toBe('Holnap jövök');
    expect(R.applyQuestionMark('Megvan-e a számla')).toBe('Megvan-e a számla?');
    expect(R.applyQuestionMark('Can you send it today')).toBe('Can you send it today?');
  });
  it('quotes, accents, spoken addresses', () => {
    expect(R.applyHungarianQuotes('Azt írta: "Kész vagyunk."')).toBe('Azt írta: „Kész vagyunk.”');
    expect(R.restoreAccents('koszonom szepen a valaszt')).toBe('köszönöm szépen a választ');
    expect(R.restoreAccents('I like the mar file')).toBe('I like the mar file');
    expect(R.applySpokenAddresses('Írj az info kukac pelda pont hu címre.')).toBe('Írj az info@pelda.hu címre.');
    expect(R.applySpokenAddresses('A weboldal a pelda pont hu perjel blog.')).toBe('A weboldal a pelda.hu/blog.');
    expect(R.applySpokenAddresses('Send it to dorottya at example dot com.')).toBe('Send it to dorottya@example.com.');
  });
  it('dictionary with Hungarian suffixes', () => {
    expect(applyDictionary('a clickupban van', dict)).toBe('a ClickUpban van');
    expect(applyDictionary('küldd el Dorotyának', dict)).toBe('küldd el Dorottyának');
    expect(applyDictionary('a versel-en fut', dict)).toBe('a Vercel-en fut');
    expect(applyDictionary('nem szeretek verselni', dict)).toBe('nem szeretek verselni');
  });
  it('acronyms, greeting comma, e-mail layout', () => {
    expect(R.applyAcronyms('nézd meg a pr-t és az api-t')).toBe('nézd meg a PR-t és az API-t');
    expect(R.applyGreetingComma('szia meg tudnád nézni')).toBe('szia, meg tudnád nézni');
    expect(R.applyGreetingComma('Szia Anna')).toBe('Szia Anna');
    expect(R.layoutEmail('kedves péter köszönöm a választ üdvözlettel dorottya', 'hu')).toBe('Kedves Péter!\n\nKöszönöm a választ.\n\nÜdvözlettel:\nDorottya');
    expect(R.layoutEmail('holnap jövök', 'hu')).toBeNull();
  });
  it('fits to the surrounding text', () => {
    expect(R.fitToContext('Holnap elmehetnénk.', ctx({ before: 'Arra gondoltam, hogy ' }), [])).toBe('holnap elmehetnénk.');
    expect(R.fitToContext('Péterrel és Annával.', ctx({ before: 'Megbeszéltem ', after: ' hogy jövő héten kezdünk.' }), [])).toBe('Péterrel és Annával');
    expect(R.applyContextNames('Köszönöm, Szőts úr.', ctx({ before: 'Kedves Szőcs Gergely!\n\n' }))).toBe('Köszönöm, Szőcs úr.');
    expect(R.fitToContext('Szia.', ctx({ before: 'abc', isSecure: true }), [])).toBe('Szia.');
  });
  it('browser category from the window title', () => {
    expect(categoryForBundle('com.google.Chrome', 'Beérkező levelek - Gmail')).toBe('email');
    expect(categoryForBundle('com.google.Chrome', 'general - Slack')).toBe('work');
    expect(categoryForBundle('com.google.Chrome', 'Hírek')).toBe('other');
    expect(categoryForBundle('com.apple.mail', null)).toBe('email');
  });
  it('LLM guard', () => {
    const raw = 'mikor tudnál ránézni a kampányra';
    const local = 'Mikor tudnál ránézni a kampányra?';
    expect(llmAccept(raw, local, 'Mikor tudnál ránézni a kampányra?')).toBe(true);
    expect(llmAccept(raw, local, 'Holnap délután ránézek a kampányra, és küldök egy részletes összefoglalót mindenről.')).toBe(false);
    expect(llmAccept(raw, local, 'Mikor tudnál ránézni a kampányra.')).toBe(false);
    expect(llmAccept(raw, local, '')).toBe(false);
  });
  it('falls back to the local result when the LLM times out', async () => {
    const slow: ChatProvider = (_s, _u, signal) =>
      new Promise((res) => {
        const t = setTimeout(() => res({ ok: true, text: 'X' }), 3000);
        signal?.addEventListener('abort', () => clearTimeout(t));
      });
    const s = { ...settings(), llmTimeoutSeconds: 0.3 };
    const r = await formatDictation('holnap átküldöm az ajánlatot neked', s, emptyContext, 'other', slow);
    expect(r.usedLLM).toBe(false);
    expect(r.text).toBe('Holnap átküldöm az ajánlatot neked.');
  });
  it('uses the LLM result when it passes the guard', async () => {
    const ok: ChatProvider = async () => ({ ok: true, text: 'Szóval, holnap átküldöm az ajánlatot, nem, inkább ma.' });
    const r = await formatDictation('szóval holnap átküldöm az ajánlatot nem inkább ma', settings(), emptyContext, 'other', ok);
    expect(typeof r.text).toBe('string');
  });
  it('full Hungarian pipeline', () => {
    const out = processText('Öhm, szia anna, azt gondoltam hogy holnap tíz órakor, nem, inkább tizenegykor átküldöm a biznisz nétív ajánlatot', settings(), 'formal');
    expect(out).toContain('tizenegykor átküldöm a BusinessNative ajánlatot.');
    expect(out).not.toContain('tíz órakor');
  });
  it('fillers and discourse markers', () => {
    expect(removeFillers('Öhm, szóval holnap délelőtt, ööö, átküldöm az ajánlatot.')).toBe('holnap délelőtt átküldöm az ajánlatot.');
    expect(removeFillers('So, um, I think we should, uh, push it.')).toBe('I think we should push it.');
    expect(removeFillers('Hát izé, a számlát még nem kaptam meg.')).toBe('a számlát még nem kaptam meg.');
    expect(removeFillers('Szóval ez a terv.')).toBe('Szóval ez a terv.');
    expect(removeFillers('Ez, hmm, nagyon jó ötlet, ööö, csináljuk meg.')).toBe('Ez nagyon jó ötlet, csináljuk meg.');
  });
  it('a whole snippet is inserted verbatim', () => {
    const s = { ...defaultSettings(), snippets: [{ id: newId(), trigger: 'időpontfoglaló linkem', expansion: 'https://cal.example.com/dorottya' }] };
    expect(processText('Az időpontfoglaló linkem.', s, 'formal')).toBe('https://cal.example.com/dorottya');
  });
});

describe('AutoLearn', () => {
  it('learns a single-word correction', () => {
    const inserted = 'Köszönöm, Szőts úr.';
    const c = correction(inserted, 'Kedves Úr! Köszönöm, Szőts úr.', 'Kedves Úr! Köszönöm, Szőcs úr.', []);
    expect(c).toEqual({ heard: 'Szőts', term: 'Szőcs' });
    expect(correction(inserted, 'Köszönöm, Szőts úr.', 'Teljesen más szöveg itt.', [])).toBeNull();
    expect(correction(inserted, 'Köszönöm, Szőts úr.', 'Köszönöm, Kovács úr.', [])).toBeNull();
    const d = learn(c!, []);
    expect(d[0].term).toBe('Szőcs');
    expect(d[0].autoLearned).toBe(true);
  });
});

describe('Editing', () => {
  it('dictionary add merges case-insensitively', () => {
    let list = insertEntry(makeEntry(' BusinessNative ', 'biznisz nétív, Biznisz Nétív,  ')!, []);
    expect(list.length).toBe(1);
    expect(list[0].term).toBe('BusinessNative');
    expect(list[0].heardAs).toEqual(['biznisz nétív']);
    list = insertEntry(makeEntry('Kubernetes', '')!, list);
    list = insertEntry(makeEntry('businessnative', 'business native, businessnative')!, list);
    expect(list.length).toBe(2);
    expect(list[0].term).toBe('businessnative');
    expect(list[0].heardAs).toEqual(['biznisz nétív', 'business native']);
    expect(makeEntry('   ', 'x')).toBeNull();
  });
  it('auto-learned flag merge', () => {
    let list = insertEntry(entry('Shopify', ['sopifáj'], true), []);
    expect(list[0].autoLearned).toBe(true);
    list = insertEntry(entry('Shopify', [], false), list);
    expect(list[0].autoLearned).toBe(false);
  });
  it('dictionary update', () => {
    const e = entry('Exprt', ['a'], true);
    const other = entry('Más');
    const out = updateEntry(e.id, 'Expert', 'expört, Expert', [other, e]);
    expect(out[1].term).toBe('Expert');
    expect(out[1].heardAs).toEqual(['expört']);
    expect(out[1].autoLearned).toBe(false);
    expect(out[0]).toEqual(other);
    expect(updateEntry(e.id, ' ', '', [e])).toEqual([e]);
    expect(updateEntry('nope', 'X', '', [e])).toEqual([e]);
  });
  it('snippet save', () => {
    let list = saveSnippet(null, ' címem ', 'Budapest, Fő u. 1.', []);
    expect(list.length).toBe(1);
    expect(list[0].trigger).toBe('címem');
    list = saveSnippet(null, 'Címem', 'Új cím', list);
    expect(list.length).toBe(1);
    expect(list[0].expansion).toBe('Új cím');
    list = saveSnippet(null, 'aláírás', 'Üdv, Dorottya', list);
    const id = list[1].id;
    list = saveSnippet(id, 'aláírás', 'x', list);
    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({ trigger: 'aláírás', expansion: 'x' });
    expect(saveSnippet(null, '', 'x', list)).toEqual(list);
    expect(saveSnippet(null, 'a', '', list)).toEqual(list);
  });
  it('history search folds accents', () => {
    const mk = (text: string, rawText: string): HistoryItem => ({ id: newId(), date: 0, text, rawText, category: 'work', durationSeconds: 1, kind: 'dictation' });
    const a = mk('Küldd át a kérdést', 'küld át a kérdést');
    const b = mk('Holnap találkozunk', 'holnap');
    expect(filterHistory([a, b], 'kerdes')).toEqual([a]);
    expect(filterHistory([a, b], 'KÉRDÉS')).toEqual([a]);
    expect(filterHistory([a, b], 'kerdes holnap')).toEqual([]);
    expect(filterHistory([a, b], '  ')).toEqual([a, b]);
  });
});

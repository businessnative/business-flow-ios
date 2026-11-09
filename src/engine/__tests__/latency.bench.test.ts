// Reproducible startup / stop-to-text benchmark and Hungarian quality locks.
// Runtime: Node (V8) on the machine that runs `npm run bench`. This is NOT an iPhone, NOT Hermes,
// and NOT a live provider call. Native WAV encode and TLS are not timed here.
import { describe, expect, it } from 'vitest';

import { count, first, last } from '../chars';
import { formatDictation, type ChatProvider } from '../formatter';
import { prewarmTextPipeline, processText, textWordCount } from '../pipeline';
import { patternCacheSize } from '../regex';
import { defaultSettings, emptyContext, entry, type AppCategory, type AppSettings } from '../types';

const dict = [
  entry('BusinessNative', ['biznisz nétív', 'business native', 'biznisznétív']),
  entry('ClickUp'),
  entry('Supabase'),
  entry('Vercel', ['versel', 'verszel']),
  entry('Dorottya', ['Dorotya']),
];

function settings(): AppSettings {
  const s = defaultSettings();
  s.smartFormatting = false;
  s.dictionary = dict;
  for (const k of Object.keys(s.styles) as AppCategory[]) s.styles[k] = 'formal';
  return s;
}

const paragraph =
  'Öhm, szóval holnap délelőtt, ööö, azt hiszem hogy átküldöm a számlát mert az ügyfél aki tegnap írt még nem kapta meg és szeretném ha visszajelezne. Mikor tudnál ránézni a kampányra? ';

const fixtures: { id: string; raw: string; category: AppCategory; expected: string }[] = [
  { id: 'hu-filler', category: 'other', raw: 'Öhm, szóval holnap délelőtt, ööö, átküldöm az ajánlatot.', expected: 'Holnap délelőtt átküldöm az ajánlatot.' },
  { id: 'hu-comma-question', category: 'work', raw: 'Azt gondolom hogy ez a megoldás jó lesz mert gyors és olcsó. Mikor tudnál ránézni a kampányra', expected: 'Azt gondolom, hogy ez a megoldás jó lesz, mert gyors és olcsó. Mikor tudnál ránézni a kampányra?' },
  { id: 'hu-backtrack', category: 'other', raw: 'Küldd el Péternek, bocsánat, Gábornak a szerződést.', expected: 'Küldd el Gábornak a szerződést.' },
  { id: 'hu-dictionary', category: 'other', raw: 'A clickupban létrehoztam a feladatot és írtam Kiss Dorotyának.', expected: 'A ClickUpban létrehoztam a feladatot és írtam Kiss Dorottyának.' },
  { id: 'hu-accents', category: 'other', raw: 'Koszonom szepen a gyors valaszt', expected: 'Köszönöm szépen a gyors választ.' },
  { id: 'hu-email', category: 'email', raw: 'kedves péter köszönöm a gyors választ a szerződést holnap visszaküldöm üdvözlettel dorottya', expected: 'Kedves Péter!\n\nKöszönöm a gyors választ a szerződést holnap visszaküldöm.\n\nÜdvözlettel:\nDorottya' },
];

function local(raw: string, category: AppCategory) {
  return processText(raw, settings(), 'formal', emptyContext, category);
}

describe('latency benchmark (node, not device)', () => {
  it('[E-LAT-03] long Hungarian local cleanup stays under the node budget after prewarm', () => {
    const cold0 = performance.now();
    local(fixtures[0].raw, 'other');
    const coldMs = performance.now() - cold0;
    const before = patternCacheSize();
    prewarmTextPipeline();
    expect(patternCacheSize()).toBeGreaterThan(before);
    const long = paragraph.repeat(30);
    const times: number[] = [];
    for (let i = 0; i < 8; i++) {
      const t0 = performance.now();
      local(long, 'other');
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const warmP50 = times[Math.floor(times.length / 2)];
    const hist = Array.from({ length: 500 }, (_, i) => ({ id: String(i), date: 1_700_000_000_000 + i, text: paragraph, rawText: paragraph, category: 'other', durationSeconds: 12, kind: 'dictation' }));
    const blob = JSON.stringify(hist);
    const p0 = performance.now();
    const parsed = JSON.parse(blob) as { text: string }[];
    const parseMs = performance.now() - p0;
    const w0 = performance.now();
    let words = 0;
    for (const item of parsed) words += textWordCount(item.text);
    const wordMs = performance.now() - w0;
    const report = {
      runtime: `node ${process.version}`,
      engine: 'v8',
      nativeAudio: 'not measured (no swiftc / no iPhone in this run)',
      network: 'not called',
      coldShortMs: Number(coldMs.toFixed(2)),
      longWords: textWordCount(long),
      longChars: long.length,
      warmP50Ms: Number(warmP50.toFixed(2)),
      historyItems: parsed.length,
      historyBytes: blob.length,
      historyParseMs: Number(parseMs.toFixed(2)),
      historyWordCountMs: Number(wordMs.toFixed(2)),
      historyWords: words,
      patterns: patternCacheSize(),
    };
    console.log('BENCH ' + JSON.stringify(report));
    expect(warmP50).toBeLessThan(100);
    expect(parseMs + wordMs).toBeLessThan(50);
    expect(words).toBe(500 * textWordCount(paragraph));
  });

  it('[E-LAT-03] overlaps the cleanup with the in-flight LLM request and falls back to the same local text', async () => {
    const marks: string[] = [];
    let release!: (v: { ok: true; text: string } | { ok: false; error: string }) => void;
    const chat: ChatProvider = () => new Promise((r) => { release = r; });
    const raw = 'Mikor tudnál ránézni a kampányra mert sürgős a számla';
    const pending = formatDictation(raw, { ...settings(), smartFormatting: true }, emptyContext, 'work', chat, { mark: (s) => marks.push(s) });
    await new Promise((r) => setTimeout(r, 0));
    expect(marks).toEqual(['chat-scheduled', 'local-start', 'local-end']);
    const localOnly = await formatDictation(raw, settings(), emptyContext, 'work', null);
    release({ ok: true, text: 'Teljesen más, kitalált válasz, amit senki nem diktált a kampányról.' });
    const out = await pending;
    expect(out.llmRejected).toBe(true);
    expect(out.usedLLM).toBe(false);
    expect(out.text).toBe(localOnly.text);
  });
});

describe('Hungarian quality fixtures', () => {
  it('[E-HU-04] filler, comma, question, backtrack, dictionary, accents and email stay exact', () => {
    for (const f of fixtures) expect(local(f.raw, f.category), f.id).toBe(f.expected);
  });

  it('[E-HU-04] a long dictated paragraph keeps commas, the question mark and drops fillers', async () => {
    const out = local(paragraph.repeat(30), 'other');
    expect(out.toLowerCase()).not.toMatch(/öhm|ööö/);
    expect(out).toContain(', hogy');
    expect(out).toContain(', mert');
    expect(out).toContain('kampányra?');
    expect(out.startsWith('Holnap')).toBe(true);
    // Locked so a faster cleanup cannot silently change the text. Update only when the rules intentionally change.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(out));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('1dd2dbafc1f4e1b58c6ac4887e6e93fb812d9f0cca31e8dd2ebdda72ad495523');
  });

  it('first/last/count follow code points, including emoji', () => {
    for (const s of ['', 'a', 'árvíztűrő', '👋', 'a👋b', 'Szia!', '👨‍👩‍👧']) {
      const a = Array.from(s);
      expect(count(s)).toBe(a.length);
      expect(first(s)).toBe(a[0]);
      expect(last(s)).toBe(a[a.length - 1]);
    }
  });
});

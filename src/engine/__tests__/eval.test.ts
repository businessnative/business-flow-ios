// The 49 local eval cases from bn-flow-mac (Eval.swift), run through the TS engine.
// swift-local-eval.json = output of `Business Flow --eval local` (desktop 0.3.0) — the TS port must match it exactly.
import { describe, expect, it } from 'vitest';
import { formatDictation } from '../formatter';
import { categoryForBundle } from '../pipeline';
import { score } from '../editing';
import { defaultSettings, entry, newId, type AppSettings, type AppCategory } from '../types';
import { evalCases } from './evalCases';
import type { EvalCase } from './evalHelpers';
import swift from './swift-local-eval.json';

const defaultDictionary = [
  entry('BusinessNative', ['biznisz nétív', 'business native', 'biznisznétív']),
  entry('ClickUp'),
  entry('Supabase'),
  entry('Vercel', ['versel', 'verszel']),
  entry('Dorottya', ['Dorotya']),
];

function settingsFor(c: EvalCase): AppSettings {
  const s = defaultSettings();
  s.smartFormatting = false;
  s.dictionary = c.dictionary ? c.dictionary.map((d) => entry(d.term, d.heardAs ?? [])) : defaultDictionary;
  s.snippets = (c.snippets ?? []).map((x) => ({ id: newId(), ...x }));
  if (c.tone) for (const k of Object.keys(s.styles) as AppCategory[]) s.styles[k] = c.tone;
  return s;
}

async function run(c: EvalCase) {
  const r = await formatDictation(
    c.raw,
    settingsFor(c),
    { appName: '', before: c.before ?? '', after: c.after ?? '', isSecure: false },
    categoryForBundle(c.bundleID, c.windowTitle),
    null,
  );
  return r.text;
}

const swiftById = new Map((swift as { local: { cases: { id: string; output: string; checksPassed: number }[] } }).local.cases.map((x) => [x.id, x]));
const local = evalCases.filter((c) => !c.command);

describe('eval suite (local, offline)', () => {
  it('has the 49 local cases of the desktop suite', () => {
    expect(local.length).toBe(49);
    expect(swiftById.size).toBe(49);
  });

  for (const c of local) {
    it(`${c.id} matches the desktop (Swift) engine`, async () => {
      const out = await run(c);
      expect(out).toBe(swiftById.get(c.id)!.output);
    });
  }

  it('passes ≥ 98% of the content checks', async () => {
    let passed = 0;
    let total = 0;
    for (const c of local) {
      const r = score(c.contain ?? [], c.notContain ?? [], c.expected, await run(c));
      passed += r.passed;
      total += r.total;
    }
    expect(passed / total).toBeGreaterThanOrEqual(0.98);
  });
});

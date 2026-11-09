import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { defaultSettings } from '@/engine/types';
import { DIARIZE_MODEL } from '@/services/openai';
import {
  classifyFile, exportText, localSummary, parseDiarized, parseSpeakerSplit, parseSummary, parseTranscript, preservesText, speakerCount, type CallNote,
} from '../core';
import { callTimeoutS, processAudio, processTranscript } from '../pipeline';

// React Native's FormData accepts {uri,name,type} file parts; Node's does not → minimal stand-in.
class RNFormData {
  private m = new Map<string, unknown>();
  append(k: string, v: unknown) { this.m.set(k, v); }
  get(k: string) { return this.m.get(k) ?? null; }
}
vi.stubGlobal('FormData', RNFormData);

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const fail = (s: number) => new Response('{"error":{"message":"x"}}', { status: s });
type Route = (url: string, body: any) => Response | undefined;
const router = (r: Route) => {
  const calls: { url: string; body: any }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ url, body });
    return r(url, body) ?? fail(500);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};
const S = () => ({ ...defaultSettings(), transcriptionProvider: 'openai' as const, chatProviderId: 'openai' as const });
const SUM = JSON.stringify({ title: 'Ajánlat egyeztetés', summary: 'Péter ajánlatot kér péntekig.', decisions: ['Havi díj 120 ezer Ft'], todos: ['Ajánlat küldése péntekig'], followUps: [], keyFacts: ['120 000 Ft'] });
const chatOk = (t: string) => ok({ choices: [{ message: { content: t } }] });
const audio = { uri: 'file:///x/hivas.m4a', name: 'hivas.m4a', size: 2_000_000 };
const d = (fetchImpl: typeof fetch) => ({ fetchImpl, readBase64: async () => 'QUJD', sleep: async () => {} });

describe('call notes: core', () => {
  it('classifies files', () => {
    expect(classifyFile('Hívás.m4a')).toBe('audio');
    expect(classifyFile('leirat.txt')).toBe('text');
    expect(classifyFile('x.pdf')).toBe('unknown');
  });
  it('parses a labelled transcript with timestamps', () => {
    const p = parseTranscript('00:01\nDorottya: Szia Péter, kérnék egy ajánlatot.\n00:05 Péter: Persze, péntekig küldöm.\nfolytatás');
    expect(p.labelled).toBe(true);
    expect(p.segments.map((s) => s.speaker)).toEqual(['Dorottya', 'Péter']);
    expect(p.segments[0].start).toBe(1);
  });
  it('unlabelled transcript becomes one block', () => {
    const p = parseTranscript('Szia, itt Dorottya.\nKérnék egy ajánlatot.');
    expect(p.labelled).toBe(false);
    expect(p.segments).toHaveLength(1);
  });
  it('diarized json merges consecutive speakers', () => {
    const s = parseDiarized({ segments: [{ speaker: 'A', text: 'Szia', start: 0 }, { speaker: 'A', text: 'Péter.', start: 1 }, { speaker: 'B', text: 'Helló.', start: 2 }] });
    expect(s).toEqual([{ speaker: 'A', text: 'Szia Péter.', start: 0 }, { speaker: 'B', text: 'Helló.', start: 2 }]);
  });
  it('speaker split guard rejects summaries', () => {
    const orig = 'szia péter kérnék egy ajánlatot a weboldalra persze péntekig küldöm rendben köszönöm';
    expect(preservesText(orig, parseSpeakerSplit('A: szia péter kérnék egy ajánlatot a weboldalra\nB: persze péntekig küldöm\nA: rendben köszönöm'))).toBe(true);
    expect(preservesText(orig, parseSpeakerSplit('A: ajánlatot kér\nB: péntekig'))).toBe(false);
  });
  it('summary parse tolerates code fences; rejects junk', () => {
    expect(parseSummary('```json\n' + SUM + '\n```')?.todos).toEqual(['Ajánlat küldése péntekig']);
    expect(parseSummary('nem json')).toBeNull();
    expect(localSummary([{ speaker: 'A', text: 'Első mondat. Második. Harmadik. Negyedik.' }]).summary).toBe('Első mondat. Második. Harmadik.');
  });
  it('export uses speaker names', () => {
    const n: CallNote = { id: '1', date: 0, source: 'audio', status: 'done', segments: [{ speaker: 'A', text: 'Szia' }, { speaker: 'B', text: 'Helló' }], speakerMethod: 'diarize', speakerNames: { A: 'Én', B: 'Péter' }, transcript: '', summary: parseSummary(SUM) };
    const t = exportText(n);
    expect(t).toContain('Én: Szia');
    expect(t).toContain('Péter: Helló');
    expect(t).toContain('• Ajánlat küldése péntekig');
  });
  it('timeout grows with size', () => {
    expect(callTimeoutS(0)).toBe(60);
    expect(callTimeoutS(20 * 1048576)).toBe(360);
    expect(callTimeoutS(1e10)).toBe(600);
  });
});

describe('call notes: pipeline', () => {
  it('audio: diarize first → speakers from audio + LLM summary', async () => {
    const m = router((u) =>
      u.includes('audio/transcriptions') ? ok({ segments: [{ speaker: 'A', text: 'Szia Péter.', start: 0 }, { speaker: 'B', text: 'Helló!', start: 1 }] }) : u.includes('chat/completions') ? chatOk(SUM) : undefined,
    );
    const r = await processAudio(S(), { openai: 'sk-test' }, audio, d(m.fetchImpl));
    expect(r.speakerMethod).toBe('diarize');
    expect(speakerCount(r.segments)).toBe(2);
    expect(r.summary.title).toBe('Ajánlat egyeztetés');
    expect(r.summaryByLLM).toBe(true);
    const form = m.calls[0].body as FormData;
    expect(form.get('model')).toBe(DIARIZE_MODEL);
    expect(form.get('response_format')).toBe('diarized_json');
  });
  it('audio: diarize unavailable (400) → normal transcription + LLM speaker split', async () => {
    const text = 'Szia Péter, kérnék egy ajánlatot a weboldalra. Persze, péntekig küldöm. Rendben, köszönöm szépen.';
    const m = router((u, b) => {
      if (u.includes('audio/transcriptions')) return (b as FormData).get('model') === DIARIZE_MODEL ? fail(400) : ok({ text });
      if (u.includes('chat/completions')) return (b as any).messages[0].content.includes('beszélők jelölése nélkül') ? chatOk('A: Szia Péter, kérnék egy ajánlatot a weboldalra.\nB: Persze, péntekig küldöm.\nA: Rendben, köszönöm szépen.') : chatOk(SUM);
    });
    const r = await processAudio(S(), { openai: 'sk-test' }, audio, d(m.fetchImpl));
    expect(r.speakerMethod).toBe('llm');
    expect(r.segments.map((s) => s.speaker)).toEqual(['A', 'B', 'A']);
  });
  it('audio: LLM that summarises instead of labelling is rejected', async () => {
    const text = 'Szia Péter, kérnék egy ajánlatot a weboldalra. Persze, péntekig küldöm. Rendben, köszönöm szépen.';
    const m = router((u, b) => {
      if (u.includes('audio/transcriptions')) return (b as FormData).get('model') === DIARIZE_MODEL ? fail(400) : ok({ text });
      if (u.includes('chat/completions')) return (b as any).messages[0].content.includes('beszélők jelölése nélkül') ? chatOk('A: Ajánlatot kér.\nB: Péntekig.') : chatOk(SUM);
    });
    const r = await processAudio(S(), { openai: 'sk-test' }, audio, d(m.fetchImpl));
    expect(r.speakerMethod).toBe('none');
    expect(r.transcript).toContain('kérnék egy ajánlatot a weboldalra');
  });
  it('audio: bad key is surfaced, not silently retried', async () => {
    const m = router(() => fail(401));
    await expect(processAudio(S(), { openai: 'sk-bad' }, audio, d(m.fetchImpl))).rejects.toMatchObject({ kind: 'unauthorized' });
  });
  it('audio: too large → Hungarian message, no network', async () => {
    const m = router(() => ok({}));
    await expect(processAudio(S(), { openai: 'sk' }, { ...audio, size: 30 * 1048576 }, d(m.fetchImpl))).rejects.toThrow(/túl nagy/);
    expect(m.calls).toHaveLength(0);
  });
  it('transcript with labels: keeps speakers, no split call', async () => {
    const m = router((u) => (u.includes('chat/completions') ? chatOk(SUM) : undefined));
    const r = await processTranscript(S(), { openai: 'sk' }, 'Dorottya: Szia!\nPéter: Helló, mi újság?', d(m.fetchImpl));
    expect(r.speakerMethod).toBe('notes');
    expect(m.calls).toHaveLength(1);
  });
  it('no keys at all: transcript still gets a local summary', async () => {
    const m = router(() => undefined);
    const r = await processTranscript({ ...S(), providerFallback: false }, {}, 'Szia, itt Dorottya. Péntekig kérem az ajánlatot.', d(m.fetchImpl));
    expect(r.summaryByLLM).toBe(false);
    expect(r.summary.summary).toContain('Péntekig');
    expect(m.calls).toHaveLength(0);
  });
  it('summary LLM failure falls back to local summary', async () => {
    const m = router(() => fail(500));
    const r = await processTranscript(S(), { openai: 'sk' }, 'A: Szia!\nB: Helló, holnap hívlak.', d(m.fetchImpl));
    expect(r.summaryByLLM).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { OpenAIError, chat, mapStatus, parseChat, transcribe, transcriptionForm } from '@/services/openai';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, body = '{}') => new Response(body, { status });
const file = new Blob([new Uint8Array(44)], { type: 'audio/wav' });
const opts = { file, language: 'auto' as const, terms: ['Business Native', 'Supabase'], model: 'gpt-transcribe', fallbackModel: 'gpt-4o-transcribe' };
const noSleep = async () => {};

describe('OpenAI client port', () => {
  it('maps HTTP statuses like the Swift client', () => {
    expect(mapStatus(401, '')).toBe('unauthorized');
    expect(mapStatus(429, '{"error":{"code":"insufficient_quota"}}')).toBe('quota');
    expect(mapStatus(429, '')).toBe('rateLimit');
    expect(mapStatus(413, '')).toBe('tooLarge');
    expect(mapStatus(422, '')).toBe('badRequest');
    expect(mapStatus(503, '')).toBe('server');
  });
  it('builds gpt-transcribe multipart with languages[] and keywords[]', () => {
    const f = transcriptionForm(opts, 'gpt-transcribe');
    expect(f.getAll('languages[]')).toEqual(['hu', 'en']);
    expect(f.getAll('keywords[]')).toEqual(['Business Native', 'Supabase']);
    expect(f.get('language')).toBeNull();
    const g = transcriptionForm({ ...opts, language: 'hu' }, 'gpt-4o-transcribe');
    expect(g.get('language')).toBe('hu');
    expect(g.getAll('keywords[]')).toEqual([]);
  });
  it('requires an API key', async () => {
    await expect(transcribe({ apiKey: null }, opts)).rejects.toMatchObject({ kind: 'noAPIKey' });
  });
  it('retries once on 5xx, then falls back on 400', async () => {
    const calls: string[] = [];
    const seq = [fail(500), fail(400), ok({ text: ' Szia ' })];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      calls.push(String((init.body as FormData).get('model')));
      return seq.shift()!;
    }) as unknown as typeof fetch;
    await expect(transcribe({ apiKey: 'k', fetchImpl, sleep: noSleep }, opts)).resolves.toBe('Szia');
    expect(calls).toEqual(['gpt-transcribe', 'gpt-transcribe', 'gpt-4o-transcribe']);
  });
  it('empty transcription is an error', async () => {
    const fetchImpl = (async () => ok({ text: '  ' })) as unknown as typeof fetch;
    await expect(transcribe({ apiKey: 'k', fetchImpl, sleep: noSleep }, opts)).rejects.toBeInstanceOf(OpenAIError);
  });
  it('parses chat content strings and part arrays', async () => {
    expect(parseChat({ choices: [{ message: { content: 'Szia!' } }] })).toBe('Szia!');
    expect(parseChat({ choices: [{ message: { content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] } }] })).toBe('AB');
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const m = JSON.parse(String(init.body)).model;
      return m === 'gpt-5.6-luna' ? fail(404) : ok({ choices: [{ message: { content: 'Kész.' } }] });
    }) as unknown as typeof fetch;
    await expect(chat({ apiKey: 'k', fetchImpl }, 'gpt-5.6-luna', 'gpt-4.1-mini', 's', 'u')).resolves.toBe('Kész.');
  });
});

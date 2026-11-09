import { describe, expect, it, vi } from 'vitest';


import { chatAny, claudeChat, geminiChat, geminiTranscribe, mapProviderStatus, PROVIDERS, resetProviderWarmup, testKey, transcribeAny, transcriptionOrder, warmTranscriptionConnection, type RouteSettings } from '@/services/providers';
import { KEYCHAIN_ERROR_MSG, KEYCHAIN_TIMEOUT_MSG, readKey, invalidateKeyCache, setKey } from '@/state/keychain';
import { defaultSettings, mergeSettings } from '@/engine/types';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1, getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const fail = (s: number, b = '{}') => new Response(b, { status: s });
type Call = { url: string; headers: Record<string, string>; body: any };
const mock = (seq: Response[]) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: init.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : null });
    return seq.shift()!;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};
const base: RouteSettings = defaultSettings();
const claudeOk = (t: string) => ok({ content: [{ type: 'text', text: t }] });
const gemOk = (t: string) => ok({ candidates: [{ content: { parts: [{ text: 'gondolkodik', thought: true }, { text: t }] } }] });

describe('providers', () => {
  it('Claude: correct headers/body, parses text blocks', async () => {
    const m = mock([claudeOk('Szia!')]);
    await expect(claudeChat({ apiKey: 'sk-ant-x', fetchImpl: m.fetchImpl }, 'claude-haiku-5-5', 'sys', 'u')).resolves.toBe('Szia!');
    expect(m.calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(m.calls[0].headers['x-api-key']).toBe('sk-ant-x');
    expect(m.calls[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(m.calls[0].body).toMatchObject({ model: 'claude-haiku-5-5', system: 'sys', messages: [{ role: 'user', content: 'u' }] });
  });
  it('Gemini chat skips thought parts; transcribe sends inline audio', async () => {
    const m = mock([gemOk('Kész.'), gemOk('Helló világ')]);
    await expect(geminiChat({ apiKey: 'g', fetchImpl: m.fetchImpl }, 'gemini-3.5-flash-lite', 's', 'u')).resolves.toBe('Kész.');
    expect(m.calls[0].url).toContain('models/gemini-3.5-flash-lite:generateContent');
    expect(m.calls[0].headers['x-goog-api-key']).toBe('g');
    await expect(geminiTranscribe({ apiKey: 'g', fetchImpl: m.fetchImpl }, 'gemini-3.5-flash-lite', 'QUJD', 'hu', ['Supabase'])).resolves.toBe('Helló világ');
    expect(m.calls[1].body.contents[0].parts[1].inline_data).toEqual({ mime_type: 'audio/wav', data: 'QUJD' });
  });
  it('maps provider-specific errors', () => {
    expect(mapProviderStatus(400, '{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}')).toBe('unauthorized');
    expect(mapProviderStatus(529, '')).toBe('server');
    expect(mapProviderStatus(401, '')).toBe('unauthorized');
  });
  it('chat falls back to another provider when the chosen one fails', async () => {
    const m = mock([fail(401), gemOk('Rendben.')]);
    const s = { ...base, chatProviderId: 'anthropic' as const };
    await expect(chatAny(s, { anthropic: 'sk-ant-bad', gemini: 'g' }, 's', 'u', undefined, { fetchImpl: m.fetchImpl })).resolves.toBe('Rendben.');
    expect(m.calls.map((c) => new URL(c.url).host)).toEqual(['api.anthropic.com', 'generativelanguage.googleapis.com']);
  });
  it('model fallback within a provider on 400, no provider switch when fallback is off', async () => {
    const m = mock([fail(400), claudeOk('OK')]);
    const s = { ...base, chatProviderId: 'anthropic' as const, providerFallback: false };
    await expect(chatAny(s, { anthropic: 'k', openai: 'o' }, 's', 'u', undefined, { fetchImpl: m.fetchImpl })).resolves.toBe('OK');
    expect(m.calls.map((c) => c.body.model)).toEqual(['claude-haiku-5-5', 'claude-haiku-4-5']);
    const m2 = mock([fail(401)]);
    await expect(chatAny(s, { anthropic: 'k', openai: 'o' }, 's', 'u', undefined, { fetchImpl: m2.fetchImpl })).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(m2.calls).toHaveLength(1);
  });
  it('transcription: OpenAI failure falls over to Gemini; Claude never used for STT', async () => {
    expect(transcriptionOrder(base, { openai: 'o', gemini: 'g', anthropic: 'a' })).toEqual(['openai', 'gemini']);
    expect(transcriptionOrder(base, { openai: 'o', anthropic: 'a' })).toEqual(['openai']);
    const m = mock([fail(401), gemOk('Szia')]);
    const r = await transcribeAny(base, { openai: 'bad', gemini: 'g' }, { file: new Blob([new Uint8Array(44)]), uri: 'file:///a.wav', language: 'hu', terms: [], readBase64: async () => 'QQ==' }, { fetchImpl: m.fetchImpl, sleep: async () => {} });
    expect(r).toEqual({ text: 'Szia', provider: 'gemini' });
  });
  it('silence is not retried on another provider', async () => {
    const m = mock([ok({ text: '' }), ok({ text: '' })]);
    await expect(transcribeAny(base, { openai: 'o', gemini: 'g' }, { file: new Blob([]), uri: 'x', language: 'hu', terms: [], readBase64: async () => '' }, { fetchImpl: m.fetchImpl, sleep: async () => {} })).rejects.toMatchObject({ kind: 'emptyResult' });
    expect(m.calls.every((c) => c.url.includes('openai'))).toBe(true);
  });
  it('Kulcs tesztelése: GET model list, Hungarian result, key not in message', async () => {
    const m = mock([ok({ data: [] }), fail(401)]);
    const good = await testKey('openai', 'sk-secret123', { fetchImpl: m.fetchImpl });
    expect(good).toEqual({ ok: true, message: 'OpenAI: a kulcs működik.' });
    expect(m.calls[0].url).toBe('https://api.openai.com/v1/models');
    const bad = await testKey('gemini', 'AIzaSECRET', { fetchImpl: m.fetchImpl });
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('érvénytelen');
    expect(bad.message).not.toContain('SECRET');
  });
  it('key format hints and key pages exist for every provider', () => {
    expect(PROVIDERS.openai.looksLikeKey('sk-' + 'a'.repeat(30))).toBe(true);
    expect(PROVIDERS.anthropic.looksLikeKey('sk-ant-' + 'a'.repeat(30))).toBe(true);
    expect(PROVIDERS.anthropic.transcriptionModels).toEqual([]);
    for (const p of Object.values(PROVIDERS)) expect(p.keyUrl).toMatch(/^https:\/\//);
  });
  it('migrates old settings to OpenAI providers with fallback on', () => {
    const m = mergeSettings({ settingsVersion: 2, chatModel: 'gpt-5.6-luna' } as never);
    expect(m.transcriptionProvider).toBe('openai');
    expect(m.chatProviderId).toBe('openai');
    expect(m.providerFallback).toBe(true);
    expect(mergeSettings({ transcriptionProvider: 'anthropic' } as never).transcriptionProvider).toBe('openai');
  });
});

describe('transcription connection warmup', () => {
  it('HEAD to the provider host, no body, key stays out of the URL, second call is skipped', async () => {
    resetProviderWarmup();
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.method).toBe('HEAD');
      expect(init.body).toBeUndefined();
      expect(url).toBe('https://api.openai.com/v1/models');
      expect(url.includes('sk-test')).toBe(false);
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
      return new Response(null, { status: 200 });
    });
    warmTranscriptionConnection(defaultSettings(), { openai: 'sk-test' }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    warmTranscriptionConnection(defaultSettings(), { openai: 'sk-test' }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  });
});

describe('keychain reads never block', () => {
  it('times out with a Hungarian message', async () => {
    invalidateKeyCache();
    const r = await readKey('openai', 20, () => new Promise(() => {}));
    expect(r).toEqual({ value: null, error: KEYCHAIN_TIMEOUT_MSG });
  });
  it('overlapping reads share one call; a late success after timeout stays cached', async () => {
    invalidateKeyCache();
    let resolve!: (v: string) => void;
    const impl = vi.fn(() => new Promise<string>((res) => { resolve = res; }));
    const a = readKey('openai', 20, impl);
    const b = readKey('openai', 20, impl);
    expect(impl).toHaveBeenCalledTimes(1);
    await expect(a).resolves.toMatchObject({ error: KEYCHAIN_TIMEOUT_MSG });
    await expect(b).resolves.toMatchObject({ error: KEYCHAIN_TIMEOUT_MSG });
    resolve('sk-late');
    await vi.waitFor(async () => expect((await readKey('openai', 50, async () => 'no')).value).toBe('sk-late'));
  });
  it('a read that started before setKey cannot put the old value back', async () => {
    invalidateKeyCache();
    let resolve!: (v: string) => void;
    const pending = readKey('gemini', 500, () => new Promise<string>((res) => { resolve = res; }));
    await setKey('gemini', 'sk-new-value');
    resolve('sk-old');
    await pending;
    expect((await readKey('gemini', 50, async () => 'should-not-read')).value).toBe('sk-new-value');
  });
  it('errors become a Hungarian message, success is cached', async () => {
    invalidateKeyCache();
    expect(await readKey('gemini', 100, async () => { throw new Error('errSec'); })).toEqual({ value: null, error: KEYCHAIN_ERROR_MSG });
    const impl = vi.fn(async () => 'k');
    expect((await readKey('anthropic', 100, impl)).value).toBe('k');
    expect((await readKey('anthropic', 100, impl)).value).toBe('k');
    expect(impl).toHaveBeenCalledTimes(1);
  });
});

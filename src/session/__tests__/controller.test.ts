// Eval-protocol integration tests for the session controller (evals/PROTOCOL.md). Native module, Keychain, store and
// file system are mocked; the HTTP layer is a scripted fetch. Test names carry [E-xx] case IDs for evals/run.mjs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSettings, type AppSettings } from '@/engine/types';

const h = vi.hoisted(() => {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const fs: Record<string, any> = {};
  const reset = () => {
    for (const k of Object.keys(listeners)) delete listeners[k];
    Object.assign(fs, {
      active: false,
      isSessionActive: vi.fn(() => fs.active),
      micPermission: vi.fn(() => 'granted'),
      requestMicPermission: vi.fn(async () => true),
      startSession: vi.fn(async () => { fs.active = true; }),
      stopSession: vi.fn(async () => { fs.active = false; }),
      startRecording: vi.fn(async () => {}),
      stopRecording: vi.fn(async () => ({ uri: 'file:///tmp/a.wav', seconds: 3, speechSeconds: 2.5, silent: false })),
      cancelRecording: vi.fn(),
      restartEngine: vi.fn(async () => {}),
      isRecording: vi.fn(() => false),
      bufferAgeMs: vi.fn(() => 50),
      publishState: vi.fn(),
      playCue: vi.fn(),
      deleteFile: vi.fn(),
      copied: [] as [string, string][],
      getShared: vi.fn(() => null),
      setShared: vi.fn(),
      addListener: vi.fn((name: string, cb: (e: any) => void) => { (listeners[name] ??= []).push(cb); return { remove() {} }; }),
    });
  };
  reset();
  const state: { settings: any; history: any[] } = { settings: null, history: [] };
  const keys: { value: any } = { value: { keys: { openai: 'sk-test' } } };
  return { listeners, fs, reset, state, keys, emit: (n: string, e: any) => (listeners[n] ?? []).forEach((l) => l(e)) };
});

vi.mock('../../../modules/flow-session', () => ({ default: h.fs }));
vi.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    exists = false;
    constructor(a: any, b?: any) { this.uri = typeof b === 'string' ? `file:///docs/dictation-audio/${b}` : String(a); }
    async base64() { return 'UklGRg=='; }
    copy(dest: { uri: string }) { h.fs.copied.push([this.uri, dest.uri]); }
    delete() {}
  },
  Directory: class { exists = false; create() { this.exists = true; } },
  Paths: { document: 'file:///docs' },
}));
vi.mock('@/state/keychain', () => ({ readAllKeys: vi.fn(() => (h.keys.value === 'hang' ? new Promise(() => {}) : Promise.resolve(h.keys.value))) }));
vi.mock('@/state/store', () => ({
  getState: () => h.state,
  addHistory: vi.fn((i: any) => { h.state.history = [i, ...h.state.history.filter((x: any) => x.id !== i.id)]; }),
  updateHistory: vi.fn((id: string, patch: any) => { h.state.history = h.state.history.map((x: any) => (x.id === id ? { ...x, ...patch } : x)); }),
}));

type Route = (url: string, init: any) => Promise<Response | "hang"> | "hang";
let route: Route;
const json = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const okRoute: Route = async (url) =>
  url.includes('audio/transcriptions') ? json(200, { text: 'szia ez egy teszt' })
  : url.includes('chat/completions') ? json(200, { choices: [{ message: { content: 'Szia, ez egy teszt.' } }] })
  : url.includes('generateContent') ? json(200, { candidates: [{ content: { parts: [{ text: 'szia ez egy teszt' }] } }] })
  : json(404, {});
const calls: string[] = [];
const forms: { parts: [string, unknown][] }[] = [];

async function load(patch: Partial<AppSettings> = {}) {
  vi.resetModules();
  h.reset();
  h.state.settings = { ...defaultSettings(), smartFormatting: false, ...patch };
  h.state.history = [];
  calls.length = 0;
  forms.length = 0;
  return import('../controller');
}
const flush = async (n = 20) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

beforeEach(() => {
  route = okRoute;
  h.keys.value = { keys: { openai: 'sk-test' } };
  (globalThis as any).FormData = class { parts: [string, unknown][] = []; constructor() { forms.push(this); } append(k: string, v: unknown) { this.parts.push([k, v]); } };
  globalThis.fetch = vi.fn((url: any, init: any) => {
    calls.push(String(url));
    const r = route(String(url), init);
    if (r === 'hang') return new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    return r;
  }) as any;
});
afterEach(() => { vi.useRealTimers(); });

const appStart = (c: any) => c.start({ id: 'j1', category: 'other', before: '', after: '', source: 'app' });

describe('start / stop reliability', () => {
  it('[E-SS-01] 20 start→stop cycles all end in done, never stuck', async () => {
    const c = await load();
    for (let i = 0; i < 20; i++) {
      await c.start({ id: 'j' + i, category: 'other', before: '', after: '', source: 'app' });
      expect(c.getSession().phase).toBe('recording');
      await c.stop();
      expect(c.getSession().phase).toBe('done');
    }
    expect(h.fs.deleteFile).toHaveBeenCalledTimes(20);
  });

  it('[E-SS-02] start pressed while processing aborts the old job and starts a new one', async () => {
    const c = await load();
    route = () => 'hang';
    await appStart(c);
    void c.stop();
    await flush();
    expect(c.getSession().phase).toBe('processing');
    await c.start({ id: 'j2', category: 'other', before: '', after: '', source: 'app' });
    expect(c.getSession().phase).toBe('recording');
  });

  it('[E-SS-03] mic start that never answers fails within the start watchdog and the next start works', async () => {
    const c = await load();
    h.fs.startRecording.mockImplementationOnce(() => new Promise(() => {}));
    void appStart(c);
    await flush();
    expect(c.getSession().phase).toBe('starting');
    c.tick(Date.now() + 7000);
    await flush();
    expect(c.getSession().phase).toBe('error');
    expect(c.getSession().error).toMatch(/mikrofon/i);
    await c.start({ id: 'j2', category: 'other', before: '', after: '', source: 'app' });
    expect(c.getSession().phase).toBe('recording');
  });

  it('[E-SS-04] hanging transcription is aborted by the processing watchdog; audio kept for Újra', async () => {
    const c = await load();
    route = () => 'hang';
    await appStart(c);
    void c.stop();
    await flush();
    c.tick(Date.now() + 200_000);
    await flush(60);
    expect(c.getSession().phase).toBe('error');
    expect(c.canRetry()).toBe(true);
    route = okRoute;
    await c.retryLast();
    expect(c.getSession().phase).toBe('done');
  });

  it('[E-SS-05] mic stall: one silent engine restart, then a clear error', async () => {
    const c = await load();
    await appStart(c);
    h.fs.bufferAgeMs.mockReturnValue(3000);
    c.tick(Date.now() + 2000);
    await flush();
    expect(h.fs.restartEngine).toHaveBeenCalledTimes(1);
    expect(c.getSession().phase).toBe('recording');
    c.tick(Date.now() + 100);
    await flush();
    expect(c.getSession().phase).toBe('error');
  });

  it('[E-SS-06] stop/release during starting cancels cleanly to idle', async () => {
    const c = await load();
    h.fs.startRecording.mockImplementationOnce(() => new Promise(() => {}));
    void appStart(c);
    await flush();
    await c.stop();
    expect(c.getSession().phase).toBe('idle');
    expect(h.fs.cancelRecording).toHaveBeenCalled();
  });

  it('[E-SS-07] cancel during processing → idle, no error, audio deleted', async () => {
    const c = await load();
    route = () => 'hang';
    await appStart(c);
    void c.stop();
    await flush();
    c.cancel();
    await flush(60);
    expect(c.getSession().phase).toBe('idle');
    expect(c.getSession().error).toBeNull();
    expect(h.fs.deleteFile).toHaveBeenCalled();
  });
});

describe('audio interruptions and routes', () => {
  it('[E-INT-01] call/Siri while recording salvages the audio and shows the notice while processing', async () => {
    const c = await load();
    c.initSession();
    let release!: () => void;
    route = (url) => new Promise((r) => { release = () => r(json(200, { text: 'szia ez egy teszt' })); void url; });
    await appStart(c);
    h.emit('onInterruption', { reason: 'interrupted' });
    await flush();
    expect(h.fs.stopRecording).toHaveBeenCalled();
    expect(c.getSession().phase).toBe('processing');
    expect(c.getSession().error ?? '').toMatch(/megszakadt/);
    release();
    await flush(60);
    expect(c.getSession().phase).toBe('done');
  });

  it('[E-INT-02] interruption while the mic is starting fails clearly', async () => {
    const c = await load();
    c.initSession();
    h.fs.startRecording.mockImplementationOnce(() => new Promise(() => {}));
    void appStart(c);
    await flush();
    h.emit('onInterruption', { reason: 'interrupted' });
    expect(c.getSession().phase).toBe('error');
    expect(c.getSession().error).toMatch(/hívás/);
  });

  it('[E-INT-03] AirPods / Bluetooth route change (reset) keeps recording', async () => {
    const c = await load();
    c.initSession();
    await appStart(c);
    h.emit('onInterruption', { reason: 'reset' });
    await flush();
    expect(c.getSession().phase).toBe('recording');
    expect(h.fs.stopRecording).not.toHaveBeenCalled();
  });
});

describe('background / foreground / app kill', () => {
  it('[E-BG-01] stale keyboard commands (>30 s) are ignored, fresh ones run', async () => {
    const c = await load();
    c.initSession();
    const now = Date.now() / 1000;
    h.emit('onCommand', { json: JSON.stringify({ action: 'start', id: 'old', ts: now - 60, category: 'other', before: '', after: '', mode: 'toggle' }) });
    await flush();
    expect(h.fs.startRecording).not.toHaveBeenCalled();
    h.emit('onCommand', { json: JSON.stringify({ action: 'start', id: 'new', ts: now, category: 'other', before: '', after: '', mode: 'toggle' }) });
    await flush();
    expect(h.fs.startRecording).toHaveBeenCalledTimes(1);
  });

  it('[E-BG-02] cold launch from the keyboard runs only a fresh pending command, once', async () => {
    const c = await load();
    const cmd = (ts: number) => JSON.stringify({ action: 'start', id: 'k', ts, category: 'other', before: '', after: '', mode: 'toggle' });
    h.fs.getShared.mockReturnValueOnce(cmd(Date.now() / 1000 - 20));
    expect(await c.runPendingCommand()).toBe(false);
    h.fs.getShared.mockReturnValueOnce(cmd(Date.now() / 1000));
    expect(await c.runPendingCommand()).toBe(true);
    expect(h.fs.setShared).toHaveBeenCalledWith('flow.cmd', null);
    expect(c.getSession().phase).toBe('recording');
  });

  it('[E-BG-03] keyboard result keeps the cursor context (leading space after a word)', async () => {
    const c = await load();
    await c.start({ id: 'k1', category: 'other', before: 'Helló', after: '', source: 'keyboard' });
    await c.stop();
    const last = JSON.parse(h.fs.publishState.mock.calls.at(-1)[0]);
    expect(last.phase).toBe('done');
    expect(last.text.startsWith(' ')).toBe(true);
  });
});

describe('network, providers, keys', () => {
  it('[E-NET-01] offline → clear Hungarian error, audio kept, Újra works when back online', async () => {
    const c = await load();
    route = async () => { throw new TypeError('Network request failed'); };
    await appStart(c);
    await c.stop();
    expect(c.getSession().phase).toBe('error');
    expect(c.getSession().error).toMatch(/hálózat/i);
    expect(c.canRetry()).toBe(true);
    route = okRoute;
    await c.retryLast();
    expect(c.getSession().phase).toBe('done');
  });

  it('[E-NET-02] slow OpenAI → falls over to Gemini before the processing watchdog fires', async () => {
    vi.useFakeTimers();
    const c = await load({ providerFallback: true });
    h.keys.value = { keys: { openai: 'sk-test', gemini: 'g-test' } };
    route = (url) => (url.includes('openai.com') ? 'hang' : okRoute(url, {}));
    await appStart(c);
    void c.stop();
    await vi.advanceTimersByTimeAsync(44_000);
    expect(c.getSession().phase).toBe('done');
    expect(calls.some((u) => u.includes('generateContent'))).toBe(true);
  });

  it('[E-NET-03] slow network without fallback ends in a retryable timeout error, never hangs', async () => {
    vi.useFakeTimers();
    const c = await load({ providerFallback: false });
    route = () => 'hang';
    await appStart(c);
    void c.stop();
    await vi.advanceTimersByTimeAsync(200_000);
    expect(c.getSession().phase).toBe('error');
    expect(c.canRetry()).toBe(true);
  });

  it('[E-KEY-01] no key → points to Settings → Providers', async () => {
    const c = await load();
    h.keys.value = { keys: {} };
    await appStart(c);
    await c.stop();
    expect(c.getSession().error).toMatch(/Szolgáltatók/);
  });

  it('[E-KEY-03] credit exhausted on Gemini names Gemini, not OpenAI', async () => {
    const c = await load({ transcriptionProvider: 'gemini', providerFallback: false });
    h.keys.value = { keys: { gemini: 'g-test' } };
    route = async () => json(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota' } });
    await appStart(c);
    await c.stop();
    expect(c.getSession().error).toMatch(/Gemini|Google/);
    expect(c.getSession().error).not.toMatch(/OpenAI/);
  });

  it('[E-KEY-04] OpenAI credit exhausted → OpenAI billing message', async () => {
    const c = await load({ providerFallback: false });
    route = async () => json(429, { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } });
    await appStart(c);
    await c.stop();
    expect(c.getSession().error).toMatch(/OpenAI/);
    expect(c.getSession().error).toMatch(/keret|egyenleg/);
  });

  it('[E-KC-04] Keychain that hangs (locked device) fails in ≤4 s with an unlock hint, audio kept', async () => {
    vi.useFakeTimers();
    const c = await load();
    h.keys.value = 'hang';
    await appStart(c);
    void c.stop();
    await vi.advanceTimersByTimeAsync(4500);
    expect(c.getSession().phase).toBe('error');
    expect(c.getSession().error).toMatch(/kulcstartó/);
    expect(c.canRetry()).toBe(true);
  });
});

describe('silence, long recordings, settings, latency', () => {
  it('[E-SIL-01] silent recording → no API call, friendly message, file deleted', async () => {
    const c = await load();
    h.fs.stopRecording.mockResolvedValueOnce({ uri: 'file:///tmp/s.wav', seconds: 4, speechSeconds: 0, silent: true });
    await appStart(c);
    await c.stop();
    expect(calls.length).toBe(0);
    expect(c.getSession().error).toMatch(/Nem hallottunk/);
    expect(h.fs.deleteFile).toHaveBeenCalledWith('file:///tmp/s.wav');
  });

  it('[E-SIL-02] hallucination-only transcript on near silence → "Nem hallottunk semmit"', async () => {
    const c = await load();
    h.fs.stopRecording.mockResolvedValueOnce({ uri: 'file:///tmp/s.wav', seconds: 4, speechSeconds: 0.3, silent: false });
    route = async (url) => (url.includes('transcriptions') ? json(200, { text: 'Köszönöm a figyelmet!' }) : okRoute(url, {}));
    await appStart(c);
    await c.stop();
    expect(c.getSession().error).toMatch(/Nem hallottunk/);
  });

  it('[E-LONG-01] 5-minute cap stops and transcribes (does not drop the recording)', async () => {
    const c = await load();
    await appStart(c);
    c.tick(Date.now() + 5 * 60_000 + 1000);
    await flush(80);
    expect(h.fs.stopRecording).toHaveBeenCalled();
    expect(c.getSession().phase).toBe('done');
  });

  it('[E-SET-01] silent defaults: a full dictation plays no cue; enabling sounds plays them', async () => {
    let c = await load();
    await appStart(c);
    await c.stop();
    expect(h.fs.playCue).not.toHaveBeenCalled();
    c = await load({ sounds: true, soundVolume: 0.2 });
    await appStart(c);
    await c.stop();
    expect(h.fs.playCue).toHaveBeenCalledWith('start', 0.2);
  });

  it('[E-LAT-03] keychain read starts while the mic is still coming up', async () => {
    const { readAllKeys } = await import('@/state/keychain');
    const mocked = vi.mocked(readAllKeys);
    const c = await load();
    const phases: string[] = [];
    mocked.mockImplementation(() => {
      phases.push(c.getSession().phase);
      return Promise.resolve(h.keys.value);
    });
    try {
      await appStart(c);
      expect(phases[0]).toBe('starting');
      await c.stop();
      expect(c.getSession().phase).toBe('done');
    } finally {
      mocked.mockImplementation(() => (h.keys.value === 'hang' ? new Promise(() => {}) : Promise.resolve(h.keys.value)));
    }
  });

  it('[E-LAT-01] per-stage latency is measured (keychain / transcribe / format / total)', async () => {
    const c = await load();
    await appStart(c);
    await c.stop();
    const t = (c.getSession() as any).timings;
    expect(t).toBeTruthy();
    for (const k of ['keychainMs', 'transcribeMs', 'formatMs', 'totalMs']) expect(typeof t[k]).toBe('number');
    expect(t.provider).toBe('openai');
  });
});

const secret = () => 'sk-' + 'c'.repeat(24);
const savedUri = (id = 'j1') => `file:///docs/dictation-audio/${id}.wav`;

describe('dictation recovery', () => {
  it('[E-REC-01] network, keychain and empty attempts are stored with a Hungarian reason and on-device audio', async () => {
    let c = await load();
    route = async () => { throw new TypeError('Network request failed'); };
    await appStart(c);
    await c.stop();
    expect(c.getSession().phase).toBe('error');
    expect(h.state.history[0]).toMatchObject({ status: 'failed', audioUri: savedUri() });
    expect(h.state.history[0].reason ?? h.state.history[0].error).toMatch(/hálózat/i);
    expect(h.fs.deleteFile).toHaveBeenCalledWith('file:///tmp/a.wav');
    expect(h.fs.deleteFile).not.toHaveBeenCalledWith(savedUri());

    c = await load();
    h.keys.value = { keys: {}, error: 'Nem sikerült kiolvasni az API-kulcsot a kulcstartóból. Mentsd el újra a Beállításokban.' };
    await appStart(c);
    await c.stop();
    expect(calls).toHaveLength(0);
    expect(h.state.history[0]).toMatchObject({ status: 'failed', audioUri: savedUri() });
    expect(h.state.history[0].reason ?? '').toMatch(/kulcs|kulcstartó/i);

    c = await load();
    h.keys.value = { keys: { openai: 'sk-test' } };
    h.fs.stopRecording.mockResolvedValueOnce({ uri: 'file:///tmp/s.wav', seconds: 4, speechSeconds: 0.3, silent: false });
    route = async (url) => (url.includes('transcriptions') ? json(200, { text: 'Köszönöm a figyelmet!' }) : okRoute(url, {}));
    await c.start({ id: 'empty1', category: 'other', before: '', after: '', source: 'app' });
    await c.stop();
    expect(h.state.history[0]).toMatchObject({ id: 'empty1', status: 'empty', audioUri: 'file:///docs/dictation-audio/empty1.wav' });
    expect(h.state.history[0].text).toBe('');
    expect(h.state.history[0].rawText).toBe('');
    expect(JSON.stringify(h.state.history[0])).not.toContain('Köszönöm');
  });

  it('[E-REC-01] a stalled mic keeps the recording as an interrupted history row', async () => {
    const c = await load();
    await appStart(c);
    h.fs.bufferAgeMs.mockReturnValue(3000);
    c.tick(Date.now() + 2000);
    await flush();
    c.tick(Date.now() + 100);
    await flush();
    expect(c.getSession().phase).toBe('error');
    expect(h.state.history[0]).toMatchObject({ status: 'interrupted', audioUri: savedUri() });
    expect(h.state.history[0].reason ?? '').toMatch(/mikrofon|Előzmény/i);
  });

  it('[E-REC-02] keyboard text stays in history when the field never confirms the insert', async () => {
    const c = await load({ retention: 'never' });
    await c.start({ id: 'kb1', category: 'email', before: 'Helló', after: '', source: 'keyboard' });
    await c.stop();
    expect(c.getSession().phase).toBe('done');
    const row = h.state.history[0];
    expect(row.delivery).toBe('pending');
    expect(row.insertId).toBe('kb1');
    expect(row.text.length).toBeGreaterThan(0);
    expect(row.audioUri).toBeUndefined();
    expect(c.getSession().lastText).toBeTruthy();
  });

  it('[E-REC-03] retry uploads the saved audio and does not upload again until then', async () => {
    const c = await load();
    h.keys.value = { keys: {}, error: 'Nem sikerült kiolvasni az API-kulcsot a kulcstartóból.' };
    await appStart(c);
    await c.stop();
    expect(calls).toHaveLength(0);
    const uri = h.state.history[0].audioUri as string;
    expect(uri).toBe(savedUri());
    const n = calls.length;
    await flush();
    expect(calls).toHaveLength(n);
    h.keys.value = { keys: { openai: 'sk-test' } };
    route = okRoute;
    await c.retryHistoryItem(h.state.history[0]);
    expect(c.getSession().phase).toBe('done');
    expect(calls.length).toBeGreaterThan(n);
    const sent = forms.flatMap((f) => f.parts.filter((p) => p[0] === 'file').map((p) => (p[1] as { uri?: string }).uri));
    expect(sent).toContain(uri);
    expect(h.state.history[0].status).toBe('success');
    expect(h.state.history[0].audioUri).toBeUndefined();
    expect(h.state.history[0].text.length).toBeGreaterThan(0);
  });

  it('[E-REC-04] a successful dictation is stored and its audio is deleted', async () => {
    const c = await load();
    await appStart(c);
    await c.stop();
    expect(c.getSession().phase).toBe('done');
    expect(h.state.history[0].status).toBe('success');
    expect(h.state.history[0].text.length).toBeGreaterThan(0);
    expect(h.state.history[0].audioUri).toBeUndefined();
    expect(h.state.history[0].error).toBeUndefined();
    expect(h.fs.copied).toHaveLength(0);
    expect(h.fs.deleteFile).toHaveBeenCalledWith('file:///tmp/a.wav');
    expect(c.getSession().lastText).toBe(h.state.history[0].text);
  });

  it('[E-REC-05] history never contains the API key or a dictated key', async () => {
    const key = secret();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const c = await load();
      h.keys.value = { keys: { openai: key } };
      route = async (url) => (url.includes('transcriptions') ? json(200, { text: `a kulcs ${key} marad` }) : okRoute(url, {}));
      await appStart(c);
      await c.stop();
      const blob = JSON.stringify(h.state.history);
      expect(blob).not.toContain(key);
      expect(blob).not.toMatch(/Bearer |apiKey/);
      expect(h.state.history[0].text).not.toContain(key);
      const logged = [log, info, warn, debug, err].flatMap((s) => s.mock.calls).map((a) => JSON.stringify(a));
      expect(logged.join('\n')).not.toContain(key);
    } finally {
      log.mockRestore(); info.mockRestore(); warn.mockRestore(); debug.mockRestore(); err.mockRestore();
    }
  });

  it('[E-REC-06] a silent tap is not stored', async () => {
    const c = await load();
    h.fs.stopRecording.mockResolvedValueOnce({ uri: 'file:///tmp/s.wav', seconds: 1, speechSeconds: 0, silent: true });
    await appStart(c);
    await c.stop();
    expect(h.state.history).toHaveLength(0);
    expect(h.fs.copied).toHaveLength(0);
    expect(c.getSession().error).toMatch(/Nem hallottunk/);
  });
});

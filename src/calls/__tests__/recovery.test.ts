import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CallNote } from '../core';

const h = vi.hoisted(() => ({
  storage: {} as Record<string, string>,
  deleted: [] as string[],
  keys: { keys: {} as Record<string, string> },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => h.storage[k] ?? null),
    setItem: vi.fn(async (k: string, v: string) => { h.storage[k] = v; }),
  },
}));
vi.mock('../../../modules/flow-session', () => ({
  default: { deleteFile: (u: string) => { h.deleted.push(u); }, callInbox: () => '[]', takeCallInboxItem: () => null },
}));
vi.mock('expo-file-system', () => ({
  File: class { constructor(public u: string) {} get size() { return 2000; } async base64() { return 'QQ=='; } async text() { return ''; } },
}));
vi.mock('@/state/keychain', () => ({ readAllKeys: vi.fn(async () => h.keys) }));

class RNFormData {
  parts: [string, unknown][] = [];
  append(k: string, v: unknown) { this.parts.push([k, v]); }
  get(k: string) { return this.parts.find((p) => p[0] === k)?.[1] ?? null; }
}

const SUM = JSON.stringify({ title: 'Ajánlat', summary: 'Péter péntekig küldi.', decisions: [], todos: ['Ajánlat péntekig'], followUps: [], keyFacts: [] });
const note = (p: Partial<CallNote>): CallNote => ({
  id: 'c1', date: 1, source: 'audio', status: 'processing', segments: [], speakerMethod: 'none', speakerNames: {}, transcript: '', summary: null, audioUri: 'file:///docs/calls/a.m4a', fileName: 'a.m4a', ...p,
});

async function boot() {
  vi.resetModules();
  h.deleted = [];
  h.storage = {};
  return import('../store');
}

describe('call-note recovery', () => {
  let fetchCount = 0;
  let route: (url: string, body: RNFormData | null) => Response;

  beforeEach(() => {
    fetchCount = 0;
    h.keys = { keys: { openai: 'sk-' + 'e'.repeat(24) } };
    vi.stubGlobal('FormData', RNFormData);
    route = () => new Response('{}', { status: 500 });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      fetchCount++;
      const body = init?.body instanceof RNFormData ? init.body : null;
      return route(String(url), body);
    }));
  });

  it('[E-REC-08] a failed call keeps its audio, and Retry is what sends it again', async () => {
    route = () => { throw new TypeError('Network request failed'); };
    const store = await boot();
    const id = store.addAudio('file:///docs/calls/a.m4a', 'a.m4a', 'audio', 30);
    await vi.waitFor(() => expect(store.getCalls()[0].status).not.toBe('processing'));
    const failed = store.getCalls()[0];
    expect(failed.status).toBe('error');
    expect(failed.audioUri).toBe('file:///docs/calls/a.m4a');
    expect(failed.error).toMatch(/hálózat/i);
    const n = fetchCount;
    await Promise.resolve();
    expect(fetchCount).toBe(n);
    expect(h.deleted).not.toContain(failed.audioUri);

    route = (url) => new Response(url.includes('chat/completions') ? JSON.stringify({ choices: [{ message: { content: SUM } }] }) : JSON.stringify({ segments: [{ speaker: 'A', text: 'Szia Péter, péntekig küldöm az ajánlatot.', start: 0 }, { speaker: 'B', text: 'Rendben.', start: 1 }] }), { status: 200 });
    store.retry(id);
    await vi.waitFor(() => expect(store.getCalls()[0].status).toBe('done'));
    expect(fetchCount).toBeGreaterThan(n);
    expect(store.getCalls()[0].audioUri).toBeUndefined();
    expect(store.getCalls()[0].transcript).toMatch(/ajánlatot/);
    expect(h.deleted).toContain('file:///docs/calls/a.m4a');
  });

  it('[E-REC-08] an empty transcript and an interrupted note stay on the device', async () => {
    let n = 0;
    route = () => new Response(JSON.stringify(++n === 1 ? { segments: [] } : { text: '' }), { status: 200 });
    const store = await boot();
    store.addAudio('file:///docs/calls/a.m4a', 'a.m4a');
    await vi.waitFor(() => expect(store.getCalls()[0].status).toBe('empty'));
    expect(store.getCalls()[0].audioUri).toBe('file:///docs/calls/a.m4a');
    expect(store.getCalls()[0].error).toMatch(/beszédet|semmit|szöveg/i);
    expect(h.deleted).not.toContain('file:///docs/calls/a.m4a');

    const again = await boot();
    h.storage['bf.calls.v1'] = JSON.stringify([note({ status: 'processing' })]);
    await again.loadCalls();
    expect(again.getCalls()[0].status).toBe('interrupted');
    expect(again.getCalls()[0].audioUri).toBe('file:///docs/calls/a.m4a');
    expect(again.getCalls()[0].error).toMatch(/megszakadt/i);
  });

  it('[E-REC-05] a call note never stores the API key', async () => {
    const key = h.keys.keys.openai;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      route = (url) => new Response(url.includes('chat/completions')
        ? JSON.stringify({ choices: [{ message: { content: SUM } }] })
        : JSON.stringify({ segments: [{ speaker: 'A', text: `a kulcs ${key}`, start: 0 }] }), { status: 200 });
      const store = await boot();
      store.addAudio('file:///docs/calls/a.m4a', 'a.m4a');
      await vi.waitFor(() => expect(store.getCalls()[0].status).toBe('done'));
      const blob = JSON.stringify(store.getCalls()) + (h.storage['bf.calls.v1'] ?? '');
      expect(blob).not.toContain(key);
      expect(store.getCalls()[0].transcript).not.toContain(key);
      expect(store.getCalls()[0].transcript).toContain('***');
      expect(JSON.stringify([...log.mock.calls, ...err.mock.calls])).not.toContain(key);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });

  it('[E-REC-04] a pasted transcript that succeeds is kept and can be copied', async () => {
    route = () => new Response(JSON.stringify({ choices: [{ message: { content: SUM } }] }), { status: 200 });
    const store = await boot();
    store.addTranscript('Dorottya: Szia!\nPéter: Péntekig küldöm.');
    await vi.waitFor(() => expect(store.getCalls()[0].status).toBe('done'));
    expect(store.getCalls()[0].transcript).toMatch(/Péntekig/);
    expect(store.getCalls()[0].audioUri).toBeUndefined();
    expect(fetchCount).toBeGreaterThan(0);
  });
});

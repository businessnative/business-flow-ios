// Startup ordering: the shell becomes ready before the Keychain answers, and a save during that read wins.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  items: {} as Record<string, string | null>,
  release: null as null | ((v: { keys: Record<string, string | null | undefined> }) => void),
  setShared: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => h.items[k] ?? null),
    setItem: vi.fn(async () => {}),
  },
}));
vi.mock('../keychain', () => ({
  readAllKeys: vi.fn(() => new Promise((res) => { h.release = res as (v: { keys: Record<string, string | null | undefined> }) => void; })),
}));
vi.mock('../../../modules/flow-session', () => ({
  default: { setShared: (...a: unknown[]) => h.setShared(...a) },
}));

async function load() {
  vi.resetModules();
  h.release = null;
  h.setShared.mockClear();
  return import('../store');
}

describe('startup does not wait for the keychain', () => {
  beforeEach(() => {
    h.items = {};
  });

  it('[E-START-01] ready before keychain, history already there, keyboard prefs not published as "no key"', async () => {
    h.items['bf.history.v1'] = JSON.stringify([{ id: 'h1', date: Date.now(), text: 'Holnap küldöm a számlát.', rawText: 'holnap', category: 'other', durationSeconds: 3, kind: 'dictation' }]);
    const store = await load();
    const t0 = Date.now();
    await store.loadStore();
    expect(Date.now() - t0).toBeLessThan(500);
    expect(store.getState().ready).toBe(true);
    expect(store.getState().keysReady).toBe(false);
    expect(store.getState().history).toHaveLength(1);
    expect(h.setShared).not.toHaveBeenCalled();
    h.release?.({ keys: { openai: 'sk-from-keychain' } });
    await vi.waitFor(() => expect(store.getState().keysReady).toBe(true));
    expect(store.getState().hasKey).toBe(true);
    expect(h.setShared).toHaveBeenCalled();
    const prefs = JSON.parse(String(h.setShared.mock.calls.at(-1)?.[1]));
    expect(prefs.hasKey).toBe(true);
  });

  it('[E-START-01] does not clobber a key saved while the startup read is still in flight', async () => {
    const store = await load();
    await store.loadStore();
    store.setKeyPresent('openai', true);
    h.release?.({ keys: { openai: null, anthropic: null, gemini: null } });
    await vi.waitFor(() => expect(store.getState().keysReady).toBe(true));
    expect(store.getState().keys.openai).toBe(true);
    expect(store.getState().hasKey).toBe(true);
  });
});

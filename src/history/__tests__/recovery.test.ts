import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canCopy, canRetry, historyStatus, pruneHistory, redactSecrets, toHistoryItem } from '@/history/recovery';
import type { HistoryItem } from '@/engine/types';

const h = vi.hoisted(() => ({
  storage: {} as Record<string, string | null>,
  deleted: [] as string[],
  shared: {} as Record<string, string | null>,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => h.storage[k] ?? null),
    setItem: vi.fn(async (k: string, v: string) => { h.storage[k] = v; }),
  },
}));
vi.mock('../../../modules/flow-session', () => ({
  default: {
    deleteFile: (u: string) => { h.deleted.push(u); },
    getShared: (k: string) => h.shared[k] ?? null,
    setShared: vi.fn(),
  },
}));
vi.mock('expo-file-system', () => ({
  File: class { delete() {} },
  Directory: class { exists = false; create() {} },
  Paths: { document: 'file:///docs' },
}));
vi.mock('@/state/keychain', () => ({ readAllKeys: vi.fn(async () => ({ keys: {} })) }));

const row = (p: Partial<HistoryItem>): HistoryItem => ({
  id: 'h', date: Date.now(), text: '', rawText: '', category: 'other', durationSeconds: 2, kind: 'dictation', ...p,
});

describe('recovery rules', () => {
  beforeEach(() => {
    h.storage = {};
    h.deleted = [];
    h.shared = {};
  });

  it('[E-REC-02] pending keyboard text becomes a copyable miss, and a landed insert is acknowledged', async () => {
    const { addHistory, getState, syncInsertAcks, updateSettings } = await import('@/state/store');
    const text = 'Holnap küldöm a számlát.';
    addHistory(row({ id: 'old', date: Date.now() - 130_000, text, status: 'success', delivery: 'pending', insertId: 'cmd-old' }));
    addHistory(row({ id: 'fresh', text: 'Friss szöveg.', status: 'success', delivery: 'pending', insertId: 'cmd-fresh' }));
    syncInsertAcks();
    const missed = getState().history.find((i) => i.id === 'old');
    const fresh = getState().history.find((i) => i.id === 'fresh');
    expect(missed?.status).toBe('missed');
    expect(missed?.reason).toMatch(/nem jelent meg/i);
    expect(canCopy(missed!)).toBe(true);
    expect(recoverable(missed!)).toBe(text);
    expect(canRetry(missed!)).toBe(false);
    expect(fresh?.delivery).toBe('pending');

    h.shared['flow.landedIds'] = JSON.stringify(['cmd-fresh']);
    syncInsertAcks();
    expect(getState().history.find((i) => i.id === 'fresh')?.delivery).toBe('landed');

    updateSettings({ retention: 'never' });
    const ids = getState().history.map((i) => i.id);
    expect(ids).toContain('old');
    expect(ids).not.toContain('fresh');
  });

  it('[E-REC-05] stored history redacts key-shaped text and drops audio when retention expires', async () => {
    vi.resetModules();
    h.deleted = [];
    const { addHistory, getState, updateSettings } = await import('@/state/store');
    const key = 'sk-' + 'd'.repeat(24);
    addHistory(row({ id: 'leak', text: `mondtam ${key}`, rawText: key, status: 'success' }));
    expect(JSON.stringify(getState().history)).not.toContain(key);
    expect(getState().history[0].text).toContain('***');
    addHistory(row({ id: 'old-fail', date: Date.now() - 8 * 86400e3, status: 'failed', error: 'Nincs hálózati kapcsolat.', audioUri: 'file:///docs/dictation-audio/old.wav', text: '' }));
    updateSettings({ retention: 'days7' });
    expect(getState().history.find((i) => i.id === 'old-fail')).toBeUndefined();
    expect(h.deleted).toContain('file:///docs/dictation-audio/old.wav');
  });

  it('retry and copy follow status, and retention never keeps failures', () => {
    const failed = toHistoryItem({ id: 'a', date: 1, text: '', rawText: '', category: 'work', durationSeconds: 3, status: 'failed', reason: 'Nincs hálózati kapcsolat.', audioUri: 'file:///a.wav' });
    const missed = toHistoryItem({ id: 'b', date: 1, text: 'Szia', rawText: 'Szia', category: 'work', durationSeconds: 3, status: 'missed', reason: 'A szöveg nem jelent meg a mezőben.' });
    const ok = toHistoryItem({ id: 'c', date: 1, text: 'Szia', rawText: 'szia', category: 'work', durationSeconds: 3, status: 'success', audioUri: 'file:///nope.wav' });
    expect(canRetry(failed)).toBe(true);
    expect(canCopy(failed)).toBe(false);
    expect(canRetry(missed)).toBe(false);
    expect(canCopy(missed)).toBe(true);
    expect(ok.audioUri).toBeUndefined();
    expect(historyStatus(row({ error: 'régi hiba' }))).toBe('failed');
    const { kept } = pruneHistory([ok, failed, missed], 'never');
    expect(kept.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(redactSecrets('Bearer ' + 'a'.repeat(20))).toBe('Bearer ***');
  });
});

function recoverable(item: HistoryItem) {
  return (item.text || item.rawText).trim();
}

import { describe, expect, it, vi } from 'vitest';
import { LIMITS, checkWatchdog, decideStart, withTimeout } from '@/session/watchdog';
import { mergeSettings } from '@/engine/types';

describe('watchdogs', () => {
  const base = { phaseSince: 0, bufferAgeMs: 0 };
  it('fires per state', () => {
    expect(checkWatchdog({ ...base, phase: 'starting', now: LIMITS.startingMs - 1 })).toBeNull();
    expect(checkWatchdog({ ...base, phase: 'starting', now: LIMITS.startingMs + 1 })).toBe('startTimeout');
    expect(checkWatchdog({ ...base, phase: 'recording', now: LIMITS.recordingMaxMs + 1 })).toBe('recordingMax');
    expect(checkWatchdog({ ...base, phase: 'processing', now: LIMITS.processingMs + 1 })).toBe('processingTimeout');
    expect(checkWatchdog({ ...base, phase: 'processing', now: 1000 })).toBeNull();
    expect(checkWatchdog({ ...base, phase: 'idle', now: 1e9 })).toBeNull();
    expect(checkWatchdog({ ...base, phase: 'error', now: 1e9 })).toBeNull();
  });
  it('detects a stalled mic only after warm-up', () => {
    expect(checkWatchdog({ phase: 'recording', phaseSince: 0, now: 1000, bufferAgeMs: 5000 })).toBeNull();
    expect(checkWatchdog({ phase: 'recording', phaseSince: 0, now: 3000, bufferAgeMs: 5000 })).toBe('micStall');
    expect(checkWatchdog({ phase: 'recording', phaseSince: 0, now: 3000, bufferAgeMs: 100 })).toBeNull();
    expect(checkWatchdog({ phase: 'recording', phaseSince: 0, now: 3000, bufferAgeMs: null })).toBeNull();
  });
  it('never drops a start press', () => {
    expect(decideStart('idle', 0, 0)).toBe('start');
    expect(decideStart('done', 0, 0)).toBe('start');
    expect(decideStart('error', 0, 0)).toBe('start');
    expect(decideStart('recording', 0, 0)).toBe('stopInstead');
    expect(decideStart('starting', 0, 500)).toBe('stopInstead');
    expect(decideStart('starting', 0, 5000)).toBe('abortAndStart');
    expect(decideStart('processing', 0, 0)).toBe('abortAndStart');
  });
  it('withTimeout never hangs', async () => {
    vi.useFakeTimers();
    const hang = withTimeout(new Promise<string>(() => {}), 100, 'fb');
    vi.advanceTimersByTime(101);
    await expect(hang).resolves.toEqual({ value: 'fb', timedOut: true });
    vi.useRealTimers();
    await expect(withTimeout(Promise.resolve('ok'), 100, 'fb')).resolves.toEqual({ value: 'ok', timedOut: false });
    await expect(withTimeout(Promise.reject(new Error('x')), 100, 'fb')).resolves.toEqual({ value: 'fb', timedOut: false });
  });
  it('80 start/stop cycles stay consistent', () => {
    let phase: 'idle' | 'recording' = 'idle';
    for (let i = 0; i < 160; i++) {
      const d = decideStart(phase, 0, 0);
      phase = d === 'start' ? 'recording' : 'idle';
    }
    expect(phase).toBe('idle');
  });
});

describe('silent-by-default settings migration', () => {
  it('new installs are silent', () => {
    const s = mergeSettings(null);
    expect(s.sounds).toBe(false);
    expect(s.haptics).toBe(false);
    expect(s.soundVolume).toBeLessThanOrEqual(0.2);
  });
  it('0.1.x installs are migrated to silent once', () => {
    const s = mergeSettings({ haptics: true } as never);
    expect(s.haptics).toBe(false);
    expect(s.sounds).toBe(false);
    expect(s.settingsVersion).toBe(2);
  });
  it('choices made after migration are kept, volume clamped', () => {
    const s = mergeSettings({ haptics: true, sounds: true, soundVolume: 7, settingsVersion: 2 } as never);
    expect(s.haptics).toBe(true);
    expect(s.sounds).toBe(true);
    expect(s.soundVolume).toBe(1);
  });
});

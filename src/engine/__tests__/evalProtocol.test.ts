// Pure-function eval cases (evals/PROTOCOL.md). Test names carry [E-xx] IDs for evals/run.mjs.
import { describe, expect, it } from 'vitest';

import { defaultSettings, mergeSettings } from '@/engine/types';
import { mapProviderStatus } from '@/services/providers';
import * as openai from '@/services/openai';
import { insertionText } from '@/session/protocol';
import * as wd from '@/session/watchdog';

describe('keyboard text insertion', () => {
  it('[E-TXT-01] emoji and accents: leading space after a word / emoji, none after newline, "(" or empty field', () => {
    expect(insertionText('Szia 👋', 'hogy vagy?')).toBe(' hogy vagy?');
    expect(insertionText('Árvíztűrő', 'tükörfúrógép')).toBe(' tükörfúrógép');
    expect(insertionText('Kész.', 'Új mondat.')).toBe(' Új mondat.');
    expect(insertionText('sor\n', 'Új')).toBe('Új');
    expect(insertionText('(', 'zárójel')).toBe('zárójel');
    expect(insertionText('', 'Első')).toBe('Első');
    expect(insertionText('👨‍👩‍👧', 'család')).toBe(' család');
  });

  it('[E-TXT-02] inserted text is NFC-normalised (decomposed accents from STT never reach the field)', () => {
    const decomposed = 'a\u0301rvi\u0301ztu\u030bro\u030b'; // á í ű ő as base + combining mark
    expect(insertionText('', decomposed)).toBe('árvíztűrő'.normalize('NFC'));
    expect(insertionText('', decomposed).length).toBe(9);
  });
});

describe('provider credit / quota mapping', () => {
  it('[E-KEY-05] Anthropic "credit balance is too low" (HTTP 400) is a quota error, message names Claude', () => {
    const body = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } });
    expect(mapProviderStatus(400, body)).toBe('quota');
    const msg = (openai as any).errorMessage('quota', 'anthropic') as string;
    expect(msg).toMatch(/Claude|Anthropic/);
    expect(msg).not.toMatch(/OpenAI/);
  });
  it('[E-KEY-06] every provider gets its own credit-exhausted message with a billing hint', () => {
    for (const [p, re] of [['openai', /OpenAI/], ['anthropic', /Claude|Anthropic/], ['gemini', /Gemini|Google/]] as const) {
      const msg = (openai as any).errorMessage('quota', p) as string;
      expect(msg).toMatch(re);
      expect(msg).toMatch(/egyenleg|keret|számláz/i);
    }
  });
});

describe('settings persistence', () => {
  it('[E-SET-02] settings survive a save/load round-trip; corrupt or foreign data falls back safely', () => {
    const s = { ...defaultSettings(), haptics: true, sounds: true, soundVolume: 0.3, transcriptionProvider: 'gemini' as const, providerFallback: false };
    expect(mergeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const noIds = (x: unknown) => JSON.parse(JSON.stringify(x).replace(/"id":"[^"]*"/g, '"id":""'));
    expect(noIds(mergeSettings(null))).toEqual(noIds(defaultSettings()));
    expect(noIds(mergeSettings('garbage' as any))).toEqual(noIds(defaultSettings()));
    expect(mergeSettings({ transcriptionProvider: 'whisper-x', chatProviderId: 'nope' } as any)).toMatchObject({ transcriptionProvider: 'openai', chatProviderId: 'openai' });
    expect(mergeSettings({ ...s, soundVolume: 7 } as any).soundVolume).toBe(1);
  });
  it('[E-SET-03] silent defaults on a fresh install: no haptics, no sounds', () => {
    const d = defaultSettings();
    expect(d.haptics).toBe(false);
    expect(d.sounds).toBe(false);
  });
});

describe('long recordings and time budgets', () => {
  it('[E-LONG-02] a 5-minute 16 kHz mono WAV fits OpenAI (25 MB) and Gemini inline (20 MB base64) limits', () => {
    const bytes = 44 + (wd.LIMITS.recordingMaxMs / 1000) * 16000 * 2;
    expect(bytes).toBeLessThan(25 * 1024 * 1024);
    expect(Math.ceil(bytes / 3) * 4).toBeLessThan(20 * 1024 * 1024);
  });
  it('[E-NET-04] worst-case network chain (keychain + primary + fallback provider + LLM) fits the processing watchdog', () => {
    const budget = (wd as any).processingBudgetMs as ((audioS: number, llmS: number) => number) | undefined;
    const tt = (openai as any).transcribeTimeoutS as ((audioS: number) => number) | undefined;
    expect(typeof budget).toBe('function');
    expect(typeof tt).toBe('function');
    for (const audio of [2, 30, 120, 300]) {
      const chain = wd.LIMITS.keychainMs + 2 * tt!(audio) * 1000 + 8000;
      expect(chain).toBeLessThan(budget!(audio, 8));
      expect(budget!(audio, 8)).toBeLessThan(150_000);
    }
    expect(tt!(300)).toBeGreaterThan(tt!(3)); // long uploads get more time
  });
});

// App Group protocol between the keyboard extension (targets/keyboard/Bridge.swift) and the app.
import { needsLeadingSpace } from '@/engine/pipeline';
import type { AppCategory } from '@/engine/types';

export type KbAction = 'start' | 'stop' | 'cancel' | 'retry';
export interface KbCommand {
  id: string;
  action: KbAction;
  category: AppCategory;
  before: string;
  after: string;
  mode: 'toggle' | 'ptt';
  ts: number; // epoch seconds
}
export type Phase = 'idle' | 'starting' | 'recording' | 'processing' | 'done' | 'error';
export interface SharedState {
  id: string;
  phase: Phase;
  text?: string;
  error?: string;
  ts: number;
}

const actions: KbAction[] = ['start', 'stop', 'cancel', 'retry'];
const categories: AppCategory[] = ['personal', 'work', 'email', 'other'];

export function parseCommand(json: string | null | undefined): KbCommand | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json);
    if (typeof o?.id !== 'string' || !actions.includes(o.action)) return null;
    return {
      id: o.id,
      action: o.action,
      category: categories.includes(o.category) ? o.category : 'other',
      before: typeof o.before === 'string' ? o.before : '',
      after: typeof o.after === 'string' ? o.after : '',
      mode: o.mode === 'ptt' ? 'ptt' : 'toggle',
      ts: typeof o.ts === 'number' ? o.ts : 0,
    };
  } catch {
    return null;
  }
}

/** A start command left by the keyboard before it opened the app (deep link) is honoured for 15 s. */
export const isFresh = (c: KbCommand, nowS = Date.now() / 1000, maxAgeS = 15) => nowS - c.ts <= maxAgeS;

export const stateJson = (s: Omit<SharedState, 'ts'>, nowS = Date.now() / 1000) => JSON.stringify({ ...s, ts: nowS });

/** Text the keyboard inserts: add a separating space when the cursor follows a word / punctuation. */
export const insertionText = (before: string, text: string) => {
  const t = text.normalize('NFC');
  return needsLeadingSpace(Array.from(before.normalize('NFC')).pop(), t) ? ' ' + t : t;
};

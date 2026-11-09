// Tiny observable app store (settings + history) persisted in AsyncStorage; usable from React and the session controller.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import FlowSession from '../../modules/flow-session';
import { mergeSettings, newId, retentionMaxAgeMs, type AppSettings, type HistoryItem } from '@/engine/types';
import { readAllKeys } from './keychain';
import type { ProviderId } from '@/services/providers';

export type KeyPresence = Record<ProviderId, boolean>;
const noKeys: KeyPresence = { openai: false, anthropic: false, gemini: false };
const hasKeyFor = (k: KeyPresence, s: AppSettings) => k[s.transcriptionProvider];

export interface AppState {
  ready: boolean;
  settings: AppSettings;
  history: HistoryItem[];
  /** A key exists for the selected transcription provider. Meaningful once `keysReady` is true. */
  hasKey: boolean;
  keys: KeyPresence;
  /** False until the first Keychain read settles. The shell does not wait for this. */
  keysReady: boolean;
}

let state: AppState = { ready: false, settings: mergeSettings(null), history: [], hasKey: false, keys: noKeys, keysReady: false };
/** Bumped when the user saves or deletes a key, so a slower in-flight startup read cannot overwrite it. */
const keyStamp: Record<ProviderId, number> = { openai: 0, anthropic: 0, gemini: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getState = () => state;
export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
    () => sel(state),
  );
}

const SETTINGS = 'bf.settings.v1';
const HISTORY = 'bf.history.v1';
const MAX_HISTORY = 500;

function syncKeyboardPrefs() {
  // Publishing hasKey:false before the Keychain answers makes the keyboard open Settings for a key that exists.
  if (!state.keysReady) return;
  try {
    FlowSession.setShared('flow.kb.prefs', JSON.stringify({ haptics: state.settings.haptics, category: state.settings.defaultCategory, hasKey: state.hasKey }));
  } catch {
    // module unavailable (tests / web) — ignore
  }
}

export async function loadStore() {
  const [s, h] = await Promise.all([AsyncStorage.getItem(SETTINGS), AsyncStorage.getItem(HISTORY)]);
  let settings = mergeSettings(null);
  let history: HistoryItem[] = [];
  try {
    settings = mergeSettings(s ? JSON.parse(s) : null);
  } catch {}
  try {
    history = h ? JSON.parse(h) : [];
  } catch {}
  state = { ready: true, settings, history: prune(history, settings), hasKey: false, keys: { ...noKeys }, keysReady: false };
  emit();
  void settleKeys();
}

/** Keychain is not on the path to the first frame. A slow or locked Keychain updates the shell when it answers. */
async function settleKeys() {
  const started = { ...keyStamp };
  const key = await readAllKeys(Number.POSITIVE_INFINITY);
  const keys: KeyPresence = { ...state.keys };
  (['openai', 'anthropic', 'gemini'] as ProviderId[]).forEach((p) => {
    if (keyStamp[p] === started[p]) keys[p] = !!key.keys[p];
  });
  state = { ...state, keys, hasKey: hasKeyFor(keys, state.settings), keysReady: true };
  syncKeyboardPrefs();
  emit();
}

function prune(items: HistoryItem[], s: AppSettings) {
  const max = retentionMaxAgeMs(s.retention);
  const now = Date.now();
  const kept = max === null ? items : max === 0 ? items.filter((i) => i.error) : items.filter((i) => now - i.date < max);
  return kept.slice(0, MAX_HISTORY);
}

export function updateSettings(patch: Partial<AppSettings> | ((s: AppSettings) => Partial<AppSettings>)) {
  const p = typeof patch === 'function' ? patch(state.settings) : patch;
  const settings = { ...state.settings, ...p };
  state = { ...state, settings, history: prune(state.history, settings), hasKey: hasKeyFor(state.keys, settings) };
  emit();
  syncKeyboardPrefs();
  void AsyncStorage.setItem(SETTINGS, JSON.stringify(settings));
  void AsyncStorage.setItem(HISTORY, JSON.stringify(state.history));
}

export function setKeyPresent(p: ProviderId, present: boolean) {
  keyStamp[p]++;
  const keys = { ...state.keys, [p]: present };
  state = { ...state, keys, hasKey: hasKeyFor(keys, state.settings), keysReady: true };
  emit();
  syncKeyboardPrefs();
}

function saveHistory(history: HistoryItem[]) {
  state = { ...state, history: prune(history, state.settings) };
  emit();
  void AsyncStorage.setItem(HISTORY, JSON.stringify(state.history));
}

export const addHistory = (item: HistoryItem) => saveHistory([item, ...state.history.filter((i) => i.id !== item.id)]);
export const updateHistory = (id: string, patch: Partial<HistoryItem>) => saveHistory(state.history.map((i) => (i.id === id ? { ...i, ...patch } : i)));
export const removeHistory = (id: string) => saveHistory(state.history.filter((i) => i.id !== id));
export const clearHistory = () => saveHistory([]);

export const addPolished = (from: HistoryItem, text: string) =>
  addHistory({ ...from, id: newId(), date: Date.now(), text, rawText: from.text, kind: 'polish', audioUri: undefined, error: undefined });

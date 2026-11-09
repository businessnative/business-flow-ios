// Hívás-jegyzetek store: persisted list of call notes + import/processing orchestration.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File as FsFile } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import FlowSession from '../../modules/flow-session';
import { newId } from '@/engine/types';
import { redactSecrets } from '@/history/recovery';
import { OpenAIError, errorMessage } from '@/services/openai';
import { getState } from '@/state/store';
import { readAllKeys } from '@/state/keychain';
import type { CallNote, CallSource, CallStatus, CallSummary } from './core';
import { processAudio, processTranscript, type CallDeps } from './pipeline';

const KEY = 'bf.calls.v1';
const MAX = 300;
let calls: CallNote[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const running = new Map<string, AbortController>();
const emit = () => listeners.forEach((l) => l());

export const getCalls = () => calls;
export function useCalls<T>(sel: (c: CallNote[]) => T): T {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => sel(calls), () => sel(calls));
}

export async function loadCalls() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list: CallNote[] = raw ? JSON.parse(raw) : [];
    // An app kill mid-processing leaves "processing" items: turn them into retryable, on-device rows.
    const interrupted = list.some((c) => c.status === 'processing');
    calls = list.map((c) => scrub(c.status === 'processing' ? { ...c, status: 'interrupted', error: 'A feldolgozás megszakadt. Koppints az Újra gombra.' } : c));
    if (interrupted) persist();
  } catch {
    calls = [];
  }
  loaded = true;
  emit();
}

const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(calls.slice(0, MAX))).catch(() => {});
function put(n: CallNote) {
  const clean = scrub(n);
  const i = calls.findIndex((c) => c.id === clean.id);
  calls = i >= 0 ? calls.map((c) => (c.id === clean.id ? clean : c)) : [clean, ...calls];
  persist();
  emit();
}
const patch = (id: string, p: Partial<CallNote>) => {
  const c = calls.find((x) => x.id === id);
  if (c) put({ ...c, ...p });
};

function friendly(e: unknown): string {
  const msg = e instanceof OpenAIError
    ? e.kind === 'emptyResult'
      ? 'Nem hallottunk beszédet a felvételen.'
      : e.kind === 'cancelled'
        ? 'A feldolgozás megszakadt. Koppints az Újra gombra.'
        : e.kind === 'tooLarge' && e.message && e.message !== 'tooLarge'
          ? e.message
          : errorMessage(e.kind, e.provider)
    : 'Ismeretlen hiba a feldolgozás közben.';
  return redactSecrets(msg);
}

function callStatusOf(e: unknown): CallStatus {
  if (e instanceof OpenAIError && e.kind === 'emptyResult') return 'empty';
  if (e instanceof OpenAIError && e.kind === 'cancelled') return 'interrupted';
  return 'error';
}

function scrubText(s: string): string {
  return redactSecrets(s);
}

function scrubSummary(s: CallSummary): CallSummary {
  return {
    title: scrubText(s.title),
    summary: scrubText(s.summary),
    decisions: s.decisions.map(scrubText),
    todos: s.todos.map(scrubText),
    followUps: s.followUps.map(scrubText),
    keyFacts: s.keyFacts.map(scrubText),
  };
}

/** History and call notes never keep an API key, even if one was spoken or echoed by a provider. */
function scrub(n: CallNote): CallNote {
  return {
    ...n,
    error: n.error ? scrubText(n.error) : undefined,
    transcript: scrubText(n.transcript ?? ''),
    fileName: n.fileName ? scrubText(n.fileName) : undefined,
    segments: n.segments.map((seg) => ({ ...seg, speaker: scrubText(seg.speaker), text: scrubText(seg.text) })),
    summary: n.summary ? scrubSummary(n.summary) : null,
  };
}

const deps = (signal: AbortSignal): CallDeps => ({ readBase64: (u) => new FsFile(u).base64(), signal });

async function run(id: string) {
  const n = calls.find((c) => c.id === id);
  if (!n || running.has(id)) return;
  const abort = new AbortController();
  running.set(id, abort);
  patch(id, { status: 'processing', error: undefined });
  try {
    const { keys } = await readAllKeys();
    const s = getState().settings;
    const audio = n.audioUri;
    const out = audio
      ? await processAudio(s, keys, { uri: audio, name: n.fileName ?? 'hivas.m4a', size: fileSize(audio) }, deps(abort.signal))
      : await processTranscript(s, keys, n.transcript, deps(abort.signal));
    patch(id, { status: 'done', segments: out.segments, speakerMethod: out.speakerMethod, transcript: out.transcript, summary: out.summary, summaryByLLM: out.summaryByLLM, audioUri: undefined, error: undefined });
    if (audio) {
      try { FlowSession.deleteFile(audio); } catch { /* the transcript is already saved */ }
    }
  } catch (e) {
    patch(id, { status: callStatusOf(e), error: friendly(e) });
  } finally {
    running.delete(id);
  }
}

function fileSize(uri: string): number {
  try {
    return new FsFile(uri).size ?? 0;
  } catch {
    return 0;
  }
}

function blank(source: CallSource, fileName?: string): CallNote {
  return { id: newId(), date: Date.now(), source, status: 'processing', fileName, segments: [], speakerMethod: 'none', speakerNames: {}, transcript: '', summary: null };
}

/** Audio already copied into the app sandbox (Documents/calls or the recorder's WAV). */
export function addAudio(uri: string, fileName: string, source: CallSource = 'audio', durationSeconds?: number): string {
  const n = { ...blank(source, fileName), audioUri: uri, durationSeconds };
  put(n);
  void run(n.id);
  return n.id;
}

export function addTranscript(text: string, fileName?: string): string {
  const n = { ...blank('transcript', fileName), transcript: text };
  put(n);
  void run(n.id);
  return n.id;
}

export const retry = (id: string) => run(id);
export const cancel = (id: string) => running.get(id)?.abort();
export const renameSpeaker = (id: string, speaker: string, name: string) => {
  const c = calls.find((x) => x.id === id);
  if (c) put({ ...c, speakerNames: { ...c.speakerNames, [speaker]: name.trim() } });
};
export const renameCall = (id: string, title: string) => {
  const c = calls.find((x) => x.id === id);
  if (c?.summary) put({ ...c, summary: { ...c.summary, title: title.trim() || c.summary.title } });
};

export function removeCall(id: string) {
  const c = calls.find((x) => x.id === id);
  running.get(id)?.abort();
  if (c?.audioUri) {
    try {
      FlowSession.deleteFile(c.audioUri);
    } catch {}
  }
  calls = calls.filter((x) => x.id !== id);
  persist();
  emit();
}

/** Pulls items saved by the Share Extension into the list. Returns how many were imported. */
export async function importInbox(): Promise<number> {
  await loadCalls();
  let items: { id: string; kind: string; name: string }[] = [];
  try {
    items = JSON.parse(FlowSession.callInbox() || '[]');
  } catch {
    return 0;
  }
  let n = 0;
  for (const it of items) {
    let uri: string | null = null;
    try {
      uri = FlowSession.takeCallInboxItem(it.id);
    } catch {}
    if (!uri) continue;
    if (it.kind === 'audio') addAudio(uri, it.name, 'audio');
    else {
      try {
        const text = await new FsFile(uri).text();
        FlowSession.deleteFile(uri);
        if (text.trim()) addTranscript(text, it.name === 'Leirat.txt' ? undefined : it.name);
        else continue;
      } catch {
        continue;
      }
    }
    n++;
  }
  return n;
}

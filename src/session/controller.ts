// Session controller: keeps the background mic session warm (Wispr-style "Flow is on"), executes keyboard commands,
// runs record → OpenAI transcription → cleanTranscript → formatDictation and publishes the result to the keyboard.
import { useSyncExternalStore } from 'react';

import FlowSession from '../../modules/flow-session';
import { cleanTranscript } from '@/engine/audioPrep';
import { formatDictation } from '@/engine/formatter';
import { contextNames } from '@/engine/rules';
import { newId, sessionTimeoutMs, type AppCategory, type HistoryItem } from '@/engine/types';
import { readAllKeys } from '@/state/keychain';
import { addHistory, getState, updateHistory } from '@/state/store';
import { OpenAIError, errorMessage } from '@/services/openai';
import { cancelProviderWarmup, routedChatProvider, transcribeAny } from '@/services/providers';
import { File as FsFile } from 'expo-file-system';
import { insertionText, isFresh, parseCommand, stateJson, type KbCommand, type Phase } from './protocol';
import { LIMITS, checkWatchdog, processingBudgetMs, decideStart, watchdogMessage, withTimeout, type WatchdogFire } from './watchdog';

export interface SessionView {
  sessionOn: boolean;
  phase: Phase;
  level: number;
  mode: 'toggle' | 'ptt';
  source: 'keyboard' | 'app';
  lastText: string | null;
  error: string | null;
  startedAt: number | null;
  phaseSince: number;
  /** Last completed dictation, per stage (ms) — shown in History detail / used by the eval. */
  timings?: { keychainMs: number; transcribeMs: number; formatMs: number; totalMs: number; provider: string; usedLLM: boolean } | null;
}

let view: SessionView = { sessionOn: false, phase: 'idle', level: 0, mode: 'toggle', source: 'app', lastText: null, error: null, startedAt: null, phaseSince: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<SessionView>) => {
  view = { ...view, ...p };
  listeners.forEach((l) => l());
};
export const getSession = () => view;
export function useSession<T>(sel: (v: SessionView) => T): T {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => sel(view), () => sel(view));
}

interface Job {
  id: string;
  category: AppCategory;
  before: string;
  after: string;
  source: 'keyboard' | 'app';
  abort?: AbortController;
}
let job: Job | null = null;
/** Processing watchdog for the current job (scales with recording length). */
/** Seconds reserved for LLM formatting in the processing budget. */
const LLM_BUDGET_S = 20;
let processingLimitMs: number = LIMITS.processingMs;
let lastFailed: { job: Job; uri: string; seconds: number; speechSeconds: number; historyId: string } | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let initialised = false;

function publish(id: string, phase: Phase, extra: { text?: string; error?: string } = {}) {
  const prev = view.phase;
  set({ phase, error: extra.error ?? null, lastText: extra.text ?? view.lastText, phaseSince: phase === prev ? view.phaseSince : Date.now() });
  if (phase !== prev) cue(phase);
  try {
    FlowSession.publishState(stateJson({ id, phase, ...extra }));
  } catch {}
}

/** Optional, very quiet cues — off by default (settings.sounds). */
function cue(phase: Phase) {
  const { sounds, soundVolume } = getState().settings;
  if (!sounds || soundVolume <= 0) return;
  const kind = phase === 'recording' ? 'start' : phase === 'done' ? 'stop' : phase === 'error' ? 'error' : null;
  if (!kind) return;
  try {
    FlowSession.playCue(kind, soundVolume);
  } catch {}
}

let watchTimer: ReturnType<typeof setInterval> | null = null;
let stallRestarted = false;
function ensureWatchdog() {
  if (watchTimer) return;
  watchTimer = setInterval(tick, 500);
}

/** Exported for tests / self-check: one watchdog pass. */
export function tick(now = Date.now()) {
  let bufferAgeMs: number | null = null;
  if (view.phase === 'recording') {
    try {
      const a = FlowSession.bufferAgeMs();
      bufferAgeMs = a >= 0 ? a : null;
    } catch {}
  }
  const fire = checkWatchdog({ phase: view.phase, phaseSince: view.phaseSince, now, bufferAgeMs, processingLimitMs });
  if (fire) void onWatchdog(fire);
}

async function onWatchdog(fire: WatchdogFire) {
  const j = job;
  switch (fire) {
    case 'recordingMax':
      return stop();
    case 'micStall':
      if (!stallRestarted) {
        // One silent recovery attempt: restart the engine but keep what we recorded so far.
        stallRestarted = true;
        set({ phaseSince: Date.now() - 1600 });
        try {
          await FlowSession.restartEngine();
          return;
        } catch {}
      }
      FlowSession.cancelRecording();
      if (j) publish(j.id, 'error', { error: watchdogMessage.micStall });
      job = null;
      return scheduleIdle();
    case 'startTimeout':
      FlowSession.cancelRecording();
      if (j) publish(j.id, 'error', { error: watchdogMessage.startTimeout });
      else set({ phase: 'idle' });
      job = null;
      return scheduleIdle();
    case 'processingTimeout':
      // Abort the request; process() keeps the audio for "Újra" because the abort reason is a timeout.
      if (j?.abort) {
        timedOutJobs.add(j);
        j.abort.abort();
      } else {
        if (j) publish(j.id, 'error', { error: watchdogMessage.processingTimeout });
        else set({ phase: 'idle' });
        job = null;
      }
      return scheduleIdle();
  }
}
const timedOutJobs = new WeakSet<Job>();

export function initSession() {
  if (initialised) return;
  initialised = true;
  ensureWatchdog();
  FlowSession.addListener('onCommand', ({ json }) => {
    const c = parseCommand(json);
    // Stale commands (keyboard closed long ago, replayed notification) are ignored.
    if (c && isFresh(c, Date.now() / 1000, 30)) void handleCommand(c);
  });
  FlowSession.addListener('onLevel', ({ level }) => set({ level }));
  FlowSession.addListener('onInterruption', ({ reason }) => {
    // Call / Siri: native keeps the samples recorded so far — salvage them instead of losing the dictation.
    if (reason === 'interrupted' && view.phase === 'recording' && job) void stop('A felvétel megszakadt (hívás vagy Siri); a hallott részt feldolgozom.');
    // Starting while interrupted: fail clearly instead of hanging in "starting".
    else if (reason === 'interrupted' && view.phase === 'starting' && job) {
      publish(job.id, 'error', { error: 'A mikrofont most egy hívás vagy másik app használja.' });
      job = null;
    }
    // AirPods / headset change: native restarts the engine and keeps recording; nothing to do here.
    if (reason === 'reset' || reason === 'interrupted' || reason === 'ended') set({ sessionOn: safeActive() });
  });
}

const safeActive = () => {
  try {
    return FlowSession.isSessionActive();
  } catch {
    return false;
  }
};

/** Called when the keyboard opened the app via businessflow://dictate — run the pending command it left. */
export async function runPendingCommand(maxAgeS = 15) {
  const c = parseCommand(FlowSession.getShared('flow.cmd'));
  if (!c || Date.now() / 1000 - c.ts > maxAgeS) return false;
  FlowSession.setShared('flow.cmd', null);
  await handleCommand(c);
  return true;
}

export async function handleCommand(c: KbCommand) {
  switch (c.action) {
    case 'start':
      return start({ id: c.id, category: c.category, before: c.before, after: c.after, source: 'keyboard' }, c.mode);
    case 'stop':
      return stop();
    case 'cancel':
      return cancel();
    case 'retry':
      return retry(c.id);
  }
}

export async function ensureSession(): Promise<boolean> {
  if (FlowSession.isSessionActive()) {
    set({ sessionOn: true });
    return true;
  }
  let perm = FlowSession.micPermission();
  if (perm === 'undetermined') perm = (await FlowSession.requestMicPermission()) ? 'granted' : 'denied';
  if (perm !== 'granted') {
    set({ error: 'Nincs mikrofon-engedély. Beállítások → Business Flow → Mikrofon.' });
    return false;
  }
  await FlowSession.startSession();
  set({ sessionOn: true, error: null });
  scheduleIdle();
  return true;
}

export async function endSession() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (FlowSession.isRecording()) FlowSession.cancelRecording();
  await FlowSession.stopSession();
  set({ sessionOn: false, phase: 'idle', level: 0 });
}

function scheduleIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const ms = sessionTimeoutMs(getState().settings.sessionTimeout);
  if (ms === null) return;
  idleTimer = setTimeout(() => {
    if (view.phase === 'recording' || view.phase === 'processing') return scheduleIdle();
    void endSession();
  }, Math.max(ms, 1500));
}

export async function start(j: Omit<Job, 'abort'>, mode: 'toggle' | 'ptt' = 'toggle') {
  ensureWatchdog();
  const d = decideStart(view.phase, view.phaseSince, Date.now());
  if (d === 'stopInstead') return stop();
  if (d === 'abortAndStart' && job) {
    // A stuck/slow previous job never blocks a new dictation: abort it (its audio stays retryable).
    const old = job;
    if (view.phase === 'processing') timedOutJobs.add(old);
    else FlowSession.cancelRecording();
    old.abort?.abort();
    job = null;
  }
  if (idleTimer) clearTimeout(idleTimer);
  stallRestarted = false;
  job = j;
  set({ source: j.source, mode, startedAt: Date.now(), level: 0 });
  publish(j.id, 'starting');
  // Keychain read overlaps speech. stop() then hits the memory cache instead of waiting on first unlock.
  void readAllKeys();
  try {
    if (!(await ensureSession())) {
      publish(j.id, 'error', { error: view.error ?? 'Nincs mikrofon-engedély.' });
      job = null;
      return;
    }
    await FlowSession.startRecording();
    publish(j.id, 'recording');
  } catch {
    publish(j.id, 'error', { error: 'Nem sikerült elindítani a felvételt.' });
    job = null;
  }
}

export async function stop(notice?: string) {
  const j = job;
  if (!j) return;
  if (view.phase === 'starting') {
    // Released before the mic came up (quick PTT tap): cancel cleanly instead of leaving it stuck.
    FlowSession.cancelRecording();
    job = null;
    publish(j.id, 'idle');
    return scheduleIdle();
  }
  if (view.phase !== 'recording') return;
  // Keep the interruption notice visible while processing (publish() would otherwise clear it).
  publish(j.id, 'processing', notice ? { error: notice } : {});
  set({ level: 0 });
  try {
    const r = await FlowSession.stopRecording();
    if (r.silent) {
      FlowSession.deleteFile(r.uri);
      publish(j.id, 'error', { error: 'Nem hallottunk semmit. Próbáld újra.' });
      job = null;
      return scheduleIdle();
    }
    await process(j, r.uri, r.seconds, r.speechSeconds, null);
  } catch {
    publish(j.id, 'error', { error: 'A felvétel feldolgozása nem sikerült.' });
    job = null;
  }
  scheduleIdle();
}

export function cancel() {
  const j = job;
  if (!j) return;
  if (view.phase === 'recording') FlowSession.cancelRecording();
  j.abort?.abort();
  job = null;
  publish(j.id, 'idle');
  scheduleIdle();
}

async function retry(id: string) {
  if (!lastFailed) return;
  const f = lastFailed;
  const j: Job = { ...f.job, id };
  job = j;
  publish(id, 'processing');
  await process(j, f.uri, f.seconds, f.speechSeconds, f.historyId);
  scheduleIdle();
}

export const canRetry = () => !!lastFailed;
export async function retryLast() {
  if (lastFailed) await retry(lastFailed.job.id + '-r');
}

async function process(j: Job, uri: string, seconds: number, speechSeconds: number, historyId: string | null) {
  // A connection probe started at launch must not share the radio with the upload.
  cancelProviderWarmup();
  const { settings } = getState();
  const abort = new AbortController();
  j.abort = abort;
  processingLimitMs = processingBudgetMs(seconds, settings.smartFormatting ? LLM_BUDGET_S : 0);
  const t0 = Date.now();
  const k = await withTimeout(readAllKeys(), LIMITS.keychainMs, { keys: {}, error: undefined });
  const keyErr = k.timedOut ? 'A kulcstartó nem válaszolt. Oldd fel a telefont, majd koppints az Újra gombra.' : k.value.error && !k.value.keys[settings.transcriptionProvider] ? k.value.error : null;
  if (keyErr) {
    lastFailed = { job: j, uri, seconds, speechSeconds, historyId: historyId ?? newId() };
    publish(j.id, 'error', { error: keyErr });
    if (job === j) job = null;
    return;
  }
  const keys = k.value.keys;
  const t1 = Date.now();
  const hid = historyId ?? newId();
  try {
    const ctx = { before: j.before, after: j.after, appName: '', isSecure: false };
    const terms = [...settings.dictionary.map((d) => d.term), ...contextNames(ctx)];
    const { text: raw, provider } = await transcribeAny(settings, keys, {
      file: { uri, name: 'audio.wav', type: 'audio/wav' },
      uri,
      language: settings.language,
      terms,
      signal: abort.signal,
      readBase64: (u) => new FsFile(u).base64(),
      seconds,
    });
    const t2 = Date.now();
    if (timedOutJobs.has(j)) throw new OpenAIError('timeout');
    if (abort.signal.aborted || job !== j) return;
    const cleaned = cleanTranscript(raw, speechSeconds);
    if (!cleaned) throw new OpenAIError('emptyResult');
    const chat = settings.smartFormatting ? routedChatProvider(settings, keys) : null;
    const formatted = await formatDictation(cleaned, settings, ctx, j.category, chat);
    if (abort.signal.aborted || job !== j) return;
    const t3 = Date.now();
    set({ timings: { keychainMs: t1 - t0, transcribeMs: t2 - t1, formatMs: t3 - t2, totalMs: t3 - t0, provider, usedLLM: !!formatted.usedLLM } });
    const text = j.source === 'keyboard' ? insertionText(j.before, formatted.text) : formatted.text;
    publish(j.id, 'done', { text });
    const item: HistoryItem = { id: hid, date: Date.now(), text: formatted.text, rawText: cleaned, category: j.category, durationSeconds: seconds, kind: 'dictation' };
    if (historyId) updateHistory(hid, { ...item, error: undefined, audioUri: undefined });
    else if (settings.retention !== 'never') addHistory(item);
    FlowSession.deleteFile(uri);
    lastFailed = null;
  } catch (e) {
    const timedOut = timedOutJobs.has(j);
    if (abort.signal.aborted && !timedOut) {
      FlowSession.deleteFile(uri);
      return;
    }
    const msg = timedOut
      ? watchdogMessage.processingTimeout
      : e instanceof OpenAIError ? (e.kind === 'emptyResult' ? 'Nem hallottunk semmit.' : e.message || errorMessage(e.kind)) : 'Ismeretlen hiba.';
    // Keep the audio so "Újra" can resend it; the failed dictation is listed in History (like Wispr).
    lastFailed = { job: j, uri, seconds, speechSeconds, historyId: hid };
    const item: HistoryItem = { id: hid, date: Date.now(), text: '', rawText: '', category: j.category, durationSeconds: seconds, kind: 'dictation', audioUri: uri, error: msg };
    if (historyId) updateHistory(hid, { error: msg });
    else addHistory(item);
    if (job === j) publish(j.id, 'error', { error: msg });
  } finally {
    if (job === j) job = null;
  }
}

/** Retry a failed History item (uses its saved audio). */
export async function retryHistoryItem(item: HistoryItem) {
  if (!item.audioUri) return;
  lastFailed = { job: { id: newId(), category: item.category, before: '', after: '', source: 'app' }, uri: item.audioUri, seconds: item.durationSeconds, speechSeconds: item.durationSeconds, historyId: item.id };
  await retryLast();
}

export function appDictationToggle() {
  if (view.phase === 'recording') return stop();
  if (view.phase === 'processing') return cancel();
  return start({ id: newId(), category: getState().settings.defaultCategory, before: '', after: '', source: 'app' });
}

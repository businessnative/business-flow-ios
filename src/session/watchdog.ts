// Per-state watchdogs and the start/stop decision table (port of bn-flow-mac 0.3.1 reliability fixes).
// Pure functions so the state machine is unit-tested without native modules.
import type { Phase } from './protocol';

export const LIMITS = {
  /** starting → recording must happen within this (mic / session start). */
  startingMs: 6000,
  /** Hard cap on one recording (Mac: 5 min). */
  recordingMaxMs: 5 * 60_000,
  /** Whole transcription + formatting step (Mac: 45 s). The audio is kept for "Újra". */
  processingMs: 45_000,
  /** No audio buffer from the mic for this long while recording → restart the engine once, then fail. */
  micStallMs: 2500,
  /** Keychain read must not hang the flow (iOS can block on first unlock / data protection). */
  keychainMs: 4000,
} as const;

/** Per-request transcription timeout: grows with audio length (upload + model time), 12–40 s. */
export const transcribeTimeoutS = (audioS: number) => Math.min(40, Math.max(12, Math.round(12 + Math.max(0, audioS) * 0.08)));

/** Processing watchdog for one job: keychain + primary and fallback transcription + LLM formatting + slack. Never below LIMITS.processingMs. */
export function processingBudgetMs(audioS: number, llmS: number): number {
  return Math.max(LIMITS.processingMs, LIMITS.keychainMs + 2 * transcribeTimeoutS(audioS) * 1000 + llmS * 1000 + 6000);
}

export type WatchdogFire = 'startTimeout' | 'recordingMax' | 'processingTimeout' | 'micStall';

export interface WatchInput {
  phase: Phase;
  phaseSince: number; // ms epoch when the phase was entered
  now: number;
  /** ms since the last mic buffer while recording; null = unknown. */
  bufferAgeMs: number | null;
  /** Per-job processing budget (scales with recording length); defaults to LIMITS.processingMs. */
  processingLimitMs?: number;
}

export function checkWatchdog(w: WatchInput): WatchdogFire | null {
  const age = w.now - w.phaseSince;
  switch (w.phase) {
    case 'starting':
      return age > LIMITS.startingMs ? 'startTimeout' : null;
    case 'recording':
      if (age > LIMITS.recordingMaxMs) return 'recordingMax';
      if (age > 1500 && w.bufferAgeMs !== null && w.bufferAgeMs > LIMITS.micStallMs) return 'micStall';
      return null;
    case 'processing':
      return age > (w.processingLimitMs ?? LIMITS.processingMs) ? 'processingTimeout' : null;
    default:
      return null;
  }
}

/** What a "start" press does in each phase — never silently dropped (Mac 0.3.1 bug #1). */
export type StartDecision = 'start' | 'stopInstead' | 'abortAndStart';
export function decideStart(phase: Phase, phaseSince: number, now: number): StartDecision {
  if (phase === 'recording') return 'stopInstead';
  if (phase === 'starting') return now - phaseSince > 1500 ? 'abortAndStart' : 'stopInstead';
  if (phase === 'processing') return 'abortAndStart';
  return 'start';
}

export const watchdogMessage: Record<WatchdogFire, string> = {
  startTimeout: 'A mikrofon nem indult el. Koppints újra a mikrofonra.',
  recordingMax: 'Elérted az 5 perces felvételi korlátot, feldolgozom.',
  processingTimeout: 'Az átírás túl sokáig tartott . A hang megmaradt, koppints az Újra gombra.',
  micStall: 'A mikrofon nem ad hangot. Ellenőrizd a hangeszközt, majd próbáld újra.',
};

/** Promise with a deadline; resolves to `fallback` instead of hanging. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<{ value: T; timedOut: boolean }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ value: fallback, timedOut: true }), ms);
    p.then(
      (value) => { clearTimeout(t); resolve({ value, timedOut: false }); },
      () => { clearTimeout(t); resolve({ value: fallback, timedOut: false }); },
    );
  });
}

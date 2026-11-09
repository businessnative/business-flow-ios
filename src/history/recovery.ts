// On-device recovery for dictation: what we keep, what can be copied, what can be retried.
// Audio files stay on the phone. Nothing here stores or logs API keys.
import { retentionMaxAgeMs, type HistoryItem, type HistoryRetention, type HistoryStatus } from '@/engine/types';

export const INSERT_FRESH_MS = 120_000;
export const MISSED_INSERT_REASON = 'A szöveg nem jelent meg a mezőben. Innen kimásolhatod.';

const STATUSES: HistoryStatus[] = ['success', 'failed', 'interrupted', 'empty', 'missed'];
/** Provider key shapes. Dictated text that looks like a key is replaced before it is stored. */
const SECRET = /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]{20,})\b/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]{12,}/gi;

export function redactSecrets(s: string): string {
  return s.replace(SECRET, '***').replace(BEARER, 'Bearer ***');
}

export function historyStatus(item: Pick<HistoryItem, 'status' | 'error' | 'reason'>): HistoryStatus {
  if (item.status && STATUSES.includes(item.status)) return item.status;
  if (item.error || item.reason) return 'failed';
  return 'success';
}

export function historyReason(item: Pick<HistoryItem, 'reason' | 'error'>): string | undefined {
  const r = (item.reason || item.error || '').trim();
  return r || undefined;
}

export function recoverableText(item: Pick<HistoryItem, 'text' | 'rawText'>): string {
  return (item.text || item.rawText || '').trim();
}

export function canCopy(item: Pick<HistoryItem, 'text' | 'rawText'>): boolean {
  return recoverableText(item).length > 0;
}

/** Saved audio is uploaded again only when the user retries a failed, empty, or interrupted transcription. */
export function canRetry(item: HistoryItem): boolean {
  if (!item.audioUri) return false;
  const s = historyStatus(item);
  return s === 'failed' || s === 'interrupted' || s === 'empty';
}

export const historyStatusLabel: Record<HistoryStatus, string | null> = {
  success: null,
  failed: 'Sikertelen',
  interrupted: 'Megszakadt',
  empty: 'Üres',
  missed: 'Nincs a mezőben',
};

export interface AttemptDraft {
  id: string;
  date: number;
  text: string;
  rawText: string;
  category: HistoryItem['category'];
  durationSeconds: number;
  kind?: HistoryItem['kind'];
  status: HistoryStatus;
  reason?: string;
  audioUri?: string;
  delivery?: HistoryItem['delivery'];
  insertId?: string;
}

export function toHistoryItem(d: AttemptDraft): HistoryItem {
  const text = redactSecrets(d.text ?? '');
  const rawText = redactSecrets(d.rawText ?? '');
  const reason = d.reason?.trim() ? redactSecrets(d.reason.trim()) : undefined;
  const item: HistoryItem = {
    id: d.id,
    date: d.date,
    text,
    rawText,
    category: d.category,
    durationSeconds: d.durationSeconds,
    kind: d.kind ?? 'dictation',
    status: d.status,
  };
  if (d.delivery) item.delivery = d.delivery;
  if (d.insertId) item.insertId = d.insertId;
  if (reason) {
    item.reason = reason;
    item.error = reason;
  }
  if (d.audioUri && (d.status === 'failed' || d.status === 'interrupted' || d.status === 'empty')) item.audioUri = d.audioUri;
  return item;
}

/** Failures, empty transcripts, interrupted takes, and text that never landed are kept even when history retention is "Ne mentsen". */
export function keepsWhenRetentionOff(item: HistoryItem): boolean {
  if (historyStatus(item) !== 'success') return true;
  return item.delivery === 'pending' || item.delivery === 'missed';
}

export function pruneHistory(items: HistoryItem[], retention: HistoryRetention, now = Date.now(), limit = 500): { kept: HistoryItem[]; dropped: HistoryItem[] } {
  const max = retentionMaxAgeMs(retention);
  const kept: HistoryItem[] = [];
  const dropped: HistoryItem[] = [];
  for (const item of items) {
    const keep = max === null ? true : max === 0 ? keepsWhenRetentionOff(item) : now - item.date < max;
    (keep ? kept : dropped).push(item);
  }
  if (kept.length > limit) {
    dropped.push(...kept.splice(limit));
  }
  return { kept, dropped };
}

export function scrubHistoryItem(item: HistoryItem): HistoryItem {
  return {
    ...item,
    text: redactSecrets(item.text ?? ''),
    rawText: redactSecrets(item.rawText ?? ''),
    reason: item.reason ? redactSecrets(item.reason) : undefined,
    error: item.error ? redactSecrets(item.error) : undefined,
  };
}

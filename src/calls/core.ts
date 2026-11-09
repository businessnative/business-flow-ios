// Call notes ("Hívás-jegyzetek"): pure parsing / shaping logic, unit-tested without native modules.
// Source of audio/transcripts is iOS 18+ native call recording (Phone app → Notes); apps cannot tap call audio.

export type CallSource = 'audio' | 'transcript' | 'speakerphone';
/** How speakers were separated: model diarization, LLM guess from text, labels found in the Notes transcript, or none. */
export type SpeakerMethod = 'diarize' | 'llm' | 'notes' | 'none';

export interface Segment {
  speaker: string; // "A", "B" … or a name from the transcript
  text: string;
  start?: number; // seconds
}

export interface CallSummary {
  title: string;
  summary: string;
  decisions: string[];
  todos: string[];
  followUps: string[];
  keyFacts: string[]; // numbers, dates, prices, names
}

export interface CallNote {
  id: string;
  date: number;
  source: CallSource;
  status: 'processing' | 'done' | 'error';
  error?: string;
  fileName?: string;
  durationSeconds?: number;
  segments: Segment[];
  speakerMethod: SpeakerMethod;
  /** Display names for speaker labels (user-editable), e.g. { A: 'Én', B: 'Kovács Péter' }. */
  speakerNames: Record<string, string>;
  transcript: string;
  summary: CallSummary | null;
  /** False when the offline fallback summary was used (no key / LLM failed). */
  summaryByLLM?: boolean;
  /** Kept only until processing succeeds, so a failed import can be retried. */
  audioUri?: string;
}

export const AUDIO_EXT = ['m4a', 'mp4', 'aac', 'wav', 'mp3', 'caf', 'aiff', 'aif', 'mpeg', 'webm', 'ogg'];
export const TEXT_EXT = ['txt', 'md', 'rtf', 'text'];
/** OpenAI audio upload limit is 25 MB; stay under it. ~50 min of a Phone-app AAC recording. */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

export function classifyFile(name: string, mime?: string | null): 'audio' | 'text' | 'unknown' {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (mime?.startsWith('audio/') || AUDIO_EXT.includes(ext)) return 'audio';
  if (mime?.startsWith('text/') || TEXT_EXT.includes(ext)) return 'text';
  return 'unknown';
}

export function audioMime(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return ({ m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', mp3: 'audio/mpeg', mpeg: 'audio/mpeg', caf: 'audio/x-caf', aiff: 'audio/aiff', aif: 'audio/aiff', webm: 'audio/webm', ogg: 'audio/ogg' } as Record<string, string>)[ext] ?? 'audio/mp4';
}

const TS = /^\s*\[?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\]?\s*[-–—:]?\s*/;
const SPEAKER = /^\s*([\p{L}][\p{L}\p{M} .'-]{0,30}?|Beszélő \d+|Speaker \d+|Hívó|Hívott|Én)\s*:\s+(.+)$/u;

const toSeconds = (t: string) => t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);

/**
 * Parses a transcript pasted/shared from Notes (iOS 18 call recording) or any plain text.
 * Handles timestamps ("00:12", "[1:02:03]") and "Name: text" speaker labels; unlabelled text becomes one block.
 */
export function parseTranscript(raw: string): { segments: Segment[]; labelled: boolean } {
  const text = raw.replace(/\r\n?/g, '\n').normalize('NFC').replace(/\u00a0/g, ' ');
  const segments: Segment[] = [];
  let labelled = false;
  let pendingStart: number | undefined;
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line) continue;
    const ts = line.match(TS);
    let start: number | undefined;
    if (ts) {
      start = toSeconds(ts[1]);
      line = line.slice(ts[0].length).trim();
      if (!line) { pendingStart = start; continue; }
    }
    start ??= pendingStart;
    pendingStart = undefined;
    const sp = line.match(SPEAKER);
    if (sp && !/^(https?|mailto)$/i.test(sp[1])) {
      labelled = true;
      segments.push({ speaker: sp[1].trim(), text: sp[2].trim(), start });
    } else if (segments.length && (!labelled || start === undefined)) {
      const last = segments[segments.length - 1];
      last.text += (last.text.endsWith('-') ? '' : ' ') + line;
    } else {
      segments.push({ speaker: labelled ? segments[segments.length - 1]?.speaker ?? 'A' : 'A', text: line, start });
    }
  }
  return { segments: labelled ? mergeSegments(segments) : segments.length ? [{ speaker: 'A', text: segments.map((s) => s.text).join(' '), start: segments[0].start }] : [], labelled };
}

/** Joins consecutive segments of the same speaker. */
export function mergeSegments(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const t = s.text.trim();
    if (!t) continue;
    const last = out[out.length - 1];
    if (last && last.speaker === s.speaker) last.text += ' ' + t;
    else out.push({ ...s, text: t });
  }
  return out;
}

/** OpenAI diarized_json → segments. */
export function parseDiarized(json: unknown): Segment[] {
  const segs = (json as { segments?: { speaker?: string; text?: string; start?: number }[] })?.segments;
  if (!Array.isArray(segs)) return [];
  return mergeSegments(segs.map((s) => ({ speaker: String(s.speaker ?? 'A'), text: String(s.text ?? ''), start: typeof s.start === 'number' ? s.start : undefined })));
}

export const speakerCount = (segs: Segment[]) => new Set(segs.map((s) => s.speaker)).size;

export function formatTime(s?: number): string {
  if (s === undefined || !isFinite(s)) return '';
  const m = Math.floor(s / 60), x = Math.floor(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}

export const displayName = (n: CallNote, speaker: string) => n.speakerNames[speaker] || (/^[A-Z]$/.test(speaker) ? `${speaker} beszélő` : speaker);

export function transcriptText(segs: Segment[], names: Record<string, string> = {}, withSpeakers = true): string {
  return segs.map((s) => (withSpeakers ? `${names[s.speaker] || s.speaker}: ` : '') + s.text).join('\n');
}

// ---- LLM prompts ----

/** Speaker separation from text only (when audio diarization is unavailable). Output: lines "A: …" / "B: …". */
export const SPEAKER_SPLIT_PROMPT = `Egy telefonhívás leiratát kapod, beszélők jelölése nélkül. Bontsd fordulókra, és jelöld a beszélőket "A:" és "B:" előtaggal (ha egyértelműen több fél van, "C:" stb.). Az "A" az, aki a hívást kezdi.
Szabályok: a szöveget szó szerint tartsd meg, ne foglald össze, ne javíts, ne tegyél hozzá semmit. Minden forduló külön sorba. Csak a jelölt leiratot add vissza.`;

export const SUMMARY_PROMPT = `Egy telefonhívás leiratából készíts magyar nyelvű hívás-jegyzetet üzleti használatra. Csak JSON-t adj vissza, pontosan ezzel a szerkezettel:
{"title": "rövid cím (max 8 szó)", "summary": "3-5 mondatos összefoglaló", "decisions": ["döntések"], "todos": ["teendők, felelőssel és határidővel, ha elhangzott"], "followUps": ["nyitott kérdések, visszahívandó dolgok"], "keyFacts": ["fontos számok, dátumok, árak, nevek, címek"]}
Szabályok: csak azt írd, ami a leiratban elhangzott, ne találj ki semmit. Üres listát adj, ha nincs ilyen. A beszélőket a leirat jelölésével nevezd meg.`;

export function parseSpeakerSplit(out: string): Segment[] {
  const segs: Segment[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*([A-F])\s*:\s*(.+)$/);
    if (m) segs.push({ speaker: m[1], text: m[2].trim() });
    else if (line.trim() && segs.length) segs[segs.length - 1].text += ' ' + line.trim();
  }
  return mergeSegments(segs);
}

/** True when the LLM kept the words (guards against it summarising instead of labelling). */
export function preservesText(original: string, segs: Segment[], minRatio = 0.85): boolean {
  const words = (s: string) => s.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
  const a = words(original), b = new Set(words(segs.map((s) => s.text).join(' ')));
  if (!a.length) return false;
  return a.filter((w) => b.has(w)).length / a.length >= minRatio && words(segs.map((s) => s.text).join(' ')).length <= a.length * 1.15;
}

const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 30) : []);

export function parseSummary(out: string): CallSummary | null {
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const summary = String(j.summary ?? '').trim();
    if (!summary) return null;
    return { title: String(j.title ?? '').trim().slice(0, 80) || 'Hívás', summary, decisions: strList(j.decisions), todos: strList(j.todos), followUps: strList(j.followUps), keyFacts: strList(j.keyFacts) };
  } catch {
    return null;
  }
}

/** Offline fallback (no chat key / LLM failed): first sentences as summary, so the note is still useful. */
export function localSummary(segs: Segment[]): CallSummary {
  const all = segs.map((s) => s.text).join(' ').trim();
  const sentences = (all.match(/[^.!?]+[.!?]*/g) ?? [all]).map((x) => x.trim()).filter(Boolean);
  const title = (sentences[0] ?? 'Hívás').split(/\s+/).slice(0, 6).join(' ').replace(/[.!?,]+$/, '') || 'Hívás';
  return { title, summary: sentences.slice(0, 3).join(' ').trim(), decisions: [], todos: [], followUps: [], keyFacts: [] };
}

/** Plain-text export (share / copy / paste into Notes or CRM). */
export function exportText(n: CallNote): string {
  const s = n.summary;
  const d = new Date(n.date);
  const lines = [`${s?.title ?? 'Hívás'} — ${d.toLocaleDateString('hu-HU')} ${d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}`, ''];
  if (s) {
    lines.push('Összefoglaló', s.summary, '');
    const sec = (t: string, xs: string[]) => { if (xs.length) lines.push(t, ...xs.map((x) => '• ' + x), ''); };
    sec('Döntések', s.decisions); sec('Teendők', s.todos); sec('Nyitott kérdések', s.followUps); sec('Fontos adatok', s.keyFacts);
  }
  lines.push('Leirat', transcriptText(n.segments, Object.fromEntries(Object.keys(n.speakerNames).map((k) => [k, displayName(n, k)]))));
  return lines.join('\n').trim();
}

// Call-notes processing: audio → (diarized) transcript → speakers → summary/notes. Dependencies injected for tests.
import type { AppSettings } from '@/engine/types';
import { OpenAIError, transcribeDiarized, type FilePart } from '@/services/openai';
import { chatAny, transcribeAny, type HttpDeps } from '@/services/providers';
import {
  MAX_UPLOAD_BYTES, SPEAKER_SPLIT_PROMPT, SUMMARY_PROMPT, audioMime, localSummary, mergeSegments, parseDiarized, parseSpeakerSplit,
  parseSummary, parseTranscript, preservesText, speakerCount, transcriptText, type CallSummary, type Segment, type SpeakerMethod,
} from './core';

type Keys = Partial<Record<'openai' | 'anthropic' | 'gemini', string | null>>;

export interface CallDeps extends HttpDeps {
  readBase64: (uri: string) => Promise<string>;
  signal?: AbortSignal;
}

export interface Processed {
  segments: Segment[];
  speakerMethod: SpeakerMethod;
  transcript: string;
  summary: CallSummary;
  summaryByLLM: boolean;
}

/** Upload timeout for a whole call file: grows with size (≈1 MB/min AAC), 60–600 s. */
export const callTimeoutS = (bytes: number) => Math.min(600, Math.max(60, Math.round(60 + (bytes / (1024 * 1024)) * 15)));
/** LLM speaker split only for transcripts that fit comfortably in one request. */
export const MAX_SPLIT_CHARS = 14_000;

const hasChat = (s: AppSettings, keys: Keys) => !!keys[s.chatProviderId] || (s.providerFallback && !!(keys.openai || keys.anthropic || keys.gemini));

export async function transcribeCall(s: AppSettings, keys: Keys, a: { uri: string; name: string; size: number }, d: CallDeps): Promise<{ segments: Segment[]; method: SpeakerMethod; text: string }> {
  if (a.size > MAX_UPLOAD_BYTES) throw Object.assign(new OpenAIError('tooLarge'), { message: `A hangfájl túl nagy (${Math.round(a.size / 1048576)} MB, max. 24 MB ≈ 45–50 perc). Vágd ketté a Fájlok appban, vagy importáld a Jegyzetekben készült leiratot.` });
  const file: FilePart = { uri: a.uri, name: a.name, type: audioMime(a.name) };
  const timeoutS = callTimeoutS(a.size);
  // 1) Audio diarization (OpenAI) — real speaker separation from the voices.
  if (keys.openai && s.callDiarize !== false) {
    try {
      const segs = parseDiarized(await transcribeDiarized({ apiKey: keys.openai, ...d }, { file, language: s.language, signal: d.signal, timeoutS }));
      if (segs.length) return { segments: segs, method: speakerCount(segs) > 1 ? 'diarize' : 'none', text: segs.map((x) => x.text).join(' ') };
    } catch (e) {
      // Model retired / not enabled for the key / server error → fall back to the normal pipeline below.
      if (!(e instanceof OpenAIError) || e.kind === 'cancelled' || e.kind === 'unauthorized' || e.kind === 'quota' || e.kind === 'tooLarge') throw e;
    }
  }
  // 2) Normal high-quality transcription (provider routing + fallback), speakers split later from text.
  const terms = s.dictionary.map((x) => x.term);
  const { text } = await transcribeAny(s, keys, { file, uri: a.uri, language: s.language, terms, signal: d.signal, readBase64: d.readBase64, timeoutS, mime: audioMime(a.name), seconds: 600 }, d);
  return { segments: [{ speaker: 'A', text: text.trim() }], method: 'none', text };
}

/** Speaker separation from text (LLM), verified to keep the original words; otherwise left unsplit. */
export async function splitSpeakers(s: AppSettings, keys: Keys, text: string, d: CallDeps): Promise<{ segments: Segment[]; method: SpeakerMethod }> {
  const single = { segments: [{ speaker: 'A', text }], method: 'none' as SpeakerMethod };
  if (!hasChat(s, keys) || text.length > MAX_SPLIT_CHARS || text.split(/\s+/).length < 12) return single;
  try {
    const out = await chatAny(s, keys, SPEAKER_SPLIT_PROMPT, text, d.signal, d, 60);
    const segs = parseSpeakerSplit(out);
    if (segs.length && speakerCount(segs) > 1 && preservesText(text, segs)) return { segments: segs, method: 'llm' };
  } catch (e) {
    if (e instanceof OpenAIError && e.kind === 'cancelled') throw e;
  }
  return single;
}

export async function summarize(s: AppSettings, keys: Keys, segs: Segment[], d: CallDeps): Promise<{ summary: CallSummary; byLLM: boolean }> {
  if (hasChat(s, keys)) {
    try {
      const out = await chatAny(s, keys, SUMMARY_PROMPT, transcriptText(segs).slice(0, 60_000), d.signal, d, 90);
      const sum = parseSummary(out);
      if (sum) return { summary: sum, byLLM: true };
    } catch (e) {
      if (e instanceof OpenAIError && e.kind === 'cancelled') throw e;
    }
  }
  return { summary: localSummary(segs), byLLM: false };
}

export async function processAudio(s: AppSettings, keys: Keys, a: { uri: string; name: string; size: number }, d: CallDeps): Promise<Processed> {
  const t = await transcribeCall(s, keys, a, d);
  if (!t.text.trim()) throw new OpenAIError('emptyResult');
  const sp = t.method === 'none' ? await splitSpeakers(s, keys, t.text.trim(), d) : { segments: t.segments, method: t.method };
  return finish(s, keys, sp.segments, sp.method, d);
}

export async function processTranscript(s: AppSettings, keys: Keys, raw: string, d: CallDeps): Promise<Processed> {
  const p = parseTranscript(raw);
  if (!p.segments.length) throw new OpenAIError('emptyResult');
  const sp = p.labelled ? { segments: p.segments, method: 'notes' as SpeakerMethod } : await splitSpeakers(s, keys, p.segments[0].text, d);
  return finish(s, keys, sp.segments, sp.method, d);
}

async function finish(s: AppSettings, keys: Keys, segments: Segment[], method: SpeakerMethod, d: CallDeps): Promise<Processed> {
  const segs = mergeSegments(segments);
  const { summary, byLLM } = await summarize(s, keys, segs, d);
  return { segments: segs, speakerMethod: method, transcript: transcriptText(segs), summary, summaryByLLM: byLLM };
}

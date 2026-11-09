// Port of bn-flow-mac Sources/BNFlowCore/OpenAIClient.swift (transcription + chat) for React Native fetch.
import { cleanOutput, transcriptionPrompt } from '@/engine/prompts';
import { languageCodes, type DictationLanguage } from '@/engine/types';
import type { ChatResult } from '@/engine/formatter';
import { transcribeTimeoutS } from '@/session/watchdog';

export { transcribeTimeoutS };

export type ProviderName = 'openai' | 'anthropic' | 'gemini';

export type OpenAIErrorKind =
  | 'noAPIKey' | 'unauthorized' | 'quota' | 'rateLimit' | 'tooLarge' | 'badRequest' | 'server' | 'network' | 'emptyResult' | 'timeout' | 'cancelled';

export class OpenAIError extends Error {
  constructor(public kind: OpenAIErrorKind, public status?: number, public provider?: ProviderName) {
    super(errorMessage(kind, provider));
  }
}

/** Attach the provider that failed (for provider-specific texts, e.g. which balance ran out). */
export function tagProvider(e: unknown, p: ProviderName): unknown {
  if (e instanceof OpenAIError && !e.provider) {
    e.provider = p;
    e.message = errorMessage(e.kind, p);
  }
  return e;
}

const quotaText: Record<ProviderName, string> = {
  openai: 'Elfogyott az OpenAI-egyenleg (keret). Tölts fel a platform.openai.com → Billing oldalon, vagy válts szolgáltatót a Beállításokban.',
  anthropic: 'Elfogyott a Claude (Anthropic) egyenleg. Tölts fel a console.anthropic.com → Billing oldalon, vagy válts szolgáltatót a Beállításokban.',
  gemini: 'Elfogyott a Google Gemini keret. Ellenőrizd a számlázást az aistudio.google.com oldalon, vagy válts szolgáltatót a Beállításokban.',
};

export function errorMessage(k: OpenAIErrorKind, provider?: ProviderName): string {
  switch (k) {
    case 'noAPIKey': return 'Nincs beállítva API-kulcs a választott szolgáltatóhoz (Beállítások → Szolgáltatók).';
    case 'unauthorized': return 'Az API-kulcs érvénytelen.';
    case 'quota': return quotaText[provider ?? 'openai'];
    case 'rateLimit': return 'Túl sok kérés, próbáld újra pár másodperc múlva.';
    case 'tooLarge': return 'A felvétel túl hosszú.';
    case 'badRequest': return 'A szolgáltatás elutasította a kérést.';
    case 'server': return 'Az átírási szolgáltatás most nem elérhető.';
    case 'network': return 'Nincs hálózati kapcsolat.';
    case 'emptyResult': return 'Nem érkezett szöveg.';
    case 'timeout': return 'Időtúllépés.';
    case 'cancelled': return 'Megszakítva.';
  }
}

export function shortLabel(k: OpenAIErrorKind): string {
  return k === 'noAPIKey' ? 'Nincs kulcs' : k === 'network' || k === 'timeout' ? 'Nincs net' : k === 'emptyResult' ? 'Csend' : 'Hiba';
}

export function mapStatus(status: number, body: string): OpenAIErrorKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return body.includes('insufficient_quota') ? 'quota' : 'rateLimit';
  if (status === 413) return 'tooLarge';
  if (status === 400 || status === 404 || status === 422) return 'badRequest';
  return 'server';
}

const retryable = (k: OpenAIErrorKind) => k === 'rateLimit' || k === 'server' || k === 'network' || k === 'timeout';

export interface ClientDeps {
  apiKey: string | null;
  fetchImpl?: typeof fetch;
  baseURL?: string;
  sleep?: (ms: number) => Promise<void>;
}

const BASE = 'https://api.openai.com/v1/';
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function request(deps: ClientDeps, path: string, init: RequestInit, timeoutS: number, outer?: AbortSignal): Promise<unknown> {
  if (!deps.apiKey) throw new OpenAIError('noAPIKey');
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutS * 1000);
  const onOuter = () => ctl.abort();
  outer?.addEventListener('abort', onOuter);
  try {
    const res = await (deps.fetchImpl ?? fetch)((deps.baseURL ?? BASE) + path, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${deps.apiKey}` },
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new OpenAIError(mapStatus(res.status, text), res.status);
    try {
      return JSON.parse(text);
    } catch {
      throw new OpenAIError('server', res.status);
    }
  } catch (e) {
    if (e instanceof OpenAIError) throw e;
    if (outer?.aborted) throw new OpenAIError('cancelled');
    throw new OpenAIError(timedOut ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}

/** A multipart file part. In React Native, FormData accepts `{ uri, name, type }`. */
export type FilePart = { uri: string; name: string; type: string } | Blob;

export interface TranscribeOptions {
  file: FilePart;
  language: DictationLanguage;
  terms: string[];
  model: string;
  fallbackModel: string;
  signal?: AbortSignal;
  /** Recording length; sets the per-request timeout. */
  audioSeconds?: number;
  /** Explicit per-request timeout (long call recordings). */
  timeoutS?: number;
}

export function transcriptionForm(o: TranscribeOptions, model: string): FormData {
  const f = new FormData();
  f.append('file', o.file as unknown as Blob, 'audio.wav');
  f.append('model', model);
  f.append('prompt', transcriptionPrompt(o.language, o.terms));
  f.append('response_format', 'json');
  if (model.startsWith('gpt-transcribe')) {
    for (const c of languageCodes(o.language)) f.append('languages[]', c);
    for (const t of o.terms.slice(0, 32)) f.append('keywords[]', t);
  } else if (o.language !== 'auto') {
    f.append('language', o.language);
  }
  return f;
}

export async function transcribe(deps: ClientDeps, o: TranscribeOptions): Promise<string> {
  const sleep = deps.sleep ?? defaultSleep;
  const once = async (model: string) => {
    const json = (await request(deps, 'audio/transcriptions', { method: 'POST', body: transcriptionForm(o, model) }, o.timeoutS ?? transcribeTimeoutS(o.audioSeconds ?? 30), o.signal)) as { text?: string };
    const text = (json?.text ?? '').trim();
    if (!text) throw new OpenAIError('emptyResult');
    return text;
  };
  const withRetry = async (model: string) => {
    try {
      return await once(model);
    } catch (e) {
      // A timed-out upload is not retried on the same provider: the failover / watchdog budget is better spent on the other one.
      if (e instanceof OpenAIError && retryable(e.kind) && e.kind !== 'timeout') {
        await sleep(600);
        return once(model);
      }
      throw e;
    }
  };
  try {
    return await withRetry(o.model);
  } catch (e) {
    if (e instanceof OpenAIError && e.kind === 'badRequest' && o.fallbackModel && o.fallbackModel !== o.model) return withRetry(o.fallbackModel);
    throw e;
  }
}

/** Speaker-labelled transcription (OpenAI diarization model). Returns the raw diarized_json. No prompt support. */
export const DIARIZE_MODEL = 'gpt-4o-transcribe-diarize';
export async function transcribeDiarized(deps: ClientDeps, o: { file: FilePart; language: DictationLanguage; signal?: AbortSignal; timeoutS: number; model?: string }): Promise<unknown> {
  const f = new FormData();
  f.append('file', o.file as unknown as Blob, (o.file as { name?: string }).name ?? 'call.m4a');
  f.append('model', o.model ?? DIARIZE_MODEL);
  f.append('response_format', 'diarized_json');
  f.append('chunking_strategy', 'auto');
  if (o.language !== 'auto') f.append('language', languageCodes(o.language)[0] ?? 'hu');
  return request(deps, 'audio/transcriptions', { method: 'POST', body: f }, o.timeoutS, o.signal);
}

export function parseChat(json: unknown): string {
  const content = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return cleanOutput(content);
  if (Array.isArray(content)) return cleanOutput(content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join(''));
  return '';
}

/** Gyorsítás: gpt-5 / o-sorozat érvelő modelljeinél alacsony érvelési szint (szövegtisztításhoz elég, 2-4x gyorsabb). */
export const isReasoningModel = (m: string) => /^(gpt-5|o1|o3|o4)/.test(m);

export async function chat(deps: ClientDeps, model: string, fallback: string, system: string, user: string, signal?: AbortSignal, timeoutS = 20): Promise<string> {
  const once = async (m: string) => {
    const json = await request(
      deps,
      'chat/completions',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...(isReasoningModel(m) ? { reasoning_effort: 'low' } : {}) }) },
      timeoutS,
      signal,
    );
    const text = parseChat(json);
    if (!text) throw new OpenAIError('emptyResult');
    return text;
  };
  try {
    return await once(model);
  } catch (e) {
    if (e instanceof OpenAIError && (e.kind === 'badRequest' || e.kind === 'server') && fallback && fallback !== model) return once(fallback);
    throw e;
  }
}

/** Adapter for formatter.ts `ChatProvider`. */
export const chatProvider = (deps: ClientDeps, model: string, fallback: string) =>
  async (system: string, user: string, signal?: AbortSignal): Promise<ChatResult> => {
    try {
      return { ok: true, text: await chat(deps, model, fallback, system, user, signal) };
    } catch (e) {
      return { ok: false, error: e instanceof OpenAIError ? e.kind : 'server' };
    }
  };

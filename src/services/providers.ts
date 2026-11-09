// Multi-provider bring-your-own-key (0.3.0): OpenAI, Anthropic Claude, Google Gemini.
// Keys stay on the device (Keychain); they are only ever sent to the provider's own API host and never logged.
import { cleanOutput, transcriptionPrompt } from '@/engine/prompts';
import type { DictationLanguage } from '@/engine/types';
import type { ChatResult } from '@/engine/formatter';
import { OpenAIError, chat as openaiChat, mapStatus, tagProvider, transcribeTimeoutS, transcribe as openaiTranscribe, type FilePart, type OpenAIErrorKind } from './openai';

export type ProviderId = 'openai' | 'anthropic' | 'gemini';
export type TranscriptionProviderId = 'openai' | 'gemini';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  keyUrl: string;
  keyHint: string;
  looksLikeKey: (s: string) => boolean;
  /** Text cleanup models, cheapest sensible first. Verified against provider docs 2026-11-02. */
  chatModels: { id: string; label: string }[];
  defaultChat: string;
  fallbackChat: string;
  transcriptionModels: { id: string; label: string }[];
  defaultTranscription?: string;
  fallbackTranscription?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    looksLikeKey: (s) => /^sk-[A-Za-z0-9_-]{20,}$/.test(s.trim()),
    chatModels: [
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna (olcsó, gyors)' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    ],
    defaultChat: 'gpt-5.6-luna',
    fallbackChat: 'gpt-4.1-mini',
    transcriptionModels: [
      { id: 'gpt-transcribe', label: 'gpt-transcribe (ajánlott)' },
      { id: 'gpt-4o-transcribe', label: 'gpt-4o-transcribe' },
    ],
    defaultTranscription: 'gpt-transcribe',
    fallbackTranscription: 'gpt-4o-transcribe',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
    looksLikeKey: (s) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(s.trim()),
    chatModels: [
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (olcsó, gyors)' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (drágább)' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ],
    defaultChat: 'claude-haiku-5-5',
    fallbackChat: 'claude-haiku-4-5',
    transcriptionModels: [], // Claude has no speech-to-text API.
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
    looksLikeKey: (s) => /^[A-Za-z0-9_-]{30,}$/.test(s.trim()),
    chatModels: [
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (olcsó, gyors)' },
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (okosabb)' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
    ],
    defaultChat: 'gemini-3.5-flash-lite',
    fallbackChat: 'gemini-3.1-flash-lite',
    transcriptionModels: [
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (olcsó)' },
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    ],
    defaultTranscription: 'gemini-3.5-flash-lite',
    fallbackTranscription: 'gemini-3.1-flash-lite',
  },
};

export const CLAUDE_NO_STT = 'A Claude-nak nincs beszéd→szöveg API-ja, ezért átírásra csak OpenAI vagy Gemini választható. A Claude a szöveg tisztázására használható.';

export const maskKey = (s: string | null) => (s ? `…${s.slice(-4)}` : '');

export interface HttpDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

async function postJson(deps: HttpDeps, url: string, headers: Record<string, string>, body: unknown, timeoutS: number, outer?: AbortSignal): Promise<unknown> {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutS * 1000);
  const onOuter = () => ctl.abort();
  outer?.addEventListener('abort', onOuter);
  try {
    const res = await (deps.fetchImpl ?? fetch)(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    const text = await res.text();
    if (!res.ok) throw new OpenAIError(mapProviderStatus(res.status, text), res.status);
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

export function mapProviderStatus(status: number, body: string): OpenAIErrorKind {
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) return 'unauthorized'; // Gemini
  if (status === 529) return 'server'; // Anthropic overloaded
  if ((status === 429 || status === 400 || status === 402) && /RESOURCE_EXHAUSTED.*quota|credit balance|insufficient_quota|billing/i.test(body)) return 'quota';
  return mapStatus(status, body);
}

// ---- Anthropic ----
const ANTHROPIC = 'https://api.anthropic.com/v1/';
const anthropicHeaders = (key: string) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' });

export function parseClaude(json: unknown): string {
  const c = (json as { content?: { type?: string; text?: string }[] })?.content;
  return Array.isArray(c) ? cleanOutput(c.filter((p) => p?.type === 'text').map((p) => p.text ?? '').join('')) : '';
}

export async function claudeChat(deps: HttpDeps & { apiKey: string | null }, model: string, system: string, user: string, signal?: AbortSignal, timeoutS = 20): Promise<string> {
  if (!deps.apiKey) throw new OpenAIError('noAPIKey');
  const json = await postJson(deps, ANTHROPIC + 'messages', anthropicHeaders(deps.apiKey), { model, max_tokens: 2048, system, messages: [{ role: 'user', content: user }] }, timeoutS, signal);
  const t = parseClaude(json);
  if (!t) throw new OpenAIError('emptyResult');
  return t;
}

// ---- Gemini ----
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/';
const geminiHeaders = (key: string) => ({ 'x-goog-api-key': key });

export function parseGemini(json: unknown): string {
  const parts = (json as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.filter((p) => !p?.thought).map((p) => p?.text ?? '').join('').trim() : '';
}

export async function geminiChat(deps: HttpDeps & { apiKey: string | null }, model: string, system: string, user: string, signal?: AbortSignal, timeoutS = 20): Promise<string> {
  if (!deps.apiKey) throw new OpenAIError('noAPIKey');
  const json = await postJson(deps, `${GEMINI}models/${encodeURIComponent(model)}:generateContent`, geminiHeaders(deps.apiKey), { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }] }, timeoutS, signal);
  const t = cleanOutput(parseGemini(json));
  if (!t) throw new OpenAIError('emptyResult');
  return t;
}

export async function geminiTranscribe(deps: HttpDeps & { apiKey: string | null }, model: string, audioBase64: string, language: DictationLanguage, terms: string[], signal?: AbortSignal, audioSeconds = 30, timeoutS?: number, mime = 'audio/wav'): Promise<string> {
  if (!deps.apiKey) throw new OpenAIError('noAPIKey');
  const instr = `Írd le szó szerint, amit a felvételen mondanak. Csak az átiratot add vissza, magyarázat nélkül. Ha nincs beszéd, adj vissza üres választ. ${transcriptionPrompt(language, terms)}`;
  const json = await postJson(deps, `${GEMINI}models/${encodeURIComponent(model)}:generateContent`, geminiHeaders(deps.apiKey), { contents: [{ role: 'user', parts: [{ text: instr }, { inline_data: { mime_type: mime, data: audioBase64 } }] }] }, timeoutS ?? transcribeTimeoutS(audioSeconds), signal);
  const t = parseGemini(json);
  if (!t) throw new OpenAIError('emptyResult');
  return t;
}

// ---- Key test ----
/** Cheap authenticated call (model list) — no tokens spent. Returns a Hungarian result line. */
export async function testKey(provider: ProviderId, apiKey: string, deps: HttpDeps = {}): Promise<{ ok: boolean; message: string }> {
  const url = provider === 'openai' ? 'https://api.openai.com/v1/models' : provider === 'anthropic' ? ANTHROPIC + 'models' : GEMINI + 'models';
  const headers = provider === 'openai' ? { Authorization: `Bearer ${apiKey}` } : provider === 'anthropic' ? anthropicHeaders(apiKey) : geminiHeaders(apiKey);
  try {
    await postJson(deps, url, headers, undefined, 10);
    return { ok: true, message: `${PROVIDERS[provider].name}: a kulcs működik.` };
  } catch (e) {
    const k = e instanceof OpenAIError ? e.kind : 'server';
    return { ok: false, message: `${PROVIDERS[provider].name}: ${k === 'unauthorized' ? 'a kulcs érvénytelen vagy nincs jogosultsága.' : k === 'quota' ? 'elfogyott a keret / nincs egyenleg.' : k === 'network' || k === 'timeout' ? 'nem érhető el (nincs net?).' : 'a szolgáltatás hibát adott, próbáld később.'}` };
  }
}

// ---- Connection warmup ----
// The first transcription pays a TLS handshake. A HEAD to the model list (no body, no tokens) during idle
// lets NSURLSession reuse the connection. Cancelled when processing starts so it never shares the radio with the upload.
const warmedHosts = new Set<string>();
const warmingHosts = new Set<string>();
let warmCtl: AbortController | null = null;
let warmTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelProviderWarmup() {
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = null;
  warmCtl?.abort();
  warmCtl = null;
}

export function resetProviderWarmup() {
  warmedHosts.clear();
  warmingHosts.clear();
  cancelProviderWarmup();
}

/** Fire-and-forget. Never logs the key or any dictated text (there is none on this call). */
export function warmTranscriptionConnection(s: RouteSettings, keys: Keys, deps: HttpDeps = {}): void {
  const p = s.transcriptionProvider;
  const apiKey = keys[p];
  if (!apiKey || warmedHosts.has(p) || warmingHosts.has(p)) return;
  cancelProviderWarmup();
  warmingHosts.add(p);
  const url = p === 'openai' ? 'https://api.openai.com/v1/models' : `${GEMINI}models`;
  const headers = p === 'openai' ? { Authorization: `Bearer ${apiKey}` } : geminiHeaders(apiKey);
  const ctl = new AbortController();
  warmCtl = ctl;
  warmTimer = setTimeout(() => ctl.abort(), 4000);
  void (deps.fetchImpl ?? fetch)(url, { method: 'HEAD', headers, signal: ctl.signal })
    .then((res) => {
      if (!ctl.signal.aborted) warmedHosts.add(p);
      return res.body?.cancel?.();
    })
    .catch(() => {})
    .finally(() => {
      warmingHosts.delete(p);
      if (warmTimer && warmCtl === ctl) {
        clearTimeout(warmTimer);
        warmTimer = null;
      }
    });
}

// ---- Routing with fallback ----
export type Keys = Partial<Record<ProviderId, string | null>>;

export interface RouteSettings {
  transcriptionProvider: TranscriptionProviderId;
  chatProviderId: ProviderId;
  providerFallback: boolean;
  transcriptionModel: string;
  fallbackTranscriptionModel: string;
  chatModel: string;
  fallbackChatModel: string;
  claudeModel: string;
  geminiChatModel: string;
  geminiTranscriptionModel: string;
}

/** Errors where trying the other provider makes sense (not user cancel / silence). */
const shouldFailover = (k: OpenAIErrorKind) => k !== 'cancelled' && k !== 'emptyResult' && k !== 'tooLarge';

export const transcriptionOrder = (s: RouteSettings, keys: Keys): TranscriptionProviderId[] => {
  const other: TranscriptionProviderId = s.transcriptionProvider === 'openai' ? 'gemini' : 'openai';
  return [s.transcriptionProvider, ...(s.providerFallback && keys[other] ? [other] : [])];
};

export const chatOrder = (s: RouteSettings, keys: Keys): ProviderId[] => {
  const rest = (['openai', 'anthropic', 'gemini'] as ProviderId[]).filter((p) => p !== s.chatProviderId && keys[p]);
  return [s.chatProviderId, ...(s.providerFallback ? rest : [])];
};

export interface TranscribeInput {
  file: FilePart;
  uri: string;
  language: DictationLanguage;
  terms: string[];
  signal?: AbortSignal;
  readBase64: (uri: string) => Promise<string>;
  /** Recording length in seconds (sets request timeouts). */
  seconds?: number;
  /** Explicit per-request timeout (long call recordings). */
  timeoutS?: number;
  /** MIME type for Gemini inline audio (default audio/wav). */
  mime?: string;
}

export async function transcribeAny(s: RouteSettings, keys: Keys, i: TranscribeInput, deps: HttpDeps = {}): Promise<{ text: string; provider: TranscriptionProviderId }> {
  let last: unknown = new OpenAIError('noAPIKey');
  for (const p of transcriptionOrder(s, keys)) {
    try {
      if (p === 'openai') {
        const text = await openaiTranscribe({ apiKey: keys.openai ?? null, ...deps }, { file: i.file, language: i.language, terms: i.terms, model: s.transcriptionModel, fallbackModel: s.fallbackTranscriptionModel, signal: i.signal, audioSeconds: i.seconds, timeoutS: i.timeoutS });
        return { text, provider: p };
      }
      const b64 = await i.readBase64(i.uri);
      try {
        return { text: await geminiTranscribe({ apiKey: keys.gemini ?? null, ...deps }, s.geminiTranscriptionModel, b64, i.language, i.terms, i.signal, i.seconds, i.timeoutS, i.mime), provider: p };
      } catch (e) {
        const fb = PROVIDERS.gemini.fallbackTranscription!;
        if (e instanceof OpenAIError && (e.kind === 'badRequest' || e.kind === 'server') && fb !== s.geminiTranscriptionModel) return { text: await geminiTranscribe({ apiKey: keys.gemini ?? null, ...deps }, fb, b64, i.language, i.terms, i.signal, i.seconds, i.timeoutS, i.mime), provider: p };
        throw e;
      }
    } catch (e) {
      last = tagProvider(e, p);
      if (!(e instanceof OpenAIError) || !shouldFailover(e.kind)) throw e;
    }
  }
  throw last;
}

export async function chatAny(s: RouteSettings, keys: Keys, system: string, user: string, signal?: AbortSignal, deps: HttpDeps = {}, timeoutS = 20): Promise<string> {
  let last: unknown = new OpenAIError('noAPIKey');
  for (const p of chatOrder(s, keys)) {
    const apiKey = keys[p] ?? null;
    try {
      if (p === 'openai') return await openaiChat({ apiKey, ...deps }, s.chatModel, s.fallbackChatModel, system, user, signal, timeoutS);
      const primary = p === 'anthropic' ? s.claudeModel : s.geminiChatModel;
      const fb = PROVIDERS[p].fallbackChat;
      const call = (m: string) => (p === 'anthropic' ? claudeChat({ apiKey, ...deps }, m, system, user, signal, timeoutS) : geminiChat({ apiKey, ...deps }, m, system, user, signal, timeoutS));
      try {
        return await call(primary);
      } catch (e) {
        if (e instanceof OpenAIError && (e.kind === 'badRequest' || e.kind === 'server') && fb !== primary) return await call(fb);
        throw e;
      }
    } catch (e) {
      last = tagProvider(e, p);
      if (!(e instanceof OpenAIError) || !shouldFailover(e.kind)) throw e;
    }
  }
  throw last;
}

/** Adapter for formatter.ts `ChatProvider`. */
export const routedChatProvider = (s: RouteSettings, keys: Keys) =>
  async (system: string, user: string, signal?: AbortSignal): Promise<ChatResult> => {
    try {
      return { ok: true, text: await chatAny(s, keys, system, user, signal) };
    } catch (e) {
      return { ok: false, error: e instanceof OpenAIError ? e.kind : 'server' };
    }
  };

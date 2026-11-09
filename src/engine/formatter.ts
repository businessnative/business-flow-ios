// TypeScript port of business-flow-mac Sources/BNFlowCore/Formatter.swift: local pipeline + optional guarded LLM pass.
import { chars, isLetter, isNumber, trimWSNL } from './chars';
import { processText, textWordCount } from './pipeline';
import { cleanOutput, smartFormattingPrompt, smartFormattingUser } from './prompts';
import { contextNames, words } from './rules';
import { toneFor, type AppCategory, type AppSettings, type DictationContext } from './types';

export type ChatResult = { ok: true; text: string } | { ok: false; error: string };
export type ChatProvider = (system: string, user: string, signal?: AbortSignal) => Promise<ChatResult>;

export interface FormatResult {
  text: string;
  usedLLM: boolean;
  llmRejected: boolean;
}

export async function withTimeout<T>(seconds: number, op: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctl.abort();
      resolve(null);
    }, Math.max(0.5, seconds) * 1000);
  });
  try {
    return await Promise.race([op(ctl.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type FormatStage = 'chat-scheduled' | 'local-start' | 'local-end';
/** Optional ordering trace for tests. Stages never include dictated text. */
export interface FormatTrace {
  mark: (stage: FormatStage) => void;
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function formatDictation(
  raw: string,
  s: AppSettings,
  context: DictationContext,
  category: AppCategory,
  chat: ChatProvider | null,
  trace?: FormatTrace,
): Promise<FormatResult> {
  const tone = toneFor(s, category);
  const ctx: DictationContext = s.contextAwareness ? context : { appName: context.appName, before: '', after: '', isSecure: false };
  const runLocal = () => processText(raw, s, tone, ctx, category);
  if (!s.smartFormatting || !chat || !needsLLM(raw)) return { text: runLocal(), usedLLM: false, llmRejected: false };
  const terms = [...s.dictionary.map((d) => d.term), ...contextNames(ctx)];
  const system = smartFormattingPrompt(tone, terms, category);
  const user = smartFormattingUser(raw, ctx);
  // Start the request, then yield so the HTTP stack can flush it, then run local cleanup while it is in flight.
  // The deadline starts after local cleanup, so the network still gets the full llmTimeoutSeconds (the request already ran during cleanup).
  const ctl = new AbortController();
  const pending = chat(system, user, ctl.signal);
  trace?.mark('chat-scheduled');
  await yieldToEventLoop();
  trace?.mark('local-start');
  const local = runLocal();
  trace?.mark('local-end');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ChatResult | null>((resolve) => {
    timer = setTimeout(() => {
      ctl.abort();
      resolve(null);
    }, Math.max(0.5, s.llmTimeoutSeconds) * 1000);
  });
  try {
    const result = await Promise.race([pending, timeout]);
    if (!result || !result.ok) return { text: local, usedLLM: false, llmRejected: false };
    const cleaned = cleanOutput(result.text);
    if (!llmAccept(raw, local, cleaned)) return { text: local, usedLLM: false, llmRejected: true };
    const post: AppSettings = { ...s, removeFillers: false };
    return { text: processText(cleaned, post, tone, ctx, category), usedLLM: true, llmRejected: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// MARK: FormatPolicy

const correctionCues = ['vagyis', 'mármint', 'illetve', 'helyesbítek', 'bocsánat', 'nem is', 'várj', 'inkább', 'jobban mondva',
  'i mean', 'actually', 'scratch that', 'sorry', 'no wait', 'rather'];
const listCues = ['először', 'másodszor', 'harmadszor', 'egyrészt', 'pontok', 'lista', 'egyes', 'kettes', 'first', 'second', 'third',
  'bullet', 'számozott', 'új sor', 'új bekezdés', 'new line', 'new paragraph'];
export const shortWordLimit = 12;

export function needsLLM(raw: string): boolean {
  const n = textWordCount(raw);
  if (n <= 3) return false;
  if (n > shortWordLimit) return true;
  // Swift: every character that is not a letter, number or space becomes a space, then whitespace collapses.
  const tokens: string[] = [];
  let cur = '';
  for (const c of chars(raw.toLowerCase())) {
    if (isLetter(c) || isNumber(c)) cur += c;
    else if (cur) {
      tokens.push(cur);
      cur = '';
    }
  }
  if (cur) tokens.push(cur);
  const norm = ' ' + tokens.join(' ') + ' ';
  if ([...correctionCues, ...listCues].some((c) => norm.includes(` ${c} `))) return true;
  for (let i = 1; i < tokens.length; i++) if (tokens[i] === tokens[i - 1]) return true;
  if (tokens.some((t) => ['öhm', 'ömm', 'hmm', 'izé', 'um', 'uh', 'ö', 'öö'].includes(t))) return true;
  const hasPunct = /[.?!,]/.test(raw);
  return !hasPunct && n > 8;
}

// MARK: LLMGuard

const contentStems = (s: string) => words(s).filter((w) => chars(w).length >= 4).map((w) => chars(w).slice(0, 4).join(''));

export function llmAccept(raw: string, local: string, output: string): boolean {
  const out = trimWSNL(output);
  if (!out) return false;
  const rw = Math.max(1, textWordCount(local));
  const ow = textWordCount(out);
  const lo = rw * 0.3 - 2;
  const hi = rw * 1.8 + 3;
  if (ow < lo || ow > hi) return false;
  const src = new Set(contentStems(raw + ' ' + local));
  const dst = contentStems(out);
  if (dst.length) {
    const novel = dst.filter((x) => !src.has(x)).length;
    if (novel / dst.length > 0.4) return false;
  }
  const srcStems = new Set(contentStems(local));
  if (srcStems.size) {
    const dset = new Set(dst);
    let kept = 0;
    for (const x of srcStems) if (dset.has(x)) kept++;
    if (kept / srcStems.size < 0.6) return false;
  }
  if (local.includes('?') && !out.includes('?')) return false;
  return true;
}

// categoryForBundle lives in pipeline.ts

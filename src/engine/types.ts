// Shared engine types — mirrors business-flow-mac Sources/BNFlowCore/Models.swift (mobile-relevant subset).

export type DictationLanguage = 'auto' | 'hu' | 'en';
export const languageLabels: Record<DictationLanguage, string> = {
  auto: 'Automatikus (magyar + angol)',
  hu: 'Magyar',
  en: 'Angol',
};
export const languageCodes = (l: DictationLanguage): string[] => (l === 'auto' ? ['hu', 'en'] : [l]);

export type StyleTone = 'formal' | 'casual' | 'veryCasual';
export const toneLabels: Record<StyleTone, string> = { formal: 'Formális', casual: 'Laza', veryCasual: 'Nagyon laza' };
export const toneExamples: Record<StyleTone, string> = {
  formal: 'Szia! Holnap 10-kor tudok jönni, ha neked is jó.',
  casual: 'Szia! Holnap 10-kor tudok jönni, ha neked is jó',
  veryCasual: 'szia holnap 10-kor tudok jönni ha neked is jó',
};

export type AppCategory = 'personal' | 'work' | 'email' | 'other';
export const categoryLabels: Record<AppCategory, string> = {
  personal: 'Személyes üzenetek',
  work: 'Munkahelyi üzenetek',
  email: 'E-mail',
  other: 'Minden más',
};
export const categoryDetails: Record<AppCategory, string> = {
  personal: 'Üzenetek, WhatsApp, Messenger, Telegram, Signal, Viber',
  work: 'Slack, Teams, Discord, Linear, Notion',
  email: 'Mail, Gmail, Outlook, Spark',
  other: 'Minden egyéb alkalmazás',
};

export interface DictionaryEntry {
  id: string;
  term: string;
  heardAs: string[];
  autoLearned: boolean;
}
export interface Snippet {
  id: string;
  trigger: string;
  expansion: string;
}
export interface PolishPreset {
  id: string;
  name: string;
  prompt: string;
  builtIn: boolean;
}

export const builtInPolishPresets: PolishPreset[] = [
  { id: 'clean', name: 'Tisztázás', prompt: 'Javítsd a nyelvtant, a helyesírást és az írásjeleket, simítsd a fogalmazást, de a jelentést, a hangnemet és a nyelvet tartsd meg.', builtIn: true },
  { id: 'concise', name: 'Tömörítés', prompt: 'Fogalmazd meg rövidebben és lényegretörőbben, minden fontos információ maradjon meg.', builtIn: true },
  { id: 'formal', name: 'Hivatalos', prompt: 'Írd át udvarias, professzionális, üzleti hangnemre.', builtIn: true },
  { id: 'friendly', name: 'Barátságos', prompt: 'Írd át barátságos, közvetlen, de igényes hangnemre.', builtIn: true },
  { id: 'bullets', name: 'Pontokba szedés', prompt: 'Szedd tömör, áttekinthető felsorolásba (gondolatjeles pontok).', builtIn: true },
  { id: 'to-en', name: 'Angolra fordítás', prompt: 'Fordítsd természetes, igényes angolra.', builtIn: true },
  { id: 'to-hu', name: 'Magyarra fordítás', prompt: 'Fordítsd természetes, igényes magyarra.', builtIn: true },
];

export type HistoryKind = 'dictation' | 'polish';
/** success: text ready. failed: network/API/key. interrupted: cut off before a finished transcript. empty: no speech came back. missed: text exists but never appeared in the field. */
export type HistoryStatus = 'success' | 'failed' | 'interrupted' | 'empty' | 'missed';
/** app: shown in the app. pending: keyboard has not confirmed insertion. landed: the field accepted it. missed: the field never showed it. */
export type HistoryDelivery = 'app' | 'pending' | 'landed' | 'missed';
export interface HistoryItem {
  id: string;
  date: number; // ms epoch
  text: string;
  rawText: string;
  category: AppCategory;
  durationSeconds: number;
  kind: HistoryKind;
  status?: HistoryStatus;
  /** Short Hungarian explanation when the attempt did not fully succeed. */
  reason?: string;
  /** Saved audio file (on device, for retry). Absent after a successful transcription. */
  audioUri?: string;
  /** Keyboard command id, so an insert acknowledgement can find this row. */
  insertId?: string;
  delivery?: HistoryDelivery;
  /** Same text as `reason`. Kept so older rows and screens still read it. */
  error?: string;
}

export type HistoryRetention = 'forever' | 'days30' | 'days7' | 'never';
export const retentionLabels: Record<HistoryRetention, string> = { forever: 'Mindig', days30: '30 nap', days7: '7 nap', never: 'Ne mentsen' };
export const retentionMaxAgeMs = (r: HistoryRetention): number | null =>
  r === 'forever' ? null : r === 'days30' ? 30 * 86400e3 : r === 'days7' ? 7 * 86400e3 : 0;

/** Wispr-style "Disable Flow after": how long the background mic session stays warm after the last dictation. */
export type SessionTimeout = 'never' | 'h1' | 'm15' | 'm5' | 'immediately';
export const sessionTimeoutLabels: Record<SessionTimeout, string> = {
  never: 'Soha',
  h1: '1 óra',
  m15: '15 perc',
  m5: '5 perc',
  immediately: 'Azonnal',
};
export const sessionTimeoutMs = (t: SessionTimeout): number | null =>
  t === 'never' ? null : t === 'h1' ? 3600e3 : t === 'm15' ? 900e3 : t === 'm5' ? 300e3 : 0;

export interface AppSettings {
  language: DictationLanguage;
  styles: Record<AppCategory, StyleTone>;
  /** Mobile has no foreground-app detection: the keyboard sends the category picked on its style chip. */
  defaultCategory: AppCategory;
  dictionary: DictionaryEntry[];
  snippets: Snippet[];
  customPolish: PolishPreset[];
  defaultPolishID: string;
  smartFormatting: boolean;
  removeFillers: boolean;
  voiceCommands: boolean;
  haptics: boolean;
  /** Start/stop cues — off by default (0.2.0, like Mac 0.3.1). */
  sounds: boolean;
  /** Cue volume 0…1 (default very quiet). */
  soundVolume: number;
  /** Settings schema version; < 2 migrates sounds + haptics to silent once. */
  settingsVersion: number;
  retention: HistoryRetention;
  sessionTimeout: SessionTimeout;
  transcriptionModel: string;
  fallbackTranscriptionModel: string;
  chatModel: string;
  fallbackChatModel: string;
  /** 0.3.0 multi-provider BYOK. */
  transcriptionProvider: 'openai' | 'gemini';
  chatProviderId: 'openai' | 'anthropic' | 'gemini';
  providerFallback: boolean;
  /** Call notes: separate speakers from the audio (OpenAI diarization model) when an OpenAI key exists. */
  callDiarize: boolean;
  claudeModel: string;
  geminiChatModel: string;
  geminiTranscriptionModel: string;
  onboardingDone: boolean;
  contextAwareness: boolean;
  autoLearnDictionary: boolean;
  llmTimeoutSeconds: number;
}

let idCounter = 0;
export const newId = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const entry = (term: string, heardAs: string[] = [], autoLearned = false): DictionaryEntry => ({ id: newId(), term, heardAs, autoLearned });

export const SETTINGS_VERSION = 2;

export function defaultSettings(): AppSettings {
  return {
    language: 'auto',
    styles: { personal: 'casual', work: 'casual', email: 'formal', other: 'formal' },
    defaultCategory: 'personal',
    dictionary: [entry('Business Native'), entry('businessnative.hu')],
    snippets: [],
    customPolish: [],
    defaultPolishID: 'clean',
    smartFormatting: true,
    removeFillers: true,
    voiceCommands: true,
    haptics: false,
    sounds: false,
    soundVolume: 0.15,
    settingsVersion: SETTINGS_VERSION,
    retention: 'forever',
    sessionTimeout: 'm5',
    transcriptionModel: 'gpt-transcribe',
    fallbackTranscriptionModel: 'gpt-4o-transcribe',
    chatModel: 'gpt-5.6-luna',
    fallbackChatModel: 'gpt-4.1-mini',
    transcriptionProvider: 'openai',
    chatProviderId: 'openai',
    providerFallback: true,
    callDiarize: true,
    claudeModel: 'claude-haiku-5-5',
    geminiChatModel: 'gemini-3.5-flash-lite',
    geminiTranscriptionModel: 'gemini-3.5-flash-lite',
    onboardingDone: false,
    contextAwareness: true,
    autoLearnDictionary: true,
    llmTimeoutSeconds: 8,
  };
}

/** Tolerant merge for stored settings (new fields fall back to defaults). */
export function mergeSettings(stored: Partial<AppSettings> | null | undefined): AppSettings {
  const d = defaultSettings();
  if (!stored || typeof stored !== 'object') return d;
  const m: AppSettings = { ...d, ...stored, styles: { ...d.styles, ...(stored.styles ?? {}) } };
  m.soundVolume = Math.min(1, Math.max(0, Number(m.soundVolume) || 0));
  if ((stored.settingsVersion ?? 1) < SETTINGS_VERSION) {
    // 0.2.0: older installs become silent once (no haptics, no cues); later choices are kept.
    m.haptics = false;
    m.sounds = false;
    m.soundVolume = d.soundVolume;
  }
  if (m.transcriptionProvider !== 'openai' && m.transcriptionProvider !== 'gemini') m.transcriptionProvider = 'openai';
  if (!['openai', 'anthropic', 'gemini'].includes(m.chatProviderId)) m.chatProviderId = 'openai';
  m.settingsVersion = SETTINGS_VERSION;
  return m;
}

export const allPolishPresets = (s: AppSettings) => [...builtInPolishPresets, ...s.customPolish];
export const toneFor = (s: AppSettings, c: AppCategory): StyleTone => s.styles[c] ?? 'formal';

export interface DictationContext {
  before: string;
  after: string;
  appName: string;
  isSecure: boolean;
}
export const emptyContext: DictationContext = { before: '', after: '', appName: '', isSecure: false };


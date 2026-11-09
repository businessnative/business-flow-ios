// TypeScript port of business-flow-mac Sources/BNFlowCore/TextPipeline.swift.
import { chars, count, eqCI, isLetter, isNumber, isUpper, isWhitespace, last, stripDiacritics, trimPunct, trimPunctWSNL, trimWS, trimWSNL } from './chars';
import { escapeRe, replaceAll, replaceWith, test } from './regex';
import * as R from './rules';
import { defaultSettings, emptyContext, type AppCategory, type AppSettings, type DictationContext, type DictionaryEntry, type Snippet, type StyleTone } from './types';

// ICU \b (Unicode aware) equivalents
const WB_START = String.raw`(?<![\p{L}\p{N}_])`;
const WB_END = String.raw`(?![\p{L}\p{N}_])`;

// MARK: fillers

const fillerPattern = String.raw`(?i)(?<![\p{L}\p{N}])(ö+h*m*|e+h*m+|hm+|mhm|u+h*m*|u+m+|e+r+m+|ööö+|izé|izéé+)(?![\p{L}\p{N}])[,.…]*\s*`;
const discourse = '(?:szóval|hát|nos|na|so|well|okay|oké|like)';
const MARK = '\u0001';
const noCommaAfter = new Set(['should', 'would', 'could', 'can', 'will', 'must', 'to', 'the', 'a', 'an', 'of', 'and', 'is', 'are',
  'kell', 'fog', 'fogok', 'fogom', 'akarok', 'az', 'egy', 'és', 'hogy', 'meg', 'el', 'nem']);

export function removeFillers(text: string): string {
  let s = replaceWith(text, fillerPattern, (m) => (m.groups[0].includes(',') ? MARK + ',' : MARK));
  if (!s.includes(MARK)) return tidy(s);
  s = replaceAll(s, '(?i)^(' + MARK + String.raw`[,\s]*)*` + discourse + String.raw`[,\s]*` + MARK, MARK);
  s = replaceAll(s, '(?i)^' + MARK + String.raw`[,\s]*` + discourse + String.raw`(?:[,\s]+|$)`, MARK);
  s = replaceWith(s, String.raw`(,?)\s*` + MARK + String.raw`([,.…\s\x{01}]*)`, (m, src) => {
    const before = src.slice(0, m.index);
    const hadBoth = m.groups[1] !== '' && m.groups[2].includes(',');
    const parts = before.split(/[,.;:!?\n]/);
    const chunk = parts[parts.length - 1] ?? '';
    const ws = R.words(chunk);
    const prev = (ws[ws.length - 1] ?? '').toLowerCase();
    if (hadBoth && ws.length >= 3 && !noCommaAfter.has(prev)) return ', ';
    return ' ';
  });
  return tidy(s);
}

export function tidy(text: string): string {
  let s = text.replace(/\s{2,}/g, ' ');
  s = s.replace(/\s+([,.!?;:])/g, '$1');
  s = s.replace(/^[,;:\s]+/, '');
  return trimWS(s);
}

// MARK: voice commands

const commandRules: [string, string][] = [
  [String.raw`(?i),?\s*` + WB_START + '(új bekezdés|new paragraph)' + WB_END + String.raw`[,.]?\s*`, '\n\n'],
  [String.raw`(?i),?\s*` + WB_START + '(új sor|new line)' + WB_END + String.raw`[,.]?\s*`, '\n'],
];
const punctuationRules: [string, string][] = [
  [String.raw`(?i)\s*[,.]?\s*` + WB_START + '(kérdőjel|question mark)' + WB_END + '[,.]?', '?'],
  [String.raw`(?i)\s*[,.]?\s*` + WB_START + '(felkiáltójel|exclamation (?:mark|point))' + WB_END + '[,.]?', '!'],
  [String.raw`(?i)\s*[,.]?\s*` + WB_START + '(pontosvessző|semicolon)' + WB_END + '[,.]?', ';'],
  [String.raw`(?i)\s*[,.]?\s*` + WB_START + '(kettőspont)' + WB_END + '[,.]?', ':'],
  [String.raw`(?i)\s*,?\s*` + WB_START + '(vessző|comma)' + WB_END + ',?', ','],
];

export function applySpokenPunctuation(text: string): string {
  let s = text;
  let hit = false;
  for (const [p, r] of punctuationRules) {
    if (test(s, p)) {
      s = replaceWith(s, p, () => r);
      hit = true;
    }
  }
  if (!hit) return text;
  s = replaceAll(s, String.raw`([?!:;,])(?=\p{L})`, '$1 ');
  s = s.replace(/^[\s?!:;,]+/, '');
  let out = '';
  let cap = false;
  for (const ch of chars(s)) {
    if (cap && isLetter(ch)) {
      out += ch.toUpperCase();
      cap = false;
      continue;
    }
    if (ch === '?' || ch === '!') cap = true;
    else if (!isWhitespace(ch)) cap = false;
    out += ch;
  }
  return out.replace(/([?!:;,])\1+/g, '$1');
}

export function applyVoiceCommands(text: string): string {
  let s = text;
  for (const [p, r] of commandRules) s = replaceWith(s, p, () => r);
  s = applySpokenPunctuation(s);
  s = capitalizeAfterNewlines(s);
  return trimWS(s);
}

function capitalizeAfterNewlines(s: string): string {
  let out = '';
  let cap = false;
  for (const ch of chars(s)) {
    if (ch === '\n') {
      cap = true;
      out += ch;
      continue;
    }
    if (cap && isLetter(ch)) {
      out += ch.toUpperCase();
      cap = false;
      continue;
    }
    if (cap && !isWhitespace(ch)) cap = false;
    out += ch;
  }
  return out;
}

// MARK: dictionary

const huSuffixes = ['jából', 'jéből', 'jának', 'jének', 'ként', 'ból', 'ből', 'ról', 'ről', 'tól', 'től', 'nak', 'nek', 'val', 'vel',
  'hoz', 'hez', 'höz', 'nál', 'nél', 'ban', 'ben', 'ért', 'ig', 'ba', 'be', 'ra', 're', 'on', 'en', 'ön', 'ot', 'et',
  'öt', 'at', 'ék', 'os', 'es', 'ös', 'ja', 'je', 'é', 't', 'n', 's'];
const suffixGroup = String.raw`(-\p{Ll}{1,12}|` + huSuffixes.join('|') + ')?';

export function applyDictionary(text: string, entries: DictionaryEntry[]): string {
  let s = text;
  for (const e of entries) {
    const term = trimWS(e.term);
    if (!term) continue;
    const variants = e.heardAs.map(trimWS).filter((x) => x);
    variants.push(term);
    const suffixOK = count(term) >= 4 && isLetter(last(term));
    for (const v of variants) {
      const ev = escapeRe(v);
      if (suffixOK) {
        const lv = last(v);
        const lt = last(term);
        if (lv && 'aeAE'.includes(lv) && lt && 'aeAE'.includes(lt)) {
          const stemV = escapeRe(chars(v).slice(0, -1).join(''));
          const stemT = chars(term).slice(0, -1).join('');
          const p = String.raw`(?i)(?<![\p{L}\p{N}])` + stemV + '([áé])' + suffixGroup + String.raw`(?![\p{L}\p{N}])`;
          s = replaceWith(s, p, (m) => stemT + m.groups[1].toLowerCase() + m.groups[2]);
        }
        const p = String.raw`(?i)(?<![\p{L}\p{N}])` + ev + suffixGroup + String.raw`(?![\p{L}\p{N}])`;
        s = replaceWith(s, p, (m) => term + m.groups[1]);
      } else {
        const p = String.raw`(?i)(?<![\p{L}\p{N}])` + ev + String.raw`(?![\p{L}\p{N}])`;
        s = replaceWith(s, p, () => term);
      }
    }
  }
  return s;
}

// MARK: snippets

export function applySnippets(text: string, snippets: Snippet[]): string {
  let s = text;
  for (const sn of snippets) {
    const trig = trimWSNL(sn.trigger);
    if (!trig) continue;
    let bare = trimPunctWSNL(s);
    bare = replaceAll(bare, String.raw`(?i)^(az én|a|az|the|my|egy)\s+`, '');
    if (stripDiacritics(bare).toLowerCase() === stripDiacritics(trig).toLowerCase()) return sn.expansion;
    const ws = trig.split(' ').filter((x) => x).map(escapeRe);
    const p = String.raw`(?i)(?<![\p{L}\p{N}])` + ws.join(String.raw`[\s,-]*`) + String.raw`(?![\p{L}\p{N}])[.,!?]?`;
    s = replaceWith(s, p, () => sn.expansion);
  }
  return s;
}

// MARK: tone

export function applyTone(text: string, tone: StyleTone, protectedTerms: string[] = []): string {
  let s = trimWSNL(text);
  if (!s) return s;
  switch (tone) {
    case 'formal': {
      s = uppercaseFirst(s);
      const l = last(s);
      if (l && (isLetter(l) || isNumber(l))) s += '.';
      break;
    }
    case 'casual':
      s = uppercaseFirst(s);
      if (s.endsWith('.') && !s.endsWith('...')) s = s.slice(0, -1);
      break;
    case 'veryCasual':
      s = lowercaseSentenceStarts(s, protectedTerms);
      if (s.endsWith('.') && !s.endsWith('...')) s = s.slice(0, -1);
      s = replaceAll(s, String.raw`(?<=[\p{L}\p{N}]),(?=\s)`, '');
      s = s.replace(/\.(\s+)/g, '$1');
      break;
  }
  return s;
}

export const uppercaseFirst = R.capFirst;

function lowercaseSentenceStarts(s: string, protectedTerms: string[]): string {
  const ws = s.split(' ');
  const out: string[] = [];
  let start = true;
  for (const w of ws) {
    let word = w;
    const f = chars(word)[0];
    if (start && f && isUpper(f)) {
      const core = trimPunct(word);
      const isAcronym = count(core) > 1 && core === core.toUpperCase();
      const isProtected = protectedTerms.some((p) => eqCI(p, core));
      if (!isAcronym && !isProtected) word = f.toLowerCase() + chars(word).slice(1).join('');
    }
    if (word) {
      const l = last(word);
      start = !!l && '.!?\n'.includes(l);
    }
    out.push(word);
  }
  return out.join(' ');
}

export function needsLeadingSpace(previous: string | undefined, text: string): boolean {
  const f = chars(text)[0];
  if (!previous || !f) return false;
  if (isWhitespace(previous)) return false;
  if ('([{"\'„«/-'.includes(previous)) return false;
  if ('.,!?;:)]}…'.includes(f)) return false;
  return true;
}

// MARK: full local pipeline

let pipelineWarmed = false;
/** Compiles the static cleanup patterns once, off the first stop-to-text path. The fixture is synthetic and is not logged. */
export function prewarmTextPipeline(): void {
  if (pipelineWarmed) return;
  pipelineWarmed = true;
  const s = defaultSettings();
  const raw = 'öhm holnap hogy kész a számla, mert az ügyfél aki írt még nem fizetett. Mikor küldöd el?';
  processText(raw, s, 'formal', emptyContext, 'other');
  processText('kedves anna köszönöm a választ üdvözlettel dorottya', s, 'formal', emptyContext, 'email');
}

export function processText(
  raw: string,
  settings: AppSettings,
  tone: StyleTone,
  context: DictationContext = emptyContext,
  category: AppCategory = 'other',
): string {
  let s = trimWSNL(raw);
  if (!s) return s;
  const protectedTerms = settings.dictionary.map((d) => d.term);
  if (settings.removeFillers) s = removeFillers(s);
  if (settings.voiceCommands) s = applyVoiceCommands(s);
  s = R.applyBacktrack(s);
  s = applyDictionary(s, settings.dictionary);
  s = applySnippets(s, settings.snippets);
  if (settings.snippets.some((x) => x.expansion === s)) return s;
  s = R.applySpokenAddresses(s);
  s = R.restoreAccents(s);
  const lang = R.language(s);
  if (lang === 'hu' || (lang === 'unknown' && settings.language === 'hu')) {
    s = R.applyHungarianCommas(s);
    s = R.applyHungarianQuotes(s);
  }
  s = R.applyAcronyms(s);
  if (settings.voiceCommands) s = R.applyLists(s);
  const mail = category === 'email' ? R.layoutEmail(s, lang) : null;
  if (mail !== null) {
    s = mail;
  } else {
    s = R.applyGreetingComma(s);
    if (tone !== 'veryCasual') s = R.applyQuestionMark(s);
    if (R.isList(s) && tone !== 'veryCasual') s = uppercaseFirst(trimWSNL(s));
    else s = applyTone(s, tone, protectedTerms);
  }
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/,{2,}/g, ',');
  s = R.applyContextNames(s, context);
  s = R.fitToContext(s, context, protectedTerms);
  return s;
}

/** Mac bundle ids used by the shared eval suite → category (mobile picks the category on the keyboard instead). */
const bundleMap: Record<string, AppCategory> = {
  'com.apple.MobileSMS': 'personal', 'net.whatsapp.WhatsApp': 'personal', 'desktop.WhatsApp': 'personal',
  'ru.keepcoder.Telegram': 'personal', 'org.telegram.desktop': 'personal', 'com.facebook.archon': 'personal',
  'com.facebook.archon.developerID': 'personal', 'org.whispersystems.signal-desktop': 'personal', 'com.viber.osx': 'personal',
  'com.tinyspeck.slackmacgap': 'work', 'com.microsoft.teams': 'work', 'com.microsoft.teams2': 'work',
  'com.hnc.Discord': 'work', 'com.linear': 'work', 'notion.id': 'work', 'com.figma.Desktop': 'work', 'com.clickup.desktop-app': 'work',
  'com.apple.mail': 'email', 'com.microsoft.Outlook': 'email', 'com.readdle.smartemail-Mac': 'email',
  'com.superhuman.electron': 'email', 'com.airmail.Airmail5': 'email', 'it.bloop.airmail2': 'email',
  // iOS
  'com.google.Gmail': 'email', 'com.tinyspeck.chatlyio': 'work', 'net.whatsapp.WhatsApp.ios': 'personal',
};
const browsers = new Set(['com.google.Chrome', 'com.google.Chrome.canary', 'com.apple.Safari', 'com.apple.SafariTechnologyPreview',
  'company.thebrowser.Browser', 'company.thebrowser.dia', 'org.mozilla.firefox', 'com.microsoft.edgemac',
  'com.brave.Browser', 'com.operasoftware.Opera', 'com.vivaldi.Vivaldi', 'ai.perplexity.comet', 'app.zen-browser.zen']);
const siteRules: [AppCategory, string[]][] = [
  ['email', ['gmail', 'outlook', 'proton mail', 'yahoo mail', 'superhuman', 'fastmail', 'icloud mail', 'freemail', 'citromail']],
  ['work', ['slack', 'microsoft teams', 'discord', 'notion', 'linear', 'jira', 'clickup', 'github', 'asana', 'trello', 'google docs',
    'google dokumentumok', 'figma', 'confluence', 'monday.com', 'airtable']],
  ['personal', ['whatsapp', 'messenger', 'telegram', 'instagram', 'facebook', 'signal']],
];
export function categoryForBundle(id: string | null | undefined, windowTitle?: string | null): AppCategory {
  const base = (id && bundleMap[id]) || 'other';
  const t = windowTitle?.toLowerCase();
  if (base !== 'other' || !id || !browsers.has(id) || !t) return base;
  for (const [cat, keys] of siteRules) if (keys.some((k) => t.includes(k))) return cat;
  return base;
}

export const textWordCount = (s: string) => s.split(/\s+/).filter((w) => chars(w).some((c) => isLetter(c) || isNumber(c))).length;


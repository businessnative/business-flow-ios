// TypeScript port of business-flow-mac Sources/BNFlowCore/TextRules.swift (Business Flow desktop).
// Local, deterministic Hungarian-first rules: backtracking, lists, commas, question marks, quotes,
// accents, spoken addresses, acronyms, e-mail layout, cursor context. No network.
import { chars, count, eqCI, first, isLetter, isLower, isNumber, isUpper, last, trimBy, trimPunct, trimPunctWSNL, trimWS } from './chars';
import { ci, firstMatch, matches, replaceAll, replaceWith, test } from './regex';
import type { DictationContext } from './types';

export type Lang = 'hu' | 'en' | 'unknown';

// MARK: helpers

const isWordChar = (c: string) => isLetter(c) || isNumber(c) || c === "'" || c === '-';

export function words(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const c of chars(s.toLowerCase())) {
    if (isWordChar(c)) cur += c;
    else if (cur) {
      out.push(cur);
      cur = '';
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Last token of `words(s)`, without tokenising the whole prefix. Same character classes and case folding. */
export function lastWord(s: string): string {
  const lower = s.toLowerCase();
  let i = lower.length;
  while (i > 0) {
    const w = codePointWidthAt(lower, i);
    i -= w;
    const ch = lower.slice(i, i + w);
    if (!isWordChar(ch)) continue;
    const end = i + w;
    while (i > 0) {
      const w2 = codePointWidthAt(lower, i);
      const ch2 = lower.slice(i - w2, i);
      if (!isWordChar(ch2)) break;
      i -= w2;
    }
    return lower.slice(i, end);
  }
  return '';
}

function codePointWidthAt(s: string, end: number): number {
  if (end >= 2) {
    const cu = s.charCodeAt(end - 1);
    if (cu >= 0xdc00 && cu <= 0xdfff && s.charCodeAt(end - 2) >= 0xd800 && s.charCodeAt(end - 2) <= 0xdbff) return 2;
  }
  return 1;
}

export function lev(a: string, b: string): number {
  const x = chars(a);
  const y = chars(b);
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

export function capFirst(s: string): string {
  const a = chars(s);
  const i = a.findIndex((c) => isLetter(c));
  if (i < 0) return s;
  a[i] = a[i].toUpperCase();
  return a.join('');
}

// MARK: language

export const huWords = new Set(['az', 'egy', 'és', 'es', 'hogy', 'nem', 'is', 'meg', 'de', 'ha', 'már', 'még', 'csak', 'ez', 'ezt', 'azt',
  'van', 'lesz', 'kell', 'holnap', 'ma', 'szia', 'kérlek', 'köszönöm', 'mert', 'vagy', 'mi', 'ki', 'mikor',
  'hol', 'igen', 'itt', 'ott', 'majd', 'akkor', 'nagyon', 'jó', 'nekem', 'neked', 'kedves', 'aki', 'ami']);
const enWords = new Set(['the', 'and', 'to', 'of', 'is', 'i', 'you', 'it', 'for', 'we', 'that', 'this', 'with', 'on', 'are', 'be',
  'will', 'can', 'please', 'thanks', "let's", 'my', 'your', 'so', 'just', 'what', 'when', 'have', 'our']);

export function language(s: string): Lang {
  const lower = s.toLowerCase();
  let hu = 0;
  let en = 0;
  if (/[őű]/.test(lower)) hu += 3;
  if (/[áéíóöúü]/.test(lower)) hu += 2;
  for (const w of words(lower)) {
    if (huWords.has(w)) hu += 1;
    if (enWords.has(w)) en += 1;
  }
  if (hu > en) return 'hu';
  if (en > hu) return 'en';
  return 'unknown';
}

// MARK: backtracking

const backtrackRE = String.raw`(?i)\s*,\s*(?:nem\s*,?\s*inkább|nem\s*,?\s*hanem|bocsánat|bocsi|bocs|pardon|javítok|helyesbítek|akarom mondani|actually\s*,?\s*no|no\s*,?\s*wait|sorry\s*,?\s*i mean|or rather)\s*[,:]?\s+`;
const scratchSentences = new Set(['ezt töröld', 'töröld ezt', 'töröld az előzőt', 'az előzőt töröld', 'scratch that', 'delete that', 'delete the last sentence']);
const numberStems = ['tíz', 'tizen', 'húsz', 'huszon', 'harminc', 'negyven', 'ötven', 'hatvan', 'hetven', 'nyolcvan', 'kilencven', 'száz',
  'ezer', 'millió', 'kettő', 'három', 'négy', 'nyolc', 'kilenc', 'eleven', 'twelve', 'twenty', 'thirty', 'forty',
  'fifty', 'hundred', 'thousand', 'million'];
const numberExact = new Set(['két', 'öt', 'hat', 'hét', 'ötkor', 'hatkor', 'hétkor', 'egykor', 'kettőkor', 'one', 'two', 'three',
  'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']);

function isNumberWord(w: string): boolean {
  const l = trimPunct(w.toLowerCase());
  if (!l) return false;
  if (isNumber(first(l))) return true;
  if (numberExact.has(l)) return true;
  return numberStems.some((p) => l.startsWith(p));
}
const isCapitalized = (w: string) => isUpper(first(w));

export function applyBacktrack(text: string): string {
  let s = removeScratchedSentences(text);
  for (let n = 0; n < 5; n++) {
    const m = firstMatch(s, backtrackRE);
    if (!m) break;
    const head = s.slice(0, m.index);
    const tail = s.slice(m.index + m.length);
    let boundary = 0;
    const bm = matches(head, String.raw`[.!?\n]\s*`);
    if (bm.length) {
      // Swift: range(of:, .backwards) — last occurrence, longest at that start
      const lastStart = bm[bm.length - 1];
      boundary = lastStart.index + lastStart.length;
    }
    const prior = head.slice(0, boundary);
    const sentence = head.slice(boundary).split(' ').filter((x) => x);
    const y0 = tail.split(' ').filter((x) => x)[0] ?? '';
    if (!sentence.length || !y0) break;
    let drop = sentence.length - 1;
    const lastIdx = (pred: (i: number) => boolean) => {
      for (let i = sentence.length - 1; i >= 0; i--) if (pred(i)) return i;
      return -1;
    };
    const rNum = isNumberWord(y0) ? lastIdx((i) => isNumberWord(sentence[i])) : -1;
    const rCap = isCapitalized(y0) ? lastIdx((i) => i > 0 && isCapitalized(sentence[i])) : -1;
    if (isNumberWord(y0) && rNum >= 0) {
      let k = rNum;
      while (k > 0 && isNumberWord(sentence[k - 1])) k--;
      drop = k;
    } else if (isCapitalized(y0) && rCap >= 0) {
      drop = rCap;
    } else {
      const sufA = chars(trimPunct(y0.toLowerCase()));
      const suf = sufA.slice(-3).join('');
      if (sufA.length >= 3) {
        const r = lastIdx((i) => i > 0 && sentence[i].toLowerCase().endsWith(suf));
        if (r >= 0) drop = r;
      }
    }
    if (drop === 0 && sentence.length > 1) drop = sentence.length - 1;
    sentence.splice(drop);
    let fixedTail = tail;
    if (!sentence.length) fixedTail = capFirst(tail);
    s = prior + [...sentence, fixedTail].join(' ');
  }
  return s;
}

function sentences(s: string): string[] {
  return matches(s, String.raw`[^.!?\n]+[.!?]*\s*|\n+\s*|[.!?]+\s*`).map((m) => m.groups[0]);
}

function removeScratchedSentences(s: string): string {
  const parts = sentences(s);
  let changed = false;
  let i = 0;
  while (i < parts.length) {
    const core = trimPunctWSNL(parts[i].toLowerCase());
    if (scratchSentences.has(core)) {
      parts.splice(i, 1);
      changed = true;
      if (i > 0) {
        parts.splice(i - 1, 1);
        i -= 1;
      }
      continue;
    }
    i++;
  }
  return changed ? trimWS(parts.join('')) : s;
}

// MARK: lists

const ordinals: string[][] = [
  ['első', 'elsőként', 'egyrészt', 'first', 'firstly'], ['második', 'másodszor', 'másodikként', 'second', 'secondly'],
  ['harmadik', 'harmadszor', 'harmadikként', 'third', 'thirdly'], ['negyedik', 'negyedszer', 'fourth'], ['ötödik', 'ötödször', 'fifth'],
  ['hatodik', 'sixth'], ['hetedik', 'seventh'],
];
const ordinalRE = (() => {
  const all = ordinals.flat().sort((a, b) => count(b) - count(a)).join('|');
  return String.raw`(?i)(?<![\p{L}\p{N}])(` + all + String.raw`)(?![\p{L}\p{N}])[,:]?`;
})();
const articles = new Set(['a', 'az', 'the', 'my', 'our', 'your', 'egy', 'minden', 'every']);
const ordinalIndex = (w: string) => {
  const i = ordinals.findIndex((o) => o.includes(w.toLowerCase()));
  return i < 0 ? null : i;
};

export function applyLists(text: string): string {
  if (text.includes('\n')) return text;
  const ms = matches(text, ordinalRE);
  let seq: typeof ms = [];
  for (const m of ms) {
    const k = ordinalIndex(m.groups[1]);
    if (k === null) continue;
    if (k === seq.length) {
      if (k === 0) {
        const prev = lastWord(text.slice(0, m.index));
        if (articles.has(prev)) continue;
      }
      seq.push(m);
    } else if (k === 0) seq = [m];
  }
  if (seq.length < 2) return text;
  let intro = trimWS(text.slice(0, seq[0].index));
  intro = replaceAll(intro, String.raw`[,;:\s]+$`, '');
  const items: string[] = [];
  for (let i = 0; i < seq.length; i++) {
    const m = seq[i];
    const start = m.index + m.length;
    const end = i + 1 < seq.length ? seq[i + 1].index : text.length;
    let it = trimWS(text.slice(start, end));
    it = replaceAll(it, String.raw`(?i)[\s,;]+(és|and|meg|valamint|and then|aztán)$`, '');
    it = trimBy(it, (c) => ' ,;:.\t'.includes(c));
    it = replaceAll(it, String.raw`(?i)^(the|a|an|az|a)\s+(?=\p{L})`, '');
    if (!it) return text;
    items.push(capFirst(it));
  }
  const body = items.map((x, i) => `${i + 1}. ${x}`).join('\n');
  return intro ? intro + ':\n' + body : body;
}

export function isList(s: string): boolean {
  return /^\d+\. /m.test(s) && s.includes('\n');
}

// MARK: Hungarian commas, question mark, quotes

const huConjunctions = ['hogy', 'hogyha', 'mert', 'mivel', 'ha', 'de', 'hanem', 'aki', 'akit', 'akinek', 'akivel', 'akik', 'akiket',
  'ami', 'amit', 'aminek', 'amivel', 'amik', 'amiket', 'amely', 'amelyet', 'amelyek', 'amelynek', 'amikor', 'ahol',
  'ahova', 'ahová', 'ahonnan', 'ahogy', 'amíg', 'amennyiben', 'miközben', 'mielőtt', 'miután', 'mintha'];
const huNoCommaBefore = new Set(['és', 's', 'vagy', 'még', 'csak', 'de', 'hogy', 'mert', 'mint', 'akár', 'ha', 'meg', 'illetve',
  'sőt', 'hanem', 'hát', 'nem', 'persze', 'vagyis', 'azaz', 'mégpedig', 'kivéve', 'főleg', 'különösen']);
const huConjRE = String.raw`(?<=[\p{L}\p{N}])(\s+)(` + huConjunctions.join('|') + String.raw`)(?![\p{L}\p{N}])`;
const relativeStarts = ['aki', 'akit', 'akinek', 'akivel', 'akik', 'akiket', 'ami', 'amit', 'aminek', 'amivel', 'amik',
  'amiket', 'amely', 'amelyet', 'amelyek', 'amelynek'];
const mainClauseResumers = ['még', 'már', 'viszont', 'azonban', 'szintén', 'mindig', 'továbbra', 'sajnos', 'végül', 'most'];
const relClauseRE = String.raw`(?:^|(?<=[.!?]\s))((?:\p{L}+\s){1,2}\p{L}+, (?:` + relativeStarts.join('|') + String.raw`)(?:\s[\p{L}\p{N}]+){2,5}?)\s(` + mainClauseResumers.join('|') + String.raw`)(?![\p{L}])`;

export function applyHungarianCommas(text: string): string {
  let s = replaceWith(text, huConjRE, (m, src) => {
    const before = src.slice(0, m.index);
    const l = last(before);
    if (l && ',;:'.includes(l)) return null;
    const prev = lastWord(before);
    if (huNoCommaBefore.has(prev)) return null;
    return ',' + m.groups[1] + m.groups[2];
  });
  s = replaceWith(s, relClauseRE, (m) => {
    const clause = m.groups[1];
    if (clause.includes(',') && clause.split(',').length > 2) return null;
    return clause + ', ' + m.groups[2];
  });
  return s;
}

const huQuestionStarts = new Set(['mikor', 'hol', 'hogyan', 'miért', 'mi', 'mit', 'mivel', 'minek', 'ki', 'kit', 'kinek', 'kivel',
  'melyik', 'hány', 'hányan', 'hánykor', 'mennyi', 'mennyiért', 'milyen', 'hová', 'hova', 'honnan',
  'meddig', 'mióta', 'merre', 'miben', 'kié', 'tudnál', 'tudnád', 'tudnátok', 'megtennéd',
  'megnéznéd', 'ráérsz', 'ráértek', 'van', 'nincs', 'jössz', 'jöttök']);
const huPoliteQuestion = new Set(['tudnál', 'tudnád', 'tudnátok', 'tudnának', 'megtennéd', 'megnéznéd', 'elküldenéd', 'ráérsz', 'ráértek']);
const enQuestionStarts = new Set(['what', 'when', 'where', 'why', 'how', 'who', 'whom', 'which', 'whose', 'can', 'could', 'would',
  'will', 'do', 'does', 'did', 'is', 'are', 'should', 'shall', 'may', 'have', 'has', 'am', 'was', 'were']);
const greetings = new Set(['szia', 'sziasztok', 'helló', 'hello', 'hi', 'hey', 'szervusz', 'szevasz', 'csá', 'jó', 'napot', 'kedves']);

export function isQuestion(sentence: string): boolean {
  const w = words(sentence);
  while (w.length && greetings.has(w[0])) w.shift();
  const f = w[0];
  if (f === undefined) return false;
  if (w.length >= 1 && test(sentence, String.raw`(?<=\p{L})-e(?![\p{L}])`)) return true;
  if (w[w.length - 1] === 'ugye') return true;
  if (huQuestionStarts.has(f) && !(f === 'van' || f === 'nincs')) return true;
  if ((f === 'van' || f === 'nincs') && w.length <= 6 && sentence.toLowerCase().includes('valami')) return true;
  if (w.slice(0, 3).some((x) => huPoliteQuestion.has(x))) return true;
  if (enQuestionStarts.has(f) && language(sentence) !== 'hu') return true;
  return false;
}

export function applyQuestionMark(text: string): string {
  const l = last(text);
  if (!l || !(isLetter(l) || isNumber(l))) return text;
  const parts = text.split(/[.!?\n]/);
  const tailSentence = parts[parts.length - 1] ?? text;
  return isQuestion(tailSentence) ? text + '?' : text;
}

export function applyHungarianQuotes(text: string): string {
  let s = text.replace(/"([^"\n]+)"/g, '„$1”');
  s = s.replace(/“([^”\n]+)”/g, '„$1”');
  return s;
}

// MARK: accents (only in fully unaccented Hungarian text)

const accentTable: Record<string, string> = {
  koszonom: 'köszönöm', koszonjuk: 'köszönjük', koszi: 'köszi', szepen: 'szépen', valasz: 'válasz', valaszt: 'választ',
  valaszod: 'válaszod', valaszodat: 'válaszodat', es: 'és', kerlek: 'kérlek', kerem: 'kérem', udvozlettel: 'üdvözlettel',
  udv: 'üdv', igy: 'így', ugy: 'úgy', jo: 'jó', kesz: 'kész', keszen: 'készen', szamla: 'számla', szamlat: 'számlát',
  'szamlát': 'számlát', ajanlat: 'ajánlat', ajanlatot: 'ajánlatot', hetfo: 'hétfő', hetfon: 'hétfőn', csutortok: 'csütörtök',
  csutortokon: 'csütörtökön', pentek: 'péntek', penteken: 'pénteken', talalkozo: 'találkozó', megbeszeles: 'megbeszélés',
  holnaputan: 'holnapután', kosz: 'kösz', tobb: 'több', lehetoseg: 'lehetőség', ertekeles: 'értékelés', ugyfel: 'ügyfél',
  ugyfelnek: 'ügyfélnek', szerzodes: 'szerződés', szerzodest: 'szerződést', feladat: 'feladat', 'hataridő': 'határidő',
  hatarido: 'határidő', fontos: 'fontos', kerdes: 'kérdés', kerdesem: 'kérdésem', tegnap: 'tegnap', mar: 'már',
};
const accentLookup = (w: string): string | undefined => (Object.prototype.hasOwnProperty.call(accentTable, w) ? accentTable[w] : undefined);

export function restoreAccents(text: string): string {
  if (/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(text)) return text;
  const ws = words(text);
  const hits = ws.filter((w) => accentLookup(w) !== undefined && accentLookup(w) !== w).length;
  const lang = language(text);
  if (!(hits >= 2 || (hits >= 1 && lang === 'hu'))) return text;
  if (lang === 'en') return text;
  return replaceWith(text, String.raw`(?<![\p{L}\p{N}])[\p{L}]+(?![\p{L}\p{N}])`, (m) => {
    const w = m.groups[0];
    const rep = accentLookup(w.toLowerCase());
    if (rep === undefined || rep === w.toLowerCase()) return null;
    if (w === 'mar') return null; // also an English word
    return isUpper(first(w)) ? capFirst(rep) : rep;
  });
}

// MARK: spoken e-mail addresses and web addresses

const tlds = 'hu|com|net|org|io|eu|ai|dev|app|co|uk|us|me|info|biz|xyz|studio|tech|shop|online';
const emailRE = String.raw`(?i)(?<![\p{L}\p{N}@.])([\p{L}\p{N}._-]+)\s+(?:kukac|at)\s+((?:[\p{L}\p{N}-]+\s*(?:pont|dot|\.)\s*)+(?:` + tlds + String.raw`))(?![\p{L}\p{N}])`;
const domainRE = String.raw`(?i)(?<![\p{L}\p{N}@.])((?:[\p{L}\p{N}-]+\s+(?:pont|dot)\s+)+(?:` + tlds + String.raw`))(?![\p{L}\p{N}])((?:\s+(?:perjel|per|slash)\s+[\p{L}\p{N}-]+)*)`;

const collapseDomain = (s: string) => replaceAll(s, String.raw`(?i)\s*(?:pont|dot|\.)\s*`, '.').replace(/ /g, '').toLowerCase();

export function applySpokenAddresses(text: string): string {
  let s = replaceWith(text, emailRE, (m) => m.groups[1].toLowerCase() + '@' + collapseDomain(m.groups[2]));
  s = replaceWith(s, domainRE, (m) => {
    const path = replaceAll(m.groups[2], String.raw`(?i)\s+(?:perjel|per|slash)\s+`, '/');
    return collapseDomain(m.groups[1]) + path.toLowerCase();
  });
  return s;
}

// MARK: acronyms

const acronyms = ['pr', 'api', 'ui', 'ux', 'crm', 'seo', 'sem', 'kpi', 'okr', 'ceo', 'cto', 'cfo', 'coo', 'hr', 'pdf', 'url', 'mvp', 'roi',
  'b2b', 'b2c', 'saas', 'qa', 'sql', 'ai', 'sms', 'faq', 'erp', 'vpn', 'cv', 'gdpr', 'ppc', 'cta', 'sdk', 'llm'];
const acronymRE = String.raw`(?<![\p{L}\p{N}])(` + acronyms.join('|') + String.raw`|Pr|Api|Ui|Ux|Crm|Seo|Kpi|Ceo|Cto|Hr|Pdf|Url|Mvp|Roi|Saas|Sql|Ai|Gdpr|Llm)(?=-|(?![\p{L}\p{N}]))`;

export const applyAcronyms = (text: string) => replaceWith(text, acronymRE, (m) => m.groups[0].toUpperCase());

// MARK: comma after greeting

const greetingCommaRE = '^(' + ci(['szia', 'sziasztok', 'helló', 'hello', 'hi', 'hey', 'szervusz', 'szevasz']) + String.raw`)\s+(?=\p{Ll})`;
export const applyGreetingComma = (text: string) => replaceWith(text, greetingCommaRE, (m) => m.groups[1] + ', ');

// MARK: e-mail layout

const mailGreetingRE = '^(' + ci(['kedves', 'tisztelt', 'szia', 'sziasztok', 'szervusz', 'helló', 'hello', 'jó napot', 'dear', 'hi']) + String.raw`)\s+([\p{L}.-]+)(\s+\p{Lu}[\p{L}.-]+)?\s*[,!:.]?\s+`;
const strongSignoffs = ['baráti üdvözlettel', 'üdvözlettel', 'tisztelettel', 'köszönettel', 'üdv', 'best regards', 'kind regards', 'regards', 'best wishes'];
const weakSignoffs = ['köszönöm', 'köszi', 'thanks', 'thank you', 'best', 'cheers', 'szép napot'];
const signoffRE = (list: string[], capitalizedName: boolean) => {
  const name = capitalizedName ? String.raw`(\p{Lu}[\p{L}.-]*(?:\s+\p{Lu}[\p{L}.-]*)?)` : String.raw`([\p{L}.-]+(?:\s+\p{Lu}[\p{L}.-]*)?)`;
  return String.raw`[,.;]?\s+(` + ci(list) + String.raw`)[,:.!]?\s+` + name + String.raw`[.!]?\s*$`;
};
const strongSignoffRE = signoffRE(strongSignoffs, false);
const weakSignoffRE = signoffRE(weakSignoffs, true);
const commonNonNames = new Set(['köszönöm', 'köszi', 'holnap', 'ma', 'minden', 'mindenkinek', 'küldöm', 'csak', 'még', 'már', 'itt',
  'most', 'thanks', 'thank', 'please', 'just', 'the', 'a', 'az', 'egy', 'és', 'is', 'nem', 'jó']);

export function layoutEmail(text: string, lang: Lang): string | null {
  if (text.includes('\n')) return null;
  let body = trimWS(text);
  let greeting: string | null = null;
  const m = firstMatch(body, mailGreetingRE);
  if (m) {
    const gr = m.groups[1];
    const n1 = m.groups[2];
    const n2 = trimWS(m.groups[3]);
    const strong = ['kedves', 'tisztelt', 'dear'].includes(gr.toLowerCase());
    if (isCapitalized(n1) || (strong && !commonNonNames.has(n1.toLowerCase())) || (!commonNonNames.has(n1.toLowerCase()) && !huWords.has(n1.toLowerCase()))) {
      const name = [capFirst(n1), ...(n2 ? [n2] : [])].join(' ');
      const isEN = ['dear', 'hi', 'hello'].includes(gr.toLowerCase()) && lang === 'en';
      greeting = capFirst(gr.toLowerCase()) + ' ' + name + (isEN ? ',' : '!');
      body = body.slice(m.index + m.length);
    }
  }
  let signoff: string | null = null;
  const sm = firstMatch(body, strongSignoffRE) ?? firstMatch(body, weakSignoffRE);
  if (sm) {
    const so = sm.groups[1];
    const name = sm.groups[2];
    if (!commonNonNames.has(name.toLowerCase())) {
      signoff = capFirst(so.toLowerCase()) + (lang === 'en' ? ',' : ':') + '\n' + name.split(' ').filter((x) => x).map(capFirst).join(' ');
      body = body.slice(0, sm.index);
    }
  }
  if (greeting === null && signoff === null) return null;
  body = capFirst(trimBy(body, (c) => c === ' ' || c === '\t' || c === ','));
  const l = last(body);
  if (l && (isLetter(l) || isNumber(l))) {
    const parts = body.split(/[.!?]/);
    body += isQuestion(parts[parts.length - 1] ?? body) ? '?' : '.';
  }
  return [greeting, body ? body : null, signoff].filter((x): x is string => x !== null).join('\n\n');
}

// MARK: cursor context

export function fitToContext(text: string, context: DictationContext, protectedTerms: string[]): string {
  if (context.isSecure || !text) return text;
  let s = text;
  const before = context.before.replace(/[ \t]+$/, '');
  const c = last(before);
  if (c !== undefined) {
    let firstWord = '';
    for (const ch of chars(s)) {
      if (isLetter(ch) || isNumber(ch) || ch === '-') firstWord += ch;
      else break;
    }
    const protectedWord =
      (count(firstWord) > 1 && firstWord === firstWord.toUpperCase()) ||
      protectedTerms.some((p) => eqCI(p, firstWord)) ||
      firstWord === 'I' ||
      contextNames(context).includes(firstWord) ||
      looksLikeName(firstWord);
    if ('.!?\n'.includes(c) || before.endsWith(':\n')) {
      s = capFirst(s);
    } else if ((isLetter(c) || isNumber(c) || ',;(–-'.includes(c)) && !protectedWord && !s.includes('\n')) {
      const a = chars(s);
      const i = a.findIndex((x) => isLetter(x));
      if (i === 0 && isUpper(a[0])) {
        a[0] = a[0].toLowerCase();
        s = a.join('');
      }
    }
  }
  const after = context.after.replace(/^[ \t]+/, '');
  const a0 = first(after);
  if (a0 !== undefined && (isLower(a0) || ',;:'.includes(a0))) {
    while (s.length && '.!?'.includes(s[s.length - 1]) && !s.endsWith('...')) s = s.slice(0, -1);
  }
  return s;
}

const firstNames = new Set(['anna', 'péter', 'attila', 'dorottya', 'gábor', 'lászló', 'istván', 'zoltán', 'józsef', 'jános', 'ferenc', 'sándor',
  'tamás', 'zsolt', 'tibor', 'andrás', 'csaba', 'imre', 'balázs', 'gergely', 'dávid', 'dániel', 'ádám', 'bence', 'máté', 'levente',
  'márk', 'krisztián', 'norbert', 'róbert', 'richárd', 'viktor', 'szabolcs', 'ákos', 'gyula', 'miklós', 'károly', 'béla', 'mihály',
  'mária', 'erzsébet', 'katalin', 'éva', 'ilona', 'zsuzsanna', 'judit', 'ágnes', 'andrea', 'erika', 'krisztina', 'eszter', 'edit',
  'anita', 'mónika', 'tímea', 'nóra', 'réka', 'zsófia', 'viktória', 'dóra', 'petra', 'kitti', 'lilla', 'fanni', 'boglárka', 'orsolya',
  'beáta', 'szilvia', 'melinda', 'barbara', 'noémi', 'vivien', 'rita', 'ildikó', 'gabriella', 'csilla', 'emese', 'eniko', 'enikő',
  'john', 'michael', 'david', 'james', 'robert', 'mary', 'sarah', 'emma', 'peter', 'paul', 'mark', 'anne', 'laura', 'tom', 'alex']);

export function looksLikeName(w: string): boolean {
  const f = first(w);
  if (!f || !isUpper(f) || count(w) < 3) return false;
  const l = w.toLowerCase();
  if (firstNames.has(l)) return true;
  const la = chars(l);
  for (const n of firstNames) {
    const na = chars(n);
    if (l.startsWith(n) && la.length - na.length <= 6) return true;
    const nl = na[na.length - 1];
    if ('ae'.includes(nl) && l.startsWith(na.slice(0, -1).join('')) && la[na.length - 1] !== undefined && 'áé'.includes(la[na.length - 1])) return true;
  }
  return false;
}

export function contextNames(ctx: DictationContext): string[] {
  if (ctx.isSecure) return [];
  const text = ctx.before + ' ' + ctx.after;
  const out: string[] = [];
  for (const m of matches(text, String.raw`(?<=[\p{L}\p{N},;]\s)(\p{Lu}[\p{Ll}]{2,})`)) {
    if (!out.includes(m.groups[0])) out.push(m.groups[0]);
  }
  return out;
}

export function applyContextNames(text: string, context: DictationContext): string {
  const names = contextNames(context).filter((n) => count(n) >= 4);
  if (!names.length) return text;
  return replaceWith(text, String.raw`(?<![\p{L}\p{N}])\p{Lu}[\p{Ll}]{3,}`, (m) => {
    const w = m.groups[0];
    if (names.includes(w)) return null;
    const wa = chars(w);
    for (const n of names) {
      const na = chars(n);
      if (wa.length < na.length || wa[0] !== na[0]) continue;
      const stem = wa.slice(0, na.length).join('');
      const rest = wa.slice(na.length);
      if (stem !== n && lev(stem, n) === 1 && rest.length <= 6) return n + rest.join('');
    }
    return null;
  });
}


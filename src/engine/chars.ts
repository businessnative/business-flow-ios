// Character predicates matching Swift's Character.isLetter / isNumber / isUppercase for the scripts we care about.
import { compile } from './regex';

const letter = compile('^\\p{L}$');
const upper = compile('^\\p{Lu}$');
const lower = compile('^\\p{Ll}$');
const number = compile('^\\p{N}$');
const punct = compile('^\\p{P}$');

export const isLetter = (c: string | undefined) => !!c && letter.test(c);
export const isUpper = (c: string | undefined) => !!c && upper.test(c);
export const isLower = (c: string | undefined) => !!c && lower.test(c);
export const isNumber = (c: string | undefined) => !!c && number.test(c);
export const isPunct = (c: string | undefined) => !!c && punct.test(c);
export const isWhitespace = (c: string | undefined) => !!c && /\s/.test(c);

export const chars = (s: string) => Array.from(s);

/** Width of the code point ending at `end` (exclusive). Matches `Array.from` (code points, not grapheme clusters). */
function codePointWidthBefore(s: string, end: number): number {
  if (end >= 2) {
    const cu = s.charCodeAt(end - 1);
    if (cu >= 0xdc00 && cu <= 0xdfff) {
      const prev = s.charCodeAt(end - 2);
      if (prev >= 0xd800 && prev <= 0xdbff) return 2;
    }
  }
  return 1;
}

export function first(s: string): string | undefined {
  if (!s) return undefined;
  const w = s.length >= 2 && s.charCodeAt(0) >= 0xd800 && s.charCodeAt(0) <= 0xdbff && s.charCodeAt(1) >= 0xdc00 && s.charCodeAt(1) <= 0xdfff ? 2 : 1;
  return s.slice(0, w);
}

export function last(s: string): string | undefined {
  if (!s) return undefined;
  const w = codePointWidthBefore(s, s.length);
  return s.slice(s.length - w);
}

export function count(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n++;
    const cu = s.charCodeAt(i);
    if (cu >= 0xd800 && cu <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) i++;
  }
  return n;
}

/** Swift trimmingCharacters(in:) with a predicate. */
export function trimBy(s: string, pred: (c: string) => boolean): string {
  const a = Array.from(s);
  let i = 0;
  let j = a.length;
  while (i < j && pred(a[i])) i++;
  while (j > i && pred(a[j - 1])) j--;
  return a.slice(i, j).join('');
}
export const trimWS = (s: string) => trimBy(s, (c) => c === ' ' || c === '\t');
export const trimWSNL = (s: string) => trimBy(s, isWhitespace);
export const trimPunct = (s: string) => trimBy(s, isPunct);
export const trimPunctWSNL = (s: string) => trimBy(s, (c) => isPunct(c) || isWhitespace(c));

export const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const eqCI = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

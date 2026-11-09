// Regex helpers that keep the Swift (ICU) patterns of bn-flow-mac readable in TypeScript.
// \p{L}, \p{Lu}, \p{Ll}, \p{N} tokens are expanded into explicit ranges (unicodeClasses.ts),
// so the engine runs the same on Hermes, JSC and Node without relying on Unicode property escapes.
import { L, Ll, Lu, N, P } from './unicodeClasses';

const CLASSES: Record<string, string> = { L, Lu, Ll, N, P };

/** Expands \p{X} tokens; a leading (?i) / (?m) becomes a JS flag. */
export function compile(pattern: string, extraFlags = ''): RegExp {
  let flags = extraFlags;
  let p = pattern;
  for (;;) {
    const m = /^\(\?([im]+)\)/.exec(p);
    if (!m) break;
    for (const f of m[1]) if (!flags.includes(f)) flags += f;
    p = p.slice(m[0].length);
  }
  let out = '';
  let inClass = false;
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '\\') {
      const tok = /^\\p\{(L|Lu|Ll|N|P)\}/.exec(p.slice(i));
      if (tok) {
        const cls = CLASSES[tok[1]];
        out += inClass ? cls : '[' + cls + ']';
        i += tok[0].length - 1;
        continue;
      }
      const hex = /^\\x\{([0-9a-fA-F]+)\}/.exec(p.slice(i));
      if (hex) {
        out += '\\u' + hex[1].padStart(4, '0');
        i += hex[0].length - 1;
        continue;
      }
      out += ch + (p[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '[' && !inClass) inClass = true;
    else if (ch === ']' && inClass) inClass = false;
    out += ch;
  }
  return new RegExp(out, flags);
}

const cache = new Map<string, RegExp>();
/** How many distinct patterns have been compiled. Used by the latency benchmark, not by dictation. */
export const patternCacheSize = () => cache.size;
/** Global (all matches) version, cached. */
export function g(pattern: string): RegExp {
  const k = 'g' + pattern;
  let r = cache.get(k);
  if (!r) {
    r = compile(pattern, 'g');
    cache.set(k, r);
  }
  r.lastIndex = 0;
  return r;
}
/** First-match version, cached. */
export function one(pattern: string): RegExp {
  const k = '1' + pattern;
  let r = cache.get(k);
  if (!r) {
    r = compile(pattern);
    cache.set(k, r);
  }
  return r;
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');

/** Case-insensitive alternative group without the i flag: (?i:a|b) → (?:[aA]|[bB]). */
export function ci(words: string[]): string {
  const alt = words.map((w) =>
    Array.from(w)
      .map((c) => {
        const lo = c.toLowerCase();
        const up = c.toUpperCase();
        if (lo === up) return c === ' ' ? ' ' : escapeRe(c);
        return '[' + lo + up + ']';
      })
      .join(''),
  );
  return '(?:' + alt.join('|') + ')';
}

/** Swift `replacingOccurrences(of:with:options:.regularExpression)` with a $1-style template. */
export function replaceAll(s: string, pattern: string, template: string): string {
  return s.replace(g(pattern), template);
}

export interface Match {
  index: number;
  length: number;
  groups: string[]; // groups[0] = whole match; missing groups = ''
}

export function matches(s: string, pattern: string): Match[] {
  const out: Match[] = [];
  const re = g(pattern);
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out.push({ index: m.index, length: m[0].length, groups: Array.from(m, (x) => x ?? '') });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

export function firstMatch(s: string, pattern: string): Match | null {
  const m = one(pattern).exec(s);
  return m ? { index: m.index, length: m[0].length, groups: Array.from(m, (x) => x ?? '') } : null;
}

export function test(s: string, pattern: string): boolean {
  return one(pattern).test(s);
}

/** Swift TextRules.replace: closure replacement, matches replaced from the back; null = keep. */
export function replaceWith(s: string, pattern: string, f: (m: Match, s: string) => string | null): string {
  const ms = matches(s, pattern);
  if (!ms.length) return s;
  let out = s;
  for (let i = ms.length - 1; i >= 0; i--) {
    const m = ms[i];
    const r = f(m, s);
    if (r !== null) out = out.slice(0, m.index) + r + out.slice(m.index + m.length);
  }
  return out;
}

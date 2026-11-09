// Port of business-flow-mac AudioPrep.cleanTranscript: drops Whisper-style hallucinations ("köszönöm a figyelmet", "feliratok"…).
const hallucinations = [
  'köszönöm a figyelmet', 'köszönöm, hogy megnézted', 'köszönöm szépen a figyelmet', 'feliratok', 'feliratozta', 'a feliratot',
  'amara.org', 'thanks for watching', 'thank you for watching', 'subtitles by', 'subscribe', 'iratkozz fel', 'like-old', 'www.',
  'transcribed by', 'please subscribe',
];
const shortJunk = ['köszönöm', 'köszi', 'thank you', 'thanks', 'you', 'bye', 'szia'];

const isPunctOrSpace = (ch: string) => /^[\s!-/:-@[-`{-~«»„”“‘’…–—¡¿·]$/.test(ch);
function trimBy(s: string, pred: (c: string) => boolean): string {
  const a = Array.from(s);
  let i = 0;
  let j = a.length;
  while (i < j && pred(a[i])) i++;
  while (j > i && pred(a[j - 1])) j--;
  return a.slice(i, j).join('');
}

export function cleanTranscript(text: string, speechSeconds?: number): string {
  let t = text.trim();
  const lower = t.toLowerCase();
  const bare = trimBy(lower, isPunctOrSpace);
  for (const h of hallucinations) {
    if (!(bare.startsWith(h) || bare.endsWith(h))) continue;
    if (speechSeconds !== undefined && speechSeconds > 2.5 && bare !== h) {
      if (lower.endsWith(h) || lower.endsWith(h + '.') || lower.endsWith(h + '!')) {
        const idx = t.toLowerCase().lastIndexOf(h);
        if (idx >= 0) t = trimBy(t.slice(0, idx), (c) => c === ' ' || c === '\t' || c === ',');
      }
      continue;
    }
    if (Array.from(bare).length <= Array.from(h).length + 30) return '';
  }
  if (speechSeconds !== undefined && speechSeconds < 0.5 && shortJunk.includes(bare)) return '';
  return t;
}

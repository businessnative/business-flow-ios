import { describe, expect, it } from 'vitest';
import { cleanTranscript } from '../audioPrep';

describe('cleanTranscript (AudioPrep port)', () => {
  it('drops a pure hallucination', () => {
    expect(cleanTranscript('Köszönöm a figyelmet!')).toBe('');
    expect(cleanTranscript('Feliratok: Amara.org közösség')).toBe('');
    expect(cleanTranscript('Thanks for watching.', 3)).toBe('');
  });
  it('cuts a trailing hallucination after real speech', () => {
    expect(cleanTranscript('Holnap tízkor találkozunk az irodában, hozd a laptopot. Köszönöm a figyelmet!', 6)).toBe(
      'Holnap tízkor találkozunk az irodában, hozd a laptopot.',
    );
  });
  it('keeps normal text', () => {
    expect(cleanTranscript('  Küldd át a Supabase linket.  ', 2)).toBe('Küldd át a Supabase linket.');
    expect(cleanTranscript('Köszönöm', 1.2)).toBe('Köszönöm');
  });
  it('drops very short junk on near-silent clips', () => {
    expect(cleanTranscript('Thank you.', 0.3)).toBe('');
    expect(cleanTranscript('Szia!', 0.2)).toBe('');
  });
});

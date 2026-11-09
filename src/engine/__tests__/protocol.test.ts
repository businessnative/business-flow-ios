import { describe, expect, it } from 'vitest';
import { insertionText, isFresh, parseCommand, stateJson } from '@/session/protocol';

describe('keyboard ⇄ app protocol', () => {
  it('parses keyboard commands defensively', () => {
    const c = parseCommand('{"id":"a","action":"start","category":"work","before":"Szia","after":"","mode":"ptt","ts":100}');
    expect(c).toEqual({ id: 'a', action: 'start', category: 'work', before: 'Szia', after: '', mode: 'ptt', ts: 100 });
    expect(parseCommand('{"id":"a","action":"explode"}')).toBeNull();
    expect(parseCommand('nope')).toBeNull();
    expect(parseCommand(null)).toBeNull();
    expect(parseCommand('{"id":"b","action":"stop","category":"x"}')?.category).toBe('other');
  });
  it('honours deep-link start commands only while fresh', () => {
    const c = parseCommand('{"id":"a","action":"start","ts":100}')!;
    expect(isFresh(c, 110)).toBe(true);
    expect(isFresh(c, 120)).toBe(false);
  });
  it('serialises state with a timestamp', () => {
    expect(JSON.parse(stateJson({ id: 'a', phase: 'done', text: 'x' }, 5))).toEqual({ id: 'a', phase: 'done', text: 'x', ts: 5 });
  });
  it('adds a leading space only after a word', () => {
    expect(insertionText('Szia', 'holnap')).toBe(' holnap');
    expect(insertionText('Szia ', 'holnap')).toBe('holnap');
    expect(insertionText('', 'Holnap')).toBe('Holnap');
  });
});

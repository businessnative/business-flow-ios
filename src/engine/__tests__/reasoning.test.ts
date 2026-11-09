import { describe, expect, it } from 'vitest';
import { isReasoningModel } from '@/services/openai';

describe('isReasoningModel', () => {
  it('only gpt-5 / o-series', () => {
    expect(isReasoningModel('gpt-5.6-luna')).toBe(true);
    expect(isReasoningModel('o4-mini')).toBe(true);
    expect(isReasoningModel('gpt-4.1-mini')).toBe(false);
  });
});

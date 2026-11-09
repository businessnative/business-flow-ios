import type { StyleTone } from '../types';

export interface EvalCase {
  id: string;
  category: string;
  lang: string;
  raw: string;
  expected: string;
  bundleID?: string;
  windowTitle?: string;
  before?: string;
  after?: string;
  selection?: string;
  command?: boolean;
  dictionary?: { term: string; heardAs?: string[] }[];
  snippets?: { trigger: string; expansion: string }[];
  tone?: StyleTone;
  contain?: string[];
  notContain?: string[];
}

export const c = (id: string, category: string, lang: string, rest: Omit<EvalCase, 'id' | 'category' | 'lang'>): EvalCase => ({
  id,
  category,
  lang,
  ...rest,
});

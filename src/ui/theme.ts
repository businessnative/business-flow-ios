// businessnative-dark tokens (bn-flow-mac/docs/tokens.json).
export const C = {
  base: '#0a0a0b',
  lift: '#121212',
  lift80: 'rgba(18,18,18,0.8)',
  depth: '#212122',
  text: '#f6f3ec',
  text88: 'rgba(246,243,236,0.88)',
  text64: 'rgba(246,243,236,0.64)',
  text48: 'rgba(246,243,236,0.48)',
  text32: 'rgba(246,243,236,0.32)',
  text16: 'rgba(246,243,236,0.16)',
  text08: 'rgba(246,243,236,0.08)',
  accent: '#c0c0e7',
  accentSecondary: '#b9d5ed',
  error: '#c94040',
  success: '#2ad87f',
  warning: '#c56a21',
} as const;

export const R = { sm: 4, md: 8, lg: 16 } as const;
export const S = { x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24, x8: 32, x10: 40, x12: 48 } as const;

export const F = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
} as const;

export const T = {
  h1: { fontFamily: F.medium, fontSize: 28, lineHeight: 34, color: C.text, letterSpacing: -0.4 },
  h2: { fontFamily: F.medium, fontSize: 20, lineHeight: 26, color: C.text },
  body: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.text88 },
  small: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.text64 },
  label: { fontFamily: F.mono, fontSize: 11, lineHeight: 14, color: C.text48, letterSpacing: 0.75, textTransform: 'uppercase' as const },
} as const;

/** cubic-bezier(.22,1,.36,1) */
export const EASE = [0.22, 1, 0.36, 1] as const;

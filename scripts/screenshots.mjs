// Web-render screenshots (react-native-web) at iPhone size, with demo data. Not a native iOS render.
import { chromium } from '/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright/index.mjs';
const base = 'http://localhost:8089';
const now = Date.now();
const demo = [
  { id: 'd1', date: now - 6e5, text: 'Szia Péter, holnap tízkor tudok jönni az irodába, hozom a szerződést is.', rawText: 'szia péter holnap tízkor tudok jönni az irodába hozom a szerződést is', category: 'personal', durationSeconds: 5.2, kind: 'dictation' },
  { id: 'd2', date: now - 36e5, text: 'Kedves Anna!\n\nKöszönöm a gyors választ. A pénteki egyeztetés nekem megfelel.\n\nÜdvözlettel,\nDorottya', rawText: 'kedves anna köszönöm a gyors választ a pénteki egyeztetés nekem megfelel üdvözlettel dorottya', category: 'email', durationSeconds: 8.9, kind: 'dictation' },
  { id: 'd3', date: now - 864e5, text: 'Let’s ship the iOS build on Friday.', rawText: 'lets ship the ios build on friday', category: 'work', durationSeconds: 2.4, kind: 'dictation' },
];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
async function shot(name, path, seed) {
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await ctx.newPage();
  await p.goto(base);
  await p.evaluate(([s, h]) => { localStorage.clear(); if (s) localStorage.setItem('bf.settings.v1', s); if (h) localStorage.setItem('bf.history.v1', h); }, seed);
  await p.goto(base + path);
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `report/${name}.png` });
  await ctx.close();
}
const done = JSON.stringify({ onboardingDone: true });
await shot('01-onboarding', '/onboarding', [null, null]);
await shot('02-home', '/home', [done, JSON.stringify(demo)]);
await shot('03-history', '/history', [done, JSON.stringify(demo)]);
await shot('04-history-detail', '/history/d2', [done, JSON.stringify(demo)]);
await shot('05-dictionary', '/dictionary', [done, null]);
await shot('06-snippets', '/snippets', [done, null]);
await shot('07-styles', '/styles', [done, null]);
await shot('08-settings', '/settings', [done, null]);
await shot('09-dictate', '/dictate', [done, null]);
await b.close();
console.log('ok');

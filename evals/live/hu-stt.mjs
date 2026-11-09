// Live Hungarian STT + cleanup eval on macOS TTS samples (say -v Tünde) against the real OpenAI API.
// Key comes ONLY from env BF_EVAL_OPENAI_KEY (never printed, never written). Output: JSON on stdout.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const key = process.env.BF_EVAL_OPENAI_KEY;
if (!key) { console.log(JSON.stringify({ skipped: 'no BF_EVAL_OPENAI_KEY' })); process.exit(0); }
const types = readFileSync(new URL('../../src/engine/types.ts', import.meta.url), 'utf8');
const pick = (k) => types.match(new RegExp(`${k}: '([^']+)'`))[1];
const M = { stt: pick('transcriptionModel'), sttFb: pick('fallbackTranscriptionModel'), chat: pick('chatModel'), chatFb: pick('fallbackChatModel') };

const SAMPLES = [
  'Holnap délelőtt tíz órakor találkozunk az irodában.',
  'Kérlek, küldd el a szerződést Kiss Dorottyának még ma.',
  'Az árvíztűrő tükörfúrógép ára negyvenkétezer forint.',
  'A projekt határideje december tizenötödike, utána jön a tesztelés.',
  'Szia, köszönöm a gyors választ, a jövő héten jelentkezem.',
  'Írd fel a listára: tej, kenyér, tojás és egy kiló alma.',
];
const dir = mkdtempSync(join(tmpdir(), 'bf-hu-'));
const wav = (i, text) => {
  const a = join(dir, `s${i}.aiff`), w = join(dir, `s${i}.wav`);
  if (text === null) execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '3', '-c:a', 'pcm_s16le', w, '-y']);
  else { execFileSync('say', ['-v', 'Tünde', '-o', a, text]); execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', a, w]); }
  return w;
};
const norm = (s) => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const wer = (ref, hyp) => {
  const r = norm(ref), h = norm(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
};
async function stt(model, file) {
  const f = new FormData();
  f.append('file', new Blob([readFileSync(file)], { type: 'audio/wav' }), 'audio.wav');
  f.append('model', model);
  f.append('response_format', 'json');
  if (model.startsWith('gpt-transcribe')) { f.append('languages[]', 'hu'); f.append('languages[]', 'en'); } else f.append('language', 'hu');
  const t = Date.now();
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: f });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ms: Date.now() - t, text: body.text ?? '', err: res.ok ? undefined : body?.error?.code ?? body?.error?.type ?? 'error' };
}
async function chat(model, text) {
  const t = Date.now();
  const reasoning = /^(gpt-5|o1|o3|o4)/.test(model) ? { reasoning_effort: 'low' } : {};
  const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: 'Javítsd a diktált magyar szöveg írásjeleit és helyesírását. Csak a javított szöveget add vissza.' }, { role: 'user', content: text }], ...reasoning }) });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ms: Date.now() - t, text: body?.choices?.[0]?.message?.content ?? '', err: res.ok ? undefined : body?.error?.code ?? 'error' };
}
const p50 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

const out = { models: M, samples: [], silence: null };
for (const [i, ref] of SAMPLES.entries()) {
  const file = wav(i, ref);
  let r = await stt(M.stt, file), used = M.stt;
  if (!r.ok && (r.status === 400 || r.status === 404)) { r = await stt(M.sttFb, file); used = M.sttFb; }
  const c = r.ok ? await chat(M.chat, r.text) : null;
  out.samples.push({ ref, hyp: r.text, model: used, status: r.status, err: r.err, wer: r.ok ? +wer(ref, r.text).toFixed(3) : 1, sttMs: r.ms, chatMs: c?.ms ?? null, chatOk: c?.ok ?? false, chatErr: c?.err, cleaned: c?.text, cleanedWer: c?.ok ? +wer(ref, c.text).toFixed(3) : null });
}
const s = await stt(M.stt, wav(99, null));
out.silence = { status: s.status, text: s.text };
const ok = out.samples.filter((x) => x.status === 200);
out.summary = {
  primaryModelOk: out.samples.every((x) => x.model === M.stt && x.status === 200),
  meanWer: ok.length ? +(ok.reduce((a, x) => a + x.wer, 0) / ok.length).toFixed(3) : 1,
  meanCleanedWer: ok.length ? +(ok.reduce((a, x) => a + (x.cleanedWer ?? 1), 0) / ok.length).toFixed(3) : 1,
  chatModelOk: out.samples.every((x) => x.chatOk),
  sttP50Ms: p50(ok.map((x) => x.sttMs)), chatP50Ms: p50(out.samples.filter((x) => x.chatOk).map((x) => x.chatMs)),
};
console.log(JSON.stringify(out));

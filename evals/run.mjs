#!/usr/bin/env node
// Business Flow iOS eval runner — see evals/PROTOCOL.md.
//   node evals/run.mjs [--live] [--label before|after]
// unit: vitest (test names tagged [E-xx] or matched via cases.json "tests"); swift: swiftc harness on macOS;
// static: repo checks below; live: evals/live/hu-stt.mjs (needs BF_EVAL_OPENAI_KEY in env; never printed);
// manual: device-only, reported as N/A. Writes evals/results/<label>.json + .md and latest.*.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const live = args.includes('--live');
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'latest';
const cases = JSON.parse(readFileSync(join(root, 'evals/cases.json'), 'utf8'));
const res = {}; // id -> { status: pass|fail|skip|manual, detail }
const put = (id, ok, detail = '') => { const prev = res[id]; if (prev?.status === 'fail') return; res[id] = { status: ok ? 'pass' : 'fail', detail: ok ? prev?.detail ?? detail : detail }; };
const rd = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '');
const walk = (d, re, out = []) => { for (const f of readdirSync(join(root, d), { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) { if (!/node_modules|__tests__|\.git/.test(f.name)) walk(p, re, out); } else if (re.test(f.name)) out.push(p); } return out; };

// ---- unit (vitest) ----
mkdirSync(join(root, 'evals/results'), { recursive: true });
const vjson = join(root, 'evals/results/vitest.json');
spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${vjson}`], { cwd: root, stdio: 'ignore' });
const v = JSON.parse(readFileSync(vjson, 'utf8'));
const tests = v.testResults.flatMap((f) => f.assertionResults.map((a) => ({ name: [...a.ancestorTitles, a.title].join(' '), ok: a.status === 'passed', msg: (a.failureMessages ?? [])[0]?.split('\n')[0] ?? '' })));
for (const c of cases.filter((c) => c.method === 'unit')) {
  const mine = tests.filter((t) => t.name.includes(`[${c.id}]`) || (c.tests ?? []).some((r) => new RegExp(r).test(t.name)));
  if (!mine.length) res[c.id] = { status: 'fail', detail: 'nincs teszt' };
  else for (const t of mine) put(c.id, t.ok, t.ok ? '' : t.msg.slice(0, 160));
}
const unitTotals = { total: tests.length, passed: tests.filter((t) => t.ok).length };

// ---- swift ----
const swiftSrc = ['targets/keyboard/KeyboardLogic.swift', 'modules/flow-session/ios/AudioPrep.swift', 'targets/share/CallInbox.swift', 'evals/swift/main.swift'];
const bin = '/tmp/bf-swift-eval';
const sc = spawnSync('swiftc', ['-O', ...swiftSrc.map((p) => join(root, p)), '-o', bin], { encoding: 'utf8' });
const swiftOut = sc.status === 0 ? spawnSync(bin, { encoding: 'utf8' }).stdout : '';
for (const c of cases.filter((c) => c.method === 'swift')) {
  const m = swiftOut.match(new RegExp(`^(PASS|FAIL) \\[${c.id}\\](.*)$`, 'm'));
  res[c.id] = m ? { status: m[1] === 'PASS' ? 'pass' : 'fail', detail: m[2].trim().slice(0, 200) } : { status: 'fail', detail: sc.status === 0 ? 'nincs eredmény' : 'swiftc: ' + (sc.stderr.split('\n').find((l) => l.includes('error')) ?? '').slice(0, 160) };
}

// ---- static ----
const appJson = JSON.parse(rd('app.json')).expo;
const ent = appJson.ios?.entitlements ?? {};
const kbCfg = rd('targets/keyboard/expo-target.config.js');
const kc = rd('src/state/keychain.ts');
const S = {
  'E-KB-05': () => [/RequestsOpenAccess<\/key>\s*<true\/>/.test(rd('targets/keyboard/Info.plist')) && kbCfg.includes('application-groups'), 'Info.plist RequestsOpenAccess + App Group'],
  'E-KC-01': () => {
    const grp = (ent['keychain-access-groups'] ?? []).some((g) => g.includes('com.example.businessflow.shared'));
    const ok = grp && kbCfg.includes("'keychain-access-groups'") && kc.includes('AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY') && /requireAuthentication:\s*false/.test(kc) && !/WHEN_UNLOCKED\b|requireAuthentication:\s*true/.test(kc);
    return [ok, `group=${grp}`];
  },
  'E-KC-03': () => {
    const files = [...walk('src', /\.(ts|tsx)$/), ...walk('targets', /\.swift$/), ...walk('modules', /\.(swift|ts)$/)];
    const logHits = files.filter((f) => /console\.(log|info|debug|warn)\([^)]*(key|token|secret)/i.test(rd(f)) || /\bprint\([^)]*(key|token)/i.test(rd(f)) || /NSLog\(/.test(rd(f)));
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f && !/\.(png|jpg|ttf|otf|lock)$|package-lock/.test(f));
    const secretHits = tracked.filter((f) => /\bsk-(proj-|ant-)?[A-Za-z0-9_-]{24,}|AIza[0-9A-Za-z_-]{30,}/.test(rd(f)));
    const envTracked = tracked.filter((f) => /(^|\/)\.env/.test(f) && !f.endsWith('.example'));
    return [!logHits.length && !secretHits.length && !envTracked.length, [...logHits, ...secretHits, ...envTracked].join(', ')];
  },
  'E-SET-04': () => { const s = rd('src/state/store.ts'); return [/AsyncStorage\.setItem\(SETTINGS/.test(s) && s.includes("setShared('flow.kb.prefs'"), 'store.ts']; },
  'E-UI-01': () => [appJson.userInterfaceStyle === 'dark' || appJson.userInterfaceStyle === 'automatic', `userInterfaceStyle=${appJson.userInterfaceStyle}`],
  'E-UI-02': () => {
    const miss = [];
    for (const f of walk('src', /\.tsx$/)) rd(f).split('\n').forEach((l, i) => { if (/<Pressable\b|<TouchableOpacity\b/.test(l) && !/accessibilityRole|accessibilityLabel/.test(l)) miss.push(`${f}:${i + 1}`); });
    for (const f of [...walk('targets/keyboard', /View\.swift$/), ...walk('targets/widget', /\.swift$/)]) {
      const lines = rd(f).split('\n');
      lines.forEach((l, i) => { if (/Image\(systemName/.test(l) && !/struct (KeyButton|RepeatKeyButton|CircleButton)/.test(lines.slice(Math.max(0, i - 8), i).join('\n'))) { const win = lines.slice(Math.max(0, i - 12), i + 12).join('\n'); if (!/accessibilityLabel|accessibilityHidden|label:/.test(win)) miss.push(`${f}:${i + 1}`); } });
    }
    return [!miss.length, miss.join(', ')];
  },
  'E-UI-03': () => { const hits = walk('src', /\.tsx$/).filter((f) => /allowFontScaling=\{false\}/.test(rd(f))); return [!hits.length, hits.join(', ')]; },
  'E-UI-04': () => {
    const screens = [...walk('src/app', /\.tsx$/)].filter((f) => !/_layout|index\.tsx|dictate\.tsx/.test(f));
    const miss = screens.filter((f) => !/<Screen\b|ScrollView|FlatList/.test(rd(f)));
    return [!miss.length, miss.length ? 'nem görgethető: ' + miss.join(', ') : ''];
  },
  'E-ONB-01': () => { const o = rd('src/app/onboarding.tsx'); return [/'keyboard'.*'fullAccess'.*'mic'.*'key'/.test(o) && o.includes('ApiKeyCard') && /<Screen\b|ScrollView/.test(o), 'lépések + kulcs + görgethetőség']; },
  'E-CALL-08': () => {
    const cfg = rd('targets/share/expo-target.config.js'), pl = rd('targets/share/Info.plist');
    const same = rd('targets/share/CallInbox.swift') === rd('modules/flow-session/ios/CallInbox.swift');
    const screens = ['index', '[id]', 'guide', 'record'].every((n) => existsSync(join(root, `src/app/calls/${n}.tsx`)));
    const ok = /type:\s*'share'/.test(cfg) && cfg.includes('application-groups') && pl.includes('com.apple.share-services') && pl.includes('NSExtensionActivationSupportsFileWithMaxCount') && same && screens && rd('src/app/_layout.tsx').includes('importInbox');
    return [ok, `same=${same} screens=${screens}`];
  },
  'E-WID-01': () => { const w = rd('targets/widget/BusinessFlowWidget.swift'); const u = w.match(/businessflow:\/\/(\w+)/); return [!!u && existsSync(join(root, `src/app/${u[1]}.tsx`)), u ? u[0] : 'nincs widgetURL']; },
};
for (const c of cases.filter((c) => c.method === 'static')) { try { const [ok, d] = S[c.id](); res[c.id] = { status: ok ? 'pass' : 'fail', detail: ok ? '' : d }; } catch (e) { res[c.id] = { status: 'fail', detail: String(e).slice(0, 120) }; } }

// ---- live ----
let liveOut = null;
if (live && process.env.BF_EVAL_OPENAI_KEY) {
  const r = spawnSync('node', [join(root, 'evals/live/hu-stt.mjs')], { encoding: 'utf8', env: process.env, timeout: 300_000 });
  try { liveOut = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { liveOut = { error: (r.stderr || '').replace(/sk-[A-Za-z0-9_-]+/g, '***').slice(0, 200) }; }
}
const L = liveOut?.summary;
const liveCase = { 'E-HU-01': () => [L.meanWer <= 0.12, `WER=${L.meanWer} (tisztítva ${L.meanCleanedWer})`], 'E-HU-02': () => [L.primaryModelOk && L.chatModelOk, `stt=${L.primaryModelOk} chat=${L.chatModelOk}`],
  'E-LAT-02': () => [L.sttP50Ms <= 2500 && (L.chatP50Ms ?? 1e9) <= 3000, `stt p50=${L.sttP50Ms} ms, chat p50=${L.chatP50Ms} ms`],
  'E-HU-03': () => { const t = (liveOut.silence?.text ?? '').trim(); return [t.split(/\s+/).filter(Boolean).length <= 3, `csend → "${t.slice(0, 60)}"`]; } };
for (const c of cases.filter((c) => c.method === 'live')) res[c.id] = L ? (([ok, d]) => ({ status: ok ? 'pass' : 'fail', detail: d }))(liveCase[c.id]()) : { status: 'skip', detail: liveOut?.error ?? 'live kihagyva (--live + BF_EVAL_OPENAI_KEY)' };
for (const c of cases.filter((c) => c.method === 'manual')) res[c.id] = { status: 'manual', detail: 'csak fizikai eszközön' };

// ---- report ----
const rows = cases.map((c) => ({ ...c, ...res[c.id] }));
const count = (s) => rows.filter((r) => r.status === s).length;
const auto = rows.filter((r) => r.status === 'pass' || r.status === 'fail').length;
const summary = { label, date: new Date().toISOString(), pass: count('pass'), fail: count('fail'), skip: count('skip'), manual: count('manual'), automated: auto, unitTests: unitTotals, swift: sc.status === 0 ? 'compiled' : 'compile-failed' };
const icon = { pass: '✅', fail: '❌', skip: '⏭️', manual: '📱' };
let md = `# Eval scorecard — ${label}\n\n${summary.date}  \n**${summary.pass}/${auto} automatikus eset PASS**, ${summary.fail} FAIL, ${summary.skip} kihagyva, ${summary.manual} csak eszközön. Vitest: ${unitTotals.passed}/${unitTotals.total}. Swift: ${summary.swift}.\n\n| ID | Terület | Mód | Eset | Eredmény | Részlet |\n|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.id} | ${r.area} | ${r.method} | ${r.title} | ${icon[r.status]} | ${(r.detail ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')} |\n`;
if (liveOut?.samples) { md += `\n## Live magyar minták (${liveOut.models.stt} → ${liveOut.models.chat})\n\n| Ref | STT | WER | STT ms | Chat ms |\n|---|---|---|---|---|\n`; for (const s of liveOut.samples) md += `| ${s.ref} | ${s.hyp} | ${s.wer} | ${s.sttMs} | ${s.chatMs ?? '—'} |\n`; }
for (const n of [label, 'latest']) { writeFileSync(join(root, `evals/results/${n}.md`), md); writeFileSync(join(root, `evals/results/${n}.json`), JSON.stringify({ summary, rows, live: liveOut }, null, 2)); }
console.log(`${label}: ${summary.pass}/${auto} PASS, ${summary.fail} FAIL, ${summary.skip} skip, ${summary.manual} manual | vitest ${unitTotals.passed}/${unitTotals.total} | swift ${summary.swift}`);
for (const r of rows.filter((r) => r.status === 'fail')) console.log(`  ❌ ${r.id} ${r.title} — ${r.detail}`);
process.exitCode = summary.fail ? 1 : 0;

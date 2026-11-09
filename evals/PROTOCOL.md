# Business Flow iOS — eval protokoll

Cél: minden változtatás előtt és után ugyanaz a mérhető esetkészlet fusson le, és a scorecard mutassa, mi javult / romlott.

## Futtatás

```bash
node evals/run.mjs --label before          # unit + swift + static
BF_EVAL_OPENAI_KEY=… node evals/run.mjs --live --label after   # + valós magyar STT/LLM eval
```

Az OpenAI-kulcsot csak környezeti változóból olvassa, sosem írja ki és nem menti. Eredmény: `evals/results/<label>.{md,json}` és `latest.*`.

## Módszerek

| Mód | Mit fed le | Hogyan |
|---|---|---|
| `unit` | session-controller (start/stop, watchdogok, megszakítás, háttér, hálózat, kulcsok, csend, időmérés), szolgáltatók, beállítások, beillesztés | vitest; a natív modul, Keychain, store, fájlrendszer mockolva, a HTTP szkriptelt `fetch`. A tesztnév `[E-xx]` azonosítót visel, vagy a `cases.json` `tests` regexe illeszt. |
| `swift` | billentyűzet-logika (watchdog, mikrofon-gomb döntés, beillesztés) és natív AudioPrep/WAV | `swiftc` macOS-en: `targets/keyboard/KeyboardLogic.swift` (UIKit-mentes) + `AudioPrep.swift` + `evals/swift/main.swift` |
| `static` | entitlements, Keychain-beállítás, titok-szivárgás, VoiceOver-címkék, Dynamic Type, görgethetőség, widget deep link, onboarding | repó-ellenőrzés a `run.mjs`-ben |
| `live` | magyar átírási minőség és késleltetés | `say -v Tünde` TTS → 16 kHz WAV → valós OpenAI STT + alapértelmezett tisztító modell; WER, p50 |
| `manual` | csak fizikai eszközön mérhető | N/A a gépi futásban (nincs Xcode/szimulátor ezen a Macen) |

## Elfogadási küszöbök

- Minden `unit`/`swift`/`static` eset PASS.
- Live: átlagos WER ≤ 0,12; STT p50 ≤ 2,5 s; tisztítás p50 ≤ 3 s; az alapértelmezett modellek elérhetők; csendre ≤ 3 szó.
- Helyi késleltetés (Node/V8, nem iPhone): `npm run bench`. A számok a gépi futásról szólnak. A natív WAV-írás és a TLS nem része ennek a mérésnek. E-HU-04 a magyar kimenetet rögzíti, hogy a gyorsítás ne változtassa a szöveget.
- Időkeret: kulcstartó (4 s) + elsődleges + tartalék szolgáltató + LLM mindig a processing watchdog alatt; a billentyűzet élő app mellett nem vágja el a hosszú feldolgozást.

## Eszközön kézzel (E-DEV-*)

1. Diktálás közben bejövő hívás / Siri → a hallott rész átíródik, értesítés látszik.
2. AirPods be/ki felvétel közben → a felvétel folytatódik.
3. VoiceOver-bejárás (app + billentyűzet), Dynamic Type XXL, iPhone SE méret.
4. Widget a kezdőképernyőn → diktálás indul; app kilövése felvétel közben → billentyűzet 4 s-on belül hibát mutat.
5. Aláírt build: App Group + Keychain-megosztás az app és a billentyűzet között.

Az esetlista: `evals/cases.json`. Új hibánál előbb esetet írunk (piros), aztán javítunk (zöld).

# Business Flow (iOS)

Magyar/angol diktálóapp iPhone-ra, saját **billentyűzet-bővítménnyel**: bármelyik appban a Business Flow billentyűzeten diktálsz, és tisztított, stílusos szöveget kapsz. Expo / React Native + natív Swift modulok (billentyűzet, megosztás-bővítmény, widget).

> **Közösségi kiadás – BYOK (saját kulccsal).** Nincs beépített API-kulcs, közös kredit, köztes szerver, Expo/EAS projekt, analitika vagy telemetria.
> Mindenki a **saját** OpenAI / Gemini (és opcionálisan Anthropic) kulcsát adja meg a Beállításokban; az iOS Kulcskarikában marad. Lásd `SECURITY.md`.

## Telepítés AI-ügynökkel (Claude Code, Cursor, Codex …)

Add oda ezt a repót az AI-ügynöködnek ezzel a kéréssel: *„Telepítsd a Business Flow iOS appot a telefonomra a README »Telepítés AI-ügynökkel« része szerint.”* Az ügynök lépései:

1. **Előfeltételek:** Mac + Xcode (App Store, ingyenes) + iPhone iOS 17+, Node.js 24 + npm. Az iPhone-on: Beállítások → Adatvédelem és biztonság → **Fejlesztői mód** be.
2. **Klónozás és függőségek:** `git clone https://github.com/businessnative/business-flow-ios.git && cd business-flow-ios && npm ci`
3. **Saját azonosító:** `scripts/set-bundle-id.sh com.<sajatnev>.businessflow` – a `com.example.businessflow` helyőrzőt cseréli (app, billentyűzet, megosztás, widget, App Group `group.…`, kulcskarika-csoport). Az App Group neve minden Apple-fiókban egyedi kell legyen, ezért ez kötelező.
4. **Tesztek:** `npx vitest run` és `npx tsc --noEmit`
5. **Natív projekt:** `npx expo prebuild -p ios`, majd nyisd meg az `ios/*.xcworkspace`-t Xcode-ban. **Signing & Capabilities**: minden targetnél (app, BusinessFlowKeyboard, BusinessFlowShare, BusinessFlowWidget) válaszd ki a **saját** Teamedet (ingyenes Apple ID = „Personal Team”, vagy fizetős fiók). A Team ID nincs a repóban, és ne is commitold.
6. **Telepítés a telefonra:** iPhone USB-n/Wi-Fi-n → `npx expo run:ios --device` (vagy Xcode ▶). Ingyenes fiókkal a telepítés 7 nap után lejár → újra futtatni.
7. **Billentyűzet bekapcsolása (a felhasználónak):** Beállítások → Általános → Billentyűzet → Billentyűzetek → Új billentyűzet → **Business Flow** → **Teljes hozzáférés** be.
8. **Saját API-kulcs:** az appban Beállítások → API-kulcs → beillesztés → Mentés. Kulcs: [OpenAI](https://platform.openai.com/api-keys) · [Gemini](https://aistudio.google.com/apikey) · [Anthropic](https://console.anthropic.com/settings/keys).
9. *(Opcionális)* Felhős build / TestFlight: saját Expo-fiók → `npx eas-cli@latest init` (a **saját** projectId-det írja az `app.json`-ba) → `npx eas-cli@latest build -p ios`. Ehhez és a TestFlighthoz fizetős Apple Developer Program kell.

> Ügynököknek: soha ne commitolj `.env`-et, kulcsot, Team ID-t, tanúsítványt, provisioning profile-t vagy generált `ios/` mappát. Ne használd más Expo/EAS projektjét.

## Fejlesztés

```bash
npm ci
npx vitest run          # egységtesztek
npx tsc --noEmit        # típusellenőrzés
npx expo start          # dev szerver (dev clienttel; a billentyűzethez natív build kell)
node evals/run.mjs      # eval-futtatás (élő mérés csak saját kulccsal: BF_EVAL_OPENAI_KEY, lásd .env.example)
```

## Költségek és követelmények

Az app ingyenes és nyílt forrású (MIT). **Fizetni csak a saját AI-szolgáltatói fiókodban** fizetsz, használat szerint – közvetlenül az OpenAI-nak / Google-nak / Anthropicnak. Nincs előfizetés, nincs közvetítő, a fejlesztő semmit nem lát és nem számláz.

### Milyen szolgáltatást használ (a kódban ténylegesen bekötve)

| Feladat | Szolgáltató / modell (alapértelmezett → tartalék) | Kötelező? |
|---|---|---|
| Beszéd → szöveg (diktálás) | **OpenAI** `gpt-transcribe` → `gpt-4o-transcribe` (Macen `gpt-4o-mini-transcribe` is választható), **vagy Google Gemini** `gemini-3.5-flash-lite` | **Igen, legalább egy:** OpenAI- vagy Gemini-kulcs. Helyi/offline beszédfelismerés nincs. |
| Szövegtisztítás („Okos formázás”, parancs mód, polírozás) | OpenAI `gpt-5.6-luna` → `gpt-4.1-mini`, **vagy** Claude `claude-haiku-5-5` (Sonnet 5.5 választható), **vagy** Gemini `gemini-3.5-flash-lite` | Nem. Kikapcsolható; ilyenkor a beépített **helyi magyar szövegmotor** dolgozik (ingyenes, offline). Rövid, tiszta mondatoknál alapból is kimarad az LLM-hívás. |
| Meeting-jegyzetelő (csak Mac, opcionális) | A fenti átíró + szövegmodell (átirat + összefoglaló). A Google Meetbe vendégként, külön Chrome-profillal csatlakozik. | Nem. Kell hozzá: Node.js + Google Chrome; díj = az átírt percek. |
| Hívás-jegyzetek (csak iOS, opcionális) | OpenAI `gpt-4o-transcribe-diarize` (beszélők szétválasztása), összefoglaló a választott szövegmodellel | Nem. |

> Az Anthropic Claude-nak nincs beszéd→szöveg API-ja, ezért **csak Claude-kulccsal az app nem tud diktálni** – mellé kell OpenAI- vagy Gemini-kulcs.

### Árak (hivatalos árlisták, ellenőrizve: 2026. november 9.)

| Modell | Ár |
|---|---|
| OpenAI `gpt-transcribe` | $0.0045 / hangperc |
| OpenAI `gpt-4o-mini-transcribe` | ~$0.003 / perc |
| OpenAI `gpt-4o-transcribe`, `gpt-4o-transcribe-diarize` | ~$0.006 / perc |
| OpenAI `gpt-5.6-luna` | $0.20 be / $1.20 ki / 1M token |
| OpenAI `gpt-4.1-mini` | $0.40 be / $1.60 ki / 1M token |
| Claude `claude-haiku-5-5` | $0.10 be / $0.50 ki / 1M token (≤100K tokenes promptnál) |
| Claude `claude-sonnet-5-5` | $2 be / $10 ki / 1M token |
| Gemini `gemini-3.5-flash-lite` (fizetős szint) | $0.30 be (szöveg/hang) / $2.50 ki / 1M token; a hang ~25 token/mp ≈ 1500 token/perc |
| Gemini ingyenes szint | $0, de sebességkorlátos, és a Google a bemenetet a termékei fejlesztésére használhatja |

Források: [OpenAI pricing](https://developers.openai.com/api/docs/pricing) · [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Apple Developer Program](https://developer.apple.com/programs/)

### Becsült havi költség

Feltételezés: **30 perc diktálás naponta (≈900 perc/hó)** + **10 óra meeting havonta (600 perc)**, okos formázás bekapcsolva.

| Beállítás | Diktálás | Meetingek | **Összesen / hó** |
|---|---|---|---|
| Csak OpenAI (alapértelmezés: `gpt-transcribe` + `gpt-5.6-luna`) | ~$4.1 + ~$0.8 | ~$2.7 | **≈ $7–8** |
| OpenAI átírás + Claude Haiku 5.5 tisztítás | ~$4.1 + ~$0.4 | ~$2.7 | **≈ $7** |
| Csak Gemini (`gemini-3.5-flash-lite`, fizetős szint) | ~$1.1 + ~$1.4 | ~$0.8 | **≈ $3–4** |
| Gemini ingyenes szint | $0 | $0 | **$0** (korlátokkal, adatvédelmi kompromisszummal) |
| iOS hívás-jegyzetek (pl. 5 óra/hó, diarizálással) | | | + ≈ $1.8 |

A becslés közelítő (a magyar szöveg tokenszáma, a szótár/környezet hossza és a modellválasztás módosítja). Tipp: a szolgáltatói fiókban állíts be havi költségkeretet.

### Nem API jellegű követelmények

- **Mac app:** Apple Silicon Mac, macOS 14+, Xcode **Command Line Tools** (ingyenes; `xcode-select --install`). Apple fejlesztői fiók **nem kell** (helyi, ad-hoc aláírás). Meeting-jegyzetelőhöz: Node.js (pl. `brew install node`) és Google Chrome.
- **iPhone app:** Mac + **Xcode** (ingyenes) + iPhone iOS 17+, Node.js 24 (npm). Ingyenes Apple ID-val („Personal Team”) a saját telefonodra is telepíthető, de a telepítés **7 nap után lejár**, újra kell építeni (max. 3 eszköz). Tartós használathoz, TestFlighthoz vagy másoknak terjesztéshez **Apple Developer Program: 99 USD/év**. EAS felhős buildhez saját (ingyenes szintű) Expo-fiók.

## Funkciók röviden

- Diktálás a saját billentyűzetről bármelyik appban; push-to-talk és kéz nélküli mód
- Helyi magyar szövegmotor (töltelékszavak, önjavítás, listák, írásjelek, e-mail-elrendezés) + opcionális LLM-tisztítás
- Szótár, szövegrészletek, stílusok kategóriánként, előzmények
- Hívás-jegyzetek: iOS 18 hívásfelvétel / Jegyzetek-átirat megosztása → átirat beszélőkkel + összefoglaló (`docs/CALL_NOTES.md`)
- Több szolgáltató: OpenAI, Gemini, Anthropic – mind a saját kulcsoddal

# Hívás-jegyzetek (v0.4.0)

## Miért így
Az iOS semmilyen appnak nem ad hozzáférést a hívás hangjához. Ezért az iOS 18.1+ natív hívásrögzítésére épülünk: a felhasználó a Telefon appban rögzít (a másik fél hangos értesítést hall), a felvétel és az átirat a Jegyzetek appba kerül, onnan jut el a Business Flow-ba. Nincs telefonszám, nincs külső szolgáltatás.

## Bejutás az appba
1. Share Extension (`targets/share/`): Jegyzetek / Fájlok → Megosztás → Business Flow. Az extension csak bemásolja a hangot vagy a szöveget az App Group `CallInbox/` mappájába (`CallInbox.swift`), és megpróbálja megnyitni a `businessflow://calls` címet. A feldolgozás mindig az appban fut.
2. Fájl importálása (`expo-document-picker`) → `Documents/calls/`.
3. Leirat beillesztése.
4. Kihangosítós tartalék (`/calls/record`): mikrofonos felvétel, egyértelműen jelölve, max. 12 perc (16 kHz WAV, 24 MB alatt).

Az app minden előtérbe kerüléskor beolvassa az inboxot (`importInbox` a `_layout.tsx`-ben).

## Feldolgozás (`src/calls/pipeline.ts`)
- Hang: max. 24 MB (≈45–50 perc AAC). Időkorlát 60–600 s, méretfüggő.
  1. OpenAI-kulccsal `gpt-4o-transcribe-diarize` (`diarized_json`) → beszélők hangból.
  2. Ha ez nem elérhető (400/404/5xx/hálózat): a szokásos átírási lánc, majd LLM-es beszélőbontás szövegből. Csak akkor fogadjuk el, ha a szavak ≥85%-a megmarad (`preservesText`).
  3. Rossz kulcs, keret, megszakítás → nincs csendes fallback, magyar hiba + Újra.
- Leirat: a „Név:” jelölések és az időbélyegek megmaradnak; jelöletlen szövegnél LLM-bontás.
- Összefoglaló: JSON (cím, összefoglaló, döntések, teendők, követés, fontos adatok). Kulcs vagy LLM nélkül helyi kivonat, jelölve.
- Tárolás: AsyncStorage `bf.calls.v1` (max. 300). A hang helyben marad az Újra gombhoz, és törléskor törlődik.

## Korlátok
- A `gpt-4o-transcribe-diarize` modellt az OpenAI 2027-02-26-án kivezeti. Utána a szöveges LLM-bontás marad (`callDiarize` beállítás).
- Az extension → app automatikus megnyitása nem hivatalos API. Ha nem nyílik meg, az app a következő megnyitáskor importál.
- Egy iPhone-on hívás közben a mikrofont a hívás foglalja, ezért a kihangosítós tartalékot másik eszközön érdemes futtatni.

## Eszközön / fejlesztői fiókkal ellenőrizendő
- `appleTeamId`, aláírás a `.share` targethez, App Group a provisioning profile-ban.
- Valódi iOS 18 hívásfelvétel → Jegyzetek → Megosztás: milyen típus jön, és látszik-e a Business Flow a listában (E-CALL-09).

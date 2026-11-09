import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Card, Label, Screen } from '@/ui/components';
import { S, T } from '@/ui/theme';

const STEPS: [string, string][] = [
  ['Feltétel', 'iPhone XS vagy újabb, iOS 18.1 vagy újabb. A hívásrögzítés nem minden országban és nyelven érhető el. Ha nem látod a gombot, használd a kihangosítós tartalékot.'],
  ['1. Hívás közben', 'A Telefon appban hívás közben koppints a bal felső felvétel gombra (hullámforma ikon), majd a Rögzítésre.'],
  ['2. A másik fél értesül', 'Az iOS hangosan bejelenti mindkét félnek, hogy a hívást rögzítik. Ezt az alkalmazás nem kerülheti meg. Kérd a másik fél hozzájárulását.'],
  ['3. Leállítás', 'Koppints a Leállítás gombra, vagy tedd le a hívást. A felvétel és (támogatott nyelven) az átirat a Jegyzetek app „Hívásfelvételek” mappájába kerül.'],
  ['4. Megosztás a Business Flow-val', 'A Jegyzetekben nyisd meg a felvételt → ⋯ / Megosztás → Business Flow. Hang esetén: a felvételen hosszan nyomva „Hang mentése a Fájlokba”, majd itt a „Fájl importálása”. Az átiratot kijelölheted, és beillesztheted is.'],
  ['5. Feldolgozás', 'Az app átírja a hangot, szétválasztja a beszélőket (ahol lehet), és összefoglalót, döntéseket, teendőket készít a saját API-kulcsoddal. Semmi nem megy más szolgáltatóhoz.'],
];

export default function Guide() {
  return (
    <Screen title="Hívás rögzítése" subtitle="iOS 18 natív hívásrögzítés → Jegyzetek → Business Flow" right={<Button small kind="ghost" title="Bezár" onPress={() => router.back()} />}>
      {STEPS.map(([t, d]) => (
        <Card key={t} style={{ marginTop: S.x3 }}>
          <Label>{t}</Label>
          <Text style={[T.body, { marginTop: 6 }]}>{d}</Text>
        </Card>
      ))}
      <View style={{ marginTop: S.x5 }}>
        <Text style={T.small}>Az Apple semmilyen appnak nem ad hozzáférést a hívás hangjához, ezért a rögzítés mindig a Telefon appban történik. Magyarországon a beszélgetés rögzítéséhez a másik fél tájékoztatása szükséges.</Text>
      </View>
    </Screen>
  );
}

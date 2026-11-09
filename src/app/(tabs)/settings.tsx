import { router } from 'expo-router';
import { Linking, Text, View } from 'react-native';

import { languageLabels, retentionLabels, sessionTimeoutLabels, type DictationLanguage, type HistoryRetention, type SessionTimeout } from '@/engine/types';
import { updateSettings, useApp } from '@/state/store';
import { ApiKeyCard } from '@/ui/ApiKeyCard';
import { ProviderSettings } from '@/ui/ProviderSettings';
import { Label, Row, Screen, Section, Segmented, ToggleRow } from '@/ui/components';
import { S, T } from '@/ui/theme';

export default function Settings() {
  const s = useApp((x) => x.settings);
  return (
    <Screen title="Beállítások">
      <ApiKeyCard />
      <ProviderSettings />
      <View style={{ marginTop: S.x6 }}>
        <Label style={{ marginBottom: S.x2 }}>Nyelv</Label>
        <Segmented<DictationLanguage> options={(['auto', 'hu', 'en'] as const).map((v) => ({ value: v, label: v === 'auto' ? 'Auto (hu+en)' : languageLabels[v] }))} value={s.language} onChange={(language) => updateSettings({ language })} />
      </View>
      <View style={{ marginTop: S.x6 }}>
        <Label style={{ marginBottom: S.x2 }}>Flow kikapcsolása ennyi tétlenség után</Label>
        <Segmented<SessionTimeout> options={(['never', 'h1', 'm15', 'm5', 'immediately'] as const).map((v) => ({ value: v, label: sessionTimeoutLabels[v] }))} value={s.sessionTimeout} onChange={(sessionTimeout) => updateSettings({ sessionTimeout })} />
        <Text style={[T.small, { marginTop: 6 }]}>Amíg a Flow be van kapcsolva, a mikrofon-munkamenet a háttérben fut (narancs/zöld jelző), így a billentyűzetről azonnal indul a diktálás.</Text>
      </View>
      <Section label="Szöveg">
        <ToggleRow title="Okos formázás (LLM)" detail="Javítások, listák, hosszabb szövegek rendezése." value={s.smartFormatting} onChange={(smartFormatting) => updateSettings({ smartFormatting })} />
        <ToggleRow title="Töltelékszavak eltávolítása" detail="öö, hát, szóval, um…" value={s.removeFillers} onChange={(removeFillers) => updateSettings({ removeFillers })} />
        <ToggleRow title="Hangparancsok" detail="„új sor”, „pont”, „vessző”, „töröld az utolsó mondatot”…" value={s.voiceCommands} onChange={(voiceCommands) => updateSettings({ voiceCommands })} />
        <ToggleRow title="Környezet figyelembevétele" detail="A kurzor előtti szöveg alapján folytatja a mondatot." value={s.contextAwareness} onChange={(contextAwareness) => updateSettings({ contextAwareness })} last />
      </Section>
      <Section label="Billentyűzet">
        <ToggleRow title="Haptika" detail="Finom rezgés indításkor és beillesztéskor. Alapból ki." value={s.haptics} onChange={(haptics) => updateSettings({ haptics })} />
        <ToggleRow title="Hangok" detail="Nagyon halk jelzés a felvétel indításakor és végén. Alapból ki." value={s.sounds} onChange={(sounds) => updateSettings({ sounds })} />
        <Row title="Billentyűzet beállítása" detail="Hozzáadás, teljes hozzáférés, mikrofon" onPress={() => router.push('/onboarding')} />
        <Row title="iOS beállítások megnyitása" onPress={() => void Linking.openSettings()} last />
      </Section>
      {s.sounds ? (
        <View style={{ marginTop: S.x6 }}>
          <Label style={{ marginBottom: S.x2 }}>Hangerő</Label>
          <Segmented<string> options={[{ value: '0.08', label: 'Suttogás' }, { value: '0.15', label: 'Halk' }, { value: '0.3', label: 'Közepes' }]} value={String(s.soundVolume)} onChange={(v) => updateSettings({ soundVolume: Number(v) })} />
        </View>
      ) : null}
      <View style={{ marginTop: S.x6 }}>
        <Label style={{ marginBottom: S.x2 }}>Előzmények megőrzése</Label>
        <Segmented<HistoryRetention> options={(['forever', 'days30', 'days7', 'never'] as const).map((v) => ({ value: v, label: retentionLabels[v] }))} value={s.retention} onChange={(retention) => updateSettings({ retention })} />
      </View>
      <Section label="Adatvédelem">
        <Row title="A hang csak az átíráshoz megy a választott szolgáltatóhoz" detail="A saját kulcsoddal, közvetlenül. Ha az átírás nem sikerül, a felvétel a telefonon marad, és csak az Újra küldi el újra. Az előzmények csak ezen a telefonon vannak." last />
      </Section>
      <Text style={[T.label, { marginTop: S.x8, textAlign: 'center' }]}>Business Flow iOS 0.4.1 · businessnative</Text>
    </Screen>
  );
}

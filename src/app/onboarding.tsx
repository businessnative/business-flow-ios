import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Text, TextInput, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import FlowSession from '../../modules/flow-session';
import { useSetupStatus } from '@/state/setup';
import { updateSettings } from '@/state/store';
import { ApiKeyCard } from '@/ui/ApiKeyCard';
import { Button, Card, Label } from '@/ui/components';
import { Icon } from '@/ui/Icon';
import { C, R, S, T } from '@/ui/theme';

type Step = 'welcome' | 'keyboard' | 'fullAccess' | 'mic' | 'key' | 'try';
const steps: Step[] = ['welcome', 'keyboard', 'fullAccess', 'mic', 'key', 'try'];

export default function Onboarding() {
  const st = useSetupStatus();
  const [step, setStep] = useState<Step>('welcome');
  const [tryText, setTryText] = useState('');
  const i = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(i + 1, steps.length - 1)]);
  // Advance automatically as soon as iOS reports the step done (keyboard added, Full Access seen, mic granted).
  const stepDone = (step === 'keyboard' && st.keyboard) || (step === 'fullAccess' && st.fullAccess) || (step === 'mic' && st.mic === 'granted') || (step === 'key' && st.keysReady && st.apiKey);
  useEffect(() => {
    if (!stepDone) return;
    const t = setTimeout(() => setStep((cur) => (cur === step ? steps[Math.min(steps.indexOf(cur) + 1, steps.length - 1)] : cur)), 700);
    return () => clearTimeout(t);
  }, [stepDone, step]);
  const finish = () => {
    updateSettings({ onboardingDone: true });
    router.replace('/home');
  };

  const body = (() => {
    switch (step) {
      case 'welcome':
        return (
          <>
            <Text style={T.h1}>Beszélj, ne gépelj.</Text>
            <Text style={[T.body, { marginTop: S.x3 }]}>A Business Flow billentyűzettel bármelyik appban diktálhatsz — magyarul és angolul, a te stílusodban, tisztán formázva.</Text>
          </>
        );
      case 'keyboard':
        return (
          <>
            <Text style={T.h1}>Add hozzá a billentyűzetet</Text>
            <Steps items={['Beállítások → Business Flow', 'Billentyűzetek', 'Kapcsold be: Business Flow']} />
            <Status ok={st.keyboard} okText="A billentyűzet hozzáadva." waitText="Várakozás… (az app automatikusan észleli)" />
          </>
        );
      case 'fullAccess':
        return (
          <>
            <Text style={T.h1}>Teljes hozzáférés</Text>
            <Text style={[T.body, { marginTop: S.x3 }]}>Ez kell ahhoz, hogy a billentyűzet szólhasson a Business Flow appnak (a mikrofon az appban fut). Gépelt szöveget nem gyűjtünk.</Text>
            <Steps items={['Beállítások → Business Flow → Billentyűzetek', 'Kapcsold be: Teljes hozzáférés engedélyezése', 'Gyere vissza, és válts a Business Flow billentyűzetre lent']} />
            <TextInput placeholder="Koppints ide, és válts a 🌐 gombbal" placeholderTextColor={C.text32} keyboardAppearance="dark" style={{ marginTop: S.x4, borderWidth: 1, borderColor: C.text16, borderRadius: R.md, padding: 12, color: C.text }} />
            <Status ok={st.fullAccess} okText="Teljes hozzáférés észlelve." waitText="Nyisd meg egyszer a billentyűzetet a fenti mezőben." />
          </>
        );
      case 'mic':
        return (
          <>
            <Text style={T.h1}>Mikrofon</Text>
            <Text style={[T.body, { marginTop: S.x3 }]}>A felvétel ebben az appban készül, a háttérben is (amíg a Flow be van kapcsolva).</Text>
            <View style={{ marginTop: S.x5 }}>
              {st.mic === 'granted' ? <Status ok okText="Mikrofon engedélyezve." waitText="" /> : st.mic === 'denied' ? (
                <Button title="Engedélyezés a Beállításokban" onPress={() => void Linking.openSettings()} />
              ) : (
                <Button title="Mikrofon engedélyezése" icon="mic" onPress={() => void FlowSession.requestMicPermission()} />
              )}
            </View>
          </>
        );
      case 'key':
        return (
          <>
            <Text style={T.h1}>OpenAI-kulcs</Text>
            <Text style={[T.body, { marginTop: S.x3, marginBottom: S.x4 }]}>Az átírás és a formázás a saját OpenAI-kulcsoddal fut, közvetlenül. Később a Beállításokban is megadhatod.</Text>
            <ApiKeyCard />
          </>
        );
      case 'try':
        return (
          <>
            <Text style={T.h1}>Próbáld ki</Text>
            <Text style={[T.body, { marginTop: S.x3 }]}>Koppints a mezőbe, válts a Business Flow billentyűzetre, koppints a mikrofonra és mondd: „Szia, holnap tízkor tudok jönni.”</Text>
            <TextInput value={tryText} onChangeText={setTryText} multiline placeholder="Ide diktálj…" placeholderTextColor={C.text32} keyboardAppearance="dark"
              style={{ marginTop: S.x4, minHeight: 120, borderWidth: 1, borderColor: C.text16, borderRadius: R.md, padding: 12, color: C.text, textAlignVertical: 'top' }} />
          </>
        );
    }
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.base }}>
      <View style={{ flex: 1, padding: S.x6 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: S.x8 }}>
          {steps.map((s, k) => <View key={s} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: k <= i ? C.accent : C.text16 }} />)}
        </View>
        <Label style={{ marginBottom: S.x3 }}>{i + 1} / {steps.length}</Label>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: S.x4 }} showsVerticalScrollIndicator={false}>{body}</ScrollView>
        <View style={{ gap: S.x2 }}>
          {step === 'keyboard' || step === 'fullAccess' ? <Button kind="secondary" title="Beállítások megnyitása" onPress={() => void Linking.openSettings()} /> : null}
          {step === 'try' ? <Button title="Kész" onPress={finish} /> : <Button title={i === 0 ? 'Kezdjük' : 'Tovább'} onPress={next} />}
          {i > 0 && step !== 'try' ? <Button kind="ghost" title="Később" onPress={finish} /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <Card style={{ marginTop: S.x5 }}>
      {items.map((t, k) => (
        <View key={t} style={{ flexDirection: 'row', gap: S.x3, paddingVertical: 8 }}>
          <Text style={[T.label, { color: C.accent, width: 16 }]}>{k + 1}</Text>
          <Text style={[T.body, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
    </Card>
  );
}

function Status({ ok, okText, waitText }: { ok: boolean; okText: string; waitText: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.x2, marginTop: S.x4 }}>
      {ok ? <Icon name="check" size={18} color={C.success} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.warning }} />}
      <Text style={[T.small, ok && { color: C.success }]}>{ok ? okText : waitText}</Text>
    </View>
  );
}

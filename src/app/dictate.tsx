// Deep link target (businessflow://dictate) — the keyboard opens this when the Flow session is off.
// Starts the session + the pending recording, then the user swipes back to the previous app (like Wispr's "Flow is on").
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { appDictationToggle, cancel, ensureSession, retryLast, runPendingCommand, stop, useSession } from '@/session/controller';
import { FlowBar } from '@/ui/FlowBar';
import { Button, Label } from '@/ui/components';
import { C, S, T } from '@/ui/theme';

export default function Dictate() {
  const params = useLocalSearchParams<{ id?: string; retry?: string; app?: string }>();
  const v = useSession((x) => x);
  const [started, setStarted] = useState<boolean | null>(null);
  useEffect(() => {
    void (async () => {
      if (params.retry) {
        await ensureSession();
        await retryLast();
        return setStarted(true);
      }
      if (params.app) {
        // Widget tap: dictate inside the app (copy from History / share afterwards).
        await appDictationToggle();
        return setStarted(true);
      }
      const ran = await runPendingCommand();
      if (!ran) await ensureSession();
      setStarted(ran);
    })();
  }, [params.retry, params.app]);

  const recording = v.phase === 'recording' || v.phase === 'starting';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.base }}>
      <View style={{ flex: 1, padding: S.x6, justifyContent: 'center', alignItems: 'center' }}>
        <Label style={{ color: v.sessionOn ? C.success : C.text48 }}>{v.sessionOn ? 'Flow be van kapcsolva' : 'Indítás…'}</Label>
        <Text style={[T.h1, { textAlign: 'center', marginTop: S.x3 }]}>
          {recording ? 'Figyelek — beszélj nyugodtan' : v.phase === 'processing' ? 'Feldolgozás…' : v.phase === 'error' ? 'Hiba' : v.phase === 'done' ? 'Kész' : 'Diktálás'}
        </Text>
        <Text style={[T.body, { textAlign: 'center', marginTop: S.x3, maxWidth: 320 }]}>
          {v.phase === 'error' ? v.error : 'Húzd vissza az előző appba (bal felső sarok vagy a lenti sáv) — a felvétel fut, a szöveg a kurzorhoz kerül.'}
        </Text>
        <View style={{ marginTop: S.x8 }}>
          <FlowBar phase={v.phase} level={v.level} mode={v.mode} onPress={() => void (recording ? stop() : cancel())} onStop={() => void stop()} onCancel={cancel} />
        </View>
        {started === false && !recording ? <Text style={[T.small, { marginTop: S.x5 }]}>Nem volt függő diktálás — a Flow most be van kapcsolva, koppints újra a billentyűzeten.</Text> : null}
      </View>
      <View style={{ padding: S.x6 }}>
        <Button kind="secondary" title="Business Flow megnyitása" onPress={() => router.replace('/home')} />
      </View>
    </SafeAreaView>
  );
}

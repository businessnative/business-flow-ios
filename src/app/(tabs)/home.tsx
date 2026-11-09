import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { textWordCount } from '@/engine/pipeline';
import { appDictationToggle, cancel, endSession, ensureSession, stop, useSession } from '@/session/controller';
import { useSetupStatus } from '@/state/setup';
import { useApp } from '@/state/store';
import { FlowBar } from '@/ui/FlowBar';
import { Button, Card, Label, Row, Screen, Section } from '@/ui/components';
import { Icon } from '@/ui/Icon';
import { C, F, S, T } from '@/ui/theme';

export default function Home() {
  const session = useSession((v) => v);
  const history = useApp((s) => s.history);
  const setup = useSetupStatus();
  const [openedAt] = useState(() => Date.now());
  const stats = useMemo(() => {
    const week = openedAt - 7 * 86400e3;
    const ok = history.filter((h) => !h.error);
    const words = ok.reduce((n, h) => n + textWordCount(h.text), 0);
    const weekWords = ok.filter((h) => h.date > week).reduce((n, h) => n + textWordCount(h.text), 0);
    const secs = ok.reduce((n, h) => n + h.durationSeconds, 0);
    return { words, weekWords, count: ok.length, wpm: secs > 0 ? Math.round(words / (secs / 60)) : 0 };
  }, [history, openedAt]);
  const inApp = session.source === 'app';
  const setupGaps = [!setup.keyboard && 'billentyűzet', !setup.fullAccess && 'teljes hozzáférés', setup.mic !== 'granted' && 'mikrofon', setup.keysReady && !setup.apiKey && 'API-kulcs'].filter(Boolean);

  return (
    <Screen title="Business Flow" subtitle="Diktálj bármelyik appba a Business Flow billentyűzettel.">
      <Card accent={session.sessionOn}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.x3 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: session.sessionOn ? C.success : C.text32 }} />
          <View style={{ flex: 1 }}>
            <Text style={T.h2}>{session.sessionOn ? 'Flow be van kapcsolva' : 'Flow ki van kapcsolva'}</Text>
            <Text style={[T.small, { marginTop: 2 }]}>
              {session.sessionOn ? 'A billentyűzet mikrofonja azonnal indul. Visszaléphetsz az előző appba.' : 'A billentyűzet első koppintásra bekapcsolja (megnyitja ezt az appot).'}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: S.x4 }}>
          <Button kind={session.sessionOn ? 'secondary' : 'primary'} title={session.sessionOn ? 'Flow kikapcsolása' : 'Flow bekapcsolása'} onPress={() => void (session.sessionOn ? endSession() : ensureSession())} />
        </View>
      </Card>

      {setupGaps.length ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/onboarding')}>
          <Card style={{ marginTop: S.x4, borderColor: C.warning }}>
            <Label style={{ color: C.warning }}>Beállítás hiányos</Label>
            <Text style={[T.body, { marginTop: 6 }]}>{setupGaps.join(' · ')}</Text>
            <Text style={[T.small, { marginTop: 4 }]}>Koppints a beállítás befejezéséhez.</Text>
          </Card>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => router.push('/calls')}>
        <Card style={{ marginTop: S.x4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.x3 }}>
            <Icon name="phone" size={20} />
            <View style={{ flex: 1 }}>
              <Text style={T.body}>Hívás-jegyzetek</Text>
              <Text style={T.small}>Rögzített hívásból összefoglaló, teendők, beszélők.</Text>
            </View>
          </View>
        </Card>
      </Pressable>

      <Section label="Diktálás itt">
        <View style={{ paddingVertical: S.x5, alignItems: 'center' }}>
          <FlowBar phase={inApp ? session.phase : 'idle'} level={session.level} mode={session.mode} onPress={() => void appDictationToggle()} onStop={() => void stop()} onCancel={cancel} />
          <Text style={[T.small, { marginTop: S.x3, textAlign: 'center' }]}>
            {inApp && session.phase === 'recording' ? 'Figyelek… koppints a ✓-re, ha végeztél.' : inApp && session.phase === 'error' ? session.error : 'Koppints a sávra, és mondd el, amit leírnál.'}
          </Text>
          {inApp && session.lastText ? (
            <View style={{ alignSelf: 'stretch', marginTop: S.x4, backgroundColor: C.base, borderRadius: 8, padding: S.x3, borderWidth: 1, borderColor: C.text08 }}>
              {session.phase === 'error' ? <Label style={{ marginBottom: 6 }}>A szöveg megvan, innen kimásolhatod.</Label> : null}
              <Text style={T.body} selectable>{session.lastText}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Másolás" onPress={() => void Clipboard.setStringAsync(session.lastText ?? '')} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: S.x2 }}>
                <Icon name="copy" size={14} color={C.text64} />
                <Text style={[T.small, { fontFamily: F.medium }]}>Másolás</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Section>

      <View style={{ flexDirection: 'row', gap: S.x3, marginTop: S.x6 }}>
        {[
          ['Szó a héten', stats.weekWords],
          ['Diktálás', stats.count],
          ['Szó / perc', stats.wpm],
        ].map(([l, v]) => (
          <Card key={String(l)} style={{ flex: 1, padding: S.x3 }}>
            <Text style={[T.h2, { fontFamily: F.semibold }]}>{String(v)}</Text>
            <Label style={{ marginTop: 4, fontSize: 9 }}>{String(l)}</Label>
          </Card>
        ))}
      </View>

      <Section label="Hogyan működik">
        <Row icon="keyboard" title="Válts a Business Flow billentyűzetre" detail="Bármelyik szövegmezőben a 🌐 gombbal." />
        <Row icon="mic" title="Koppints: kihangosított mód" detail="Koppints a ✓-re a beillesztéshez, ✕ a megszakításhoz." />
        <Row icon="zap" title="Tartsd nyomva: push-to-talk" detail="Engedd el, és a szöveg bekerül." last />
      </Section>
    </Screen>
  );
}

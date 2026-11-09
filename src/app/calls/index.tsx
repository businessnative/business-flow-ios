import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatTime, type CallNote } from '@/calls/core';
import { pickAndImport } from '@/calls/importFile';
import { addTranscript, importInbox, loadCalls, useCalls } from '@/calls/store';
import { Button, Card, Input, Label, Pill, Screen, Section } from '@/ui/components';
import { C, S, T } from '@/ui/theme';

const METHOD: Record<CallNote['speakerMethod'], string> = { diarize: 'beszélők hangból', llm: 'beszélők szövegből (becslés)', notes: 'beszélők a leiratból', none: 'beszélők nélkül' };

export default function Calls() {
  const calls = useCalls((c) => c);
  const [msg, setMsg] = useState<string | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  useEffect(() => {
    void loadCalls().then(importInbox).then((n) => n && setMsg(`${n} megosztott elem importálva.`));
  }, []);
  const pick = async () => {
    setMsg(null);
    try {
      const id = await pickAndImport();
      if (id) router.push(`/calls/${id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Nem sikerült az importálás.');
    }
  };
  return (
    <Screen title="Hívás-jegyzetek" subtitle="Felvett hívásból átirat, beszélők, összefoglaló és teendők." right={<Button small kind="ghost" title="Bezár" onPress={() => router.back()} />}>
      <Card accent>
        <Text style={T.body}>Az iPhone Telefon appjában rögzített hívás (iOS 18.1+) a Jegyzetekbe kerül. Onnan oszd meg a Business Flow-val, vagy importáld fájlként.</Text>
        <View style={{ gap: S.x2, marginTop: S.x3 }}>
          <Button title="Hogyan rögzítsek hívást?" icon="book" kind="secondary" onPress={() => router.push('/calls/guide')} />
          <Button title="Fájl importálása" icon="plus" onPress={() => void pick()} />
          <Button title="Leirat beillesztése" icon="copy" kind="secondary" onPress={() => setPaste(paste === null ? '' : null)} />
          <Button title="Felvétel kihangosítva (tartalék)" icon="mic" kind="ghost" onPress={() => router.push('/calls/record')} />
        </View>
        {paste !== null ? (
          <View style={{ marginTop: S.x3 }}>
            <Input multiline value={paste} onChangeText={setPaste} placeholder="Illeszd be a hívás leiratát (pl. a Jegyzetekből)…" style={{ minHeight: 120 }} />
            <View style={{ marginTop: S.x2 }}>
              <Button title="Feldolgozás" disabled={!paste.trim()} onPress={() => { const id = addTranscript(paste); setPaste(null); router.push(`/calls/${id}`); }} />
            </View>
          </View>
        ) : null}
        {msg ? <Text style={[T.small, { marginTop: S.x3 }]}>{msg}</Text> : null}
      </Card>
      <Section label={`Jegyzetek (${calls.length})`}>
        {calls.length === 0 ? <Text style={[T.small, { padding: S.x4 }]}>Még nincs hívás-jegyzet.</Text> : null}
        {calls.map((c) => (
          <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push(`/calls/${c.id}`)} style={{ padding: S.x4, borderBottomWidth: 1, borderColor: C.text08 }}>
            <Text style={T.body} numberOfLines={1}>{c.summary?.title || c.fileName || 'Hívás'}</Text>
            <View style={{ flexDirection: 'row', gap: S.x2, marginTop: 4, flexWrap: 'wrap' }}>
              <Label>{new Date(c.date).toLocaleString('hu-HU')}</Label>
              {c.durationSeconds ? <Label>{formatTime(c.durationSeconds)}</Label> : null}
              {c.status === 'processing' ? <Pill text="Feldolgozás…" color={C.accent} /> : c.status === 'error' ? <Pill text="Sikertelen" color={C.error} /> : c.status === 'interrupted' ? <Pill text="Megszakadt" color={C.warning} /> : c.status === 'empty' ? <Pill text="Üres" color={C.warning} /> : <Pill text={METHOD[c.speakerMethod]} />}
              {c.error && c.status !== 'done' && c.status !== 'processing' ? <Text style={[T.small, { color: C.error, width: '100%' }]} numberOfLines={2}>{c.error}</Text> : null}
              {c.source === 'speakerphone' ? <Pill text="kihangosított felvétel" color={C.warning} /> : null}
            </View>
          </Pressable>
        ))}
      </Section>
    </Screen>
  );
}

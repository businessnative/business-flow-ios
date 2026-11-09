import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { callCanRetry, callCopyText, displayName, formatTime, speakerCount } from '@/calls/core';
import { cancel, removeCall, renameSpeaker, retry, useCalls } from '@/calls/store';
import { Button, Card, Input, Label, Pill } from '@/ui/components';
import { C, S, T } from '@/ui/theme';

const List = ({ title, items }: { title: string; items: string[] }) =>
  items.length ? (
    <>
      <Label style={{ marginTop: S.x4 }}>{title}</Label>
      {items.map((x, i) => <Text key={i} style={[T.body, { marginTop: 4 }]} selectable>• {x}</Text>)}
    </>
  ) : null;

export default function CallDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const n = useCalls((c) => c.find((x) => x.id === id));
  const [edit, setEdit] = useState(false);
  if (!n) return <SafeAreaView style={{ flex: 1, backgroundColor: C.base }} />;
  const speakers = [...new Set(n.segments.map((s) => s.speaker))];
  const s = n.summary;
  const problem = n.status === 'error' || n.status === 'interrupted' || n.status === 'empty';
  const copyText = callCopyText(n);
  const retryable = callCanRetry(n);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.base }}>
      <ScrollView contentContainerStyle={{ padding: S.x5, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label>{new Date(n.date).toLocaleString('hu-HU')}{n.durationSeconds ? ` · ${formatTime(n.durationSeconds)}` : ''}</Label>
          <Button small kind="ghost" title="Bezár" onPress={() => router.back()} />
        </View>
        {n.source === 'speakerphone' ? <View style={{ marginTop: S.x2 }}><Pill text="Kihangosítóval, mikrofonnal rögzítve – gyengébb minőség" color={C.warning} /></View> : null}
        {n.status === 'processing' ? (
          <Card style={{ marginTop: S.x4 }}>
            <Text style={T.body}>Feldolgozás… (átírás, beszélők, összefoglaló). Hosszabb hívásnál pár perc is lehet.</Text>
            <View style={{ marginTop: S.x3 }}><Button kind="secondary" title="Megszakítás" onPress={() => cancel(n.id)} /></View>
          </Card>
        ) : problem ? (
          <Card style={{ marginTop: S.x4, borderColor: n.status === 'error' ? C.error : C.warning }}>
            <Text style={[T.body, { color: n.status === 'error' ? C.error : C.warning }]}>{n.error}</Text>
            {retryable ? <View style={{ marginTop: S.x3 }}><Button title="Újra" icon="refresh" onPress={() => void retry(n.id)} /></View> : null}
          </Card>
        ) : null}
        {s ? (
          <Card style={{ marginTop: S.x4 }}>
            <Text style={T.h2}>{s.title}</Text>
            {!n.summaryByLLM ? <Text style={[T.small, { marginTop: 4, color: C.warning }]}>Egyszerű, kulcs nélküli összefoglaló. API-kulccsal pontosabb.</Text> : null}
            <Text style={[T.body, { marginTop: S.x2 }]} selectable>{s.summary}</Text>
            <List title="Döntések" items={s.decisions} />
            <List title="Teendők" items={s.todos} />
            <List title="Követés" items={s.followUps} />
            <List title="Fontos adatok" items={s.keyFacts} />
          </Card>
        ) : null}
        {copyText ? (
          <View style={{ flexDirection: 'row', gap: S.x3, marginTop: S.x4 }}>
            <View style={{ flex: 1 }}><Button title="Másolás" icon="copy" onPress={() => void Clipboard.setStringAsync(copyText)} /></View>
            <View style={{ flex: 1 }}><Button kind="secondary" title="Megosztás" onPress={() => void Share.share({ message: copyText })} /></View>
          </View>
        ) : null}
        {speakerCount(n.segments) > 1 ? (
          <Card style={{ marginTop: S.x4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Label>Beszélők · {n.speakerMethod === 'diarize' ? 'hangból' : n.speakerMethod === 'llm' ? 'szövegből becsülve' : 'a leiratból'}</Label>
              <Button small kind="ghost" title={edit ? 'Kész' : 'Átnevezés'} onPress={() => setEdit(!edit)} />
            </View>
            {edit ? speakers.map((sp) => <View key={sp} style={{ marginTop: S.x2 }}><Input label={sp} defaultValue={n.speakerNames[sp] ?? ''} placeholder={displayName(n, sp)} onEndEditing={(e) => renameSpeaker(n.id, sp, e.nativeEvent.text)} /></View>) : null}
          </Card>
        ) : null}
        {n.segments.length ? (
          <Card style={{ marginTop: S.x4 }}>
            <Label>Átirat</Label>
            {n.segments.map((g, i) => (
              <View key={i} style={{ marginTop: S.x3 }}>
                {speakerCount(n.segments) > 1 ? <Text style={[T.small, { color: C.accent }]}>{displayName(n, g.speaker)}{g.start !== undefined ? ` · ${formatTime(g.start)}` : ''}</Text> : null}
                <Text style={T.body} selectable>{g.text}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        <View style={{ marginTop: S.x8 }}>
          <Button kind="danger" icon="trash" title="Törlés" onPress={() => { removeCall(n.id); router.back(); }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

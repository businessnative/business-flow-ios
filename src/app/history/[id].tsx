import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { polishPrompt } from '@/engine/prompts';
import { allPolishPresets } from '@/engine/types';
import { retryHistoryItem } from '@/session/controller';
import { OpenAIError } from '@/services/openai';
import { chatAny } from '@/services/providers';
import { readAllKeys } from '@/state/keychain';
import { addPolished, removeHistory, useApp } from '@/state/store';
import { Button, Card, Label } from '@/ui/components';
import { C, S, T } from '@/ui/theme';

export default function HistoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useApp((s) => s.history.find((h) => h.id === id));
  const settings = useApp((s) => s.settings);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!item) return <SafeAreaView style={{ flex: 1, backgroundColor: C.base }} />;

  const polish = async (presetId: string) => {
    const p = allPolishPresets(settings).find((x) => x.id === presetId);
    if (!p) return;
    setBusy(presetId);
    setMsg(null);
    try {
      const text = await chatAny(settings, (await readAllKeys()).keys, polishPrompt(p.prompt), item.text);
      addPolished(item, text);
      await Clipboard.setStringAsync(text);
      setMsg(`${p.name}: kész, a vágólapra másolva és az Előzményekbe mentve.`);
    } catch (e) {
      setMsg(e instanceof OpenAIError ? e.message : 'Nem sikerült.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.base }}>
      <ScrollView contentContainerStyle={{ padding: S.x5, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label>{new Date(item.date).toLocaleString('hu-HU')}</Label>
          <Button small kind="ghost" title="Bezár" onPress={() => router.back()} />
        </View>
        {item.error ? (
          <Card style={{ marginTop: S.x4, borderColor: C.error }}>
            <Text style={[T.body, { color: C.error }]}>{item.error}</Text>
            {item.audioUri ? <View style={{ marginTop: S.x3 }}><Button title="Újrapróbálás" icon="refresh" onPress={() => void retryHistoryItem(item)} /></View> : null}
          </Card>
        ) : (
          <Card style={{ marginTop: S.x4 }}>
            <Text style={[T.body, { fontSize: 17, lineHeight: 25 }]} selectable>{item.text}</Text>
            {item.rawText && item.rawText !== item.text ? (
              <>
                <Label style={{ marginTop: S.x4 }}>{item.kind === 'polish' ? 'Eredeti' : 'Nyers átirat'}</Label>
                <Text style={[T.small, { marginTop: 4 }]} selectable>{item.rawText}</Text>
              </>
            ) : null}
          </Card>
        )}
        {!item.error ? (
          <>
            <View style={{ flexDirection: 'row', gap: S.x3, marginTop: S.x4 }}>
              <View style={{ flex: 1 }}><Button title="Másolás" icon="copy" onPress={() => void Clipboard.setStringAsync(item.text)} /></View>
            </View>
            <Label style={{ marginTop: S.x6, marginBottom: S.x2 }}>Csiszolás (LLM)</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.x2 }}>
              {allPolishPresets(settings).map((p) => (
                <Button key={p.id} small kind="secondary" icon="wand" title={busy === p.id ? 'Dolgozom…' : p.name} disabled={!!busy} onPress={() => void polish(p.id)} />
              ))}
            </View>
            {msg ? <Text style={[T.small, { marginTop: S.x3 }]}>{msg}</Text> : null}
          </>
        ) : null}
        <View style={{ marginTop: S.x8 }}>
          <Button kind="danger" icon="trash" title="Törlés" onPress={() => { removeHistory(item.id); router.back(); }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { polishPrompt } from '@/engine/prompts';
import { allPolishPresets } from '@/engine/types';
import { canCopy, canRetry, historyReason, historyStatus, historyStatusLabel, recoverableText } from '@/history/recovery';
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
  const status = historyStatus(item);
  const reason = historyReason(item);
  const text = recoverableText(item);
  const label = historyStatusLabel[status];
  const copy = canCopy(item);
  const retry = canRetry(item);

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
        {reason ? (
          <Card style={{ marginTop: S.x4, borderColor: status === 'missed' ? C.warning : C.error }}>
            {label ? <Label style={{ color: status === 'missed' ? C.warning : C.error, marginBottom: 6 }}>{label}</Label> : null}
            <Text style={[T.body, { color: status === 'missed' ? C.warning : C.error }]}>{reason}</Text>
            {retry ? <View style={{ marginTop: S.x3 }}><Button title="Újrapróbálás" icon="refresh" onPress={() => void retryHistoryItem(item)} /></View> : null}
          </Card>
        ) : null}
        {text ? (
          <Card style={{ marginTop: S.x4 }}>
            <Text style={[T.body, { fontSize: 17, lineHeight: 25 }]} selectable>{text}</Text>
            {item.rawText && item.rawText !== text ? (
              <>
                <Label style={{ marginTop: S.x4 }}>{item.kind === 'polish' ? 'Eredeti' : 'Nyers átirat'}</Label>
                <Text style={[T.small, { marginTop: 4 }]} selectable>{item.rawText}</Text>
              </>
            ) : null}
          </Card>
        ) : null}
        {copy ? (
          <View style={{ flexDirection: 'row', gap: S.x3, marginTop: S.x4 }}>
            <View style={{ flex: 1 }}><Button title="Másolás" icon="copy" onPress={() => void Clipboard.setStringAsync(text)} /></View>
          </View>
        ) : null}
        {text && (status === 'success' || status === 'missed') ? (
          <>
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

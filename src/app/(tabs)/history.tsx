import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { filterHistory } from '@/engine/editing';
import { canCopy, canRetry, historyReason, historyStatus, historyStatusLabel, recoverableText } from '@/history/recovery';
import { categoryLabels } from '@/engine/types';
import { retryHistoryItem } from '@/session/controller';
import { clearHistory, syncInsertAcks, useApp } from '@/state/store';
import { Button, Card, Input, Label, Pill, Screen } from '@/ui/components';
import { C, S, T } from '@/ui/theme';

const fmt = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === today.toDateString() ? `Ma ${hm}` : `${d.getMonth() + 1}. ${d.getDate()}. ${hm}`;
};

export default function History() {
  const history = useApp((s) => s.history);
  const [q, setQ] = useState('');
  const items = useMemo(() => filterHistory(history, q), [history, q]);
  useFocusEffect(useCallback(() => { syncInsertAcks(); }, []));
  return (
    <Screen title="Előzmények" subtitle="Minden diktálás itt marad meg — a sikertelenek is, újrapróbálhatók."
      right={history.length ? <Button small kind="ghost" title="Törlés" onPress={() => Alert.alert('Előzmények törlése', 'Biztosan törlöd az összes előzményt?', [{ text: 'Mégse', style: 'cancel' }, { text: 'Törlés', style: 'destructive', onPress: clearHistory }])} /> : null}>
      <Input placeholder="Keresés az előzményekben" value={q} onChangeText={setQ} autoCorrect={false} />
      <View style={{ marginTop: S.x4, gap: S.x3 }}>
        {items.length === 0 ? (
          <Card><Text style={T.small}>{q ? 'Nincs találat.' : 'Még nincs diktálás. Próbáld ki a Kezdőlapon vagy a billentyűzettel.'}</Text></Card>
        ) : (
          items.map((h) => {
            const status = historyStatus(h);
            const reason = historyReason(h);
            const text = recoverableText(h);
            const label = historyStatusLabel[status];
            const retry = canRetry(h);
            const copy = canCopy(h);
            return (
            <Card key={h.id} style={status !== 'success' ? { borderColor: status === 'missed' ? C.warning : C.error } : undefined}>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/history/[id]', params: { id: h.id } })}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, gap: S.x2 }}>
                  <Label>{fmt(h.date)} · {categoryLabels[h.category].split(' ')[0]}{h.kind === 'polish' ? ' · csiszolt' : ''}</Label>
                  <Label>{Math.round(h.durationSeconds)} mp</Label>
                </View>
                {label ? <View style={{ marginBottom: 6 }}><Pill text={label} color={status === 'missed' ? C.warning : C.error} /></View> : null}
                {text ? <Text style={T.body} numberOfLines={3}>{text}</Text> : null}
                {reason ? <Text style={[T.small, { color: status === 'success' ? C.text64 : C.error, marginTop: text ? 6 : 0 }]}>{reason}</Text> : null}
              </Pressable>
              {copy || retry ? (
                <View style={{ flexDirection: 'row', gap: S.x2, marginTop: S.x3 }}>
                  {copy ? <View style={{ flex: 1 }}><Button small kind="secondary" title="Másolás" icon="copy" onPress={() => void Clipboard.setStringAsync(text)} /></View> : null}
                  {retry ? <View style={{ flex: 1 }}><Button small title="Újra" icon="refresh" onPress={() => void retryHistoryItem(h)} /></View> : null}
                </View>
              ) : null}
            </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}

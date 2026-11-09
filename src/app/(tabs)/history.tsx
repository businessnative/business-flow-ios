import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { filterHistory } from '@/engine/editing';
import { categoryLabels } from '@/engine/types';
import { clearHistory, useApp } from '@/state/store';
import { Button, Card, Input, Label, Screen } from '@/ui/components';
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
  return (
    <Screen title="Előzmények" subtitle="Minden diktálás itt marad meg — a sikertelenek is, újrapróbálhatók."
      right={history.length ? <Button small kind="ghost" title="Törlés" onPress={() => Alert.alert('Előzmények törlése', 'Biztosan törlöd az összes előzményt?', [{ text: 'Mégse', style: 'cancel' }, { text: 'Törlés', style: 'destructive', onPress: clearHistory }])} /> : null}>
      <Input placeholder="Keresés az előzményekben" value={q} onChangeText={setQ} autoCorrect={false} />
      <View style={{ marginTop: S.x4, gap: S.x3 }}>
        {items.length === 0 ? (
          <Card><Text style={T.small}>{q ? 'Nincs találat.' : 'Még nincs diktálás. Próbáld ki a Kezdőlapon vagy a billentyűzettel.'}</Text></Card>
        ) : (
          items.map((h) => (
            <Pressable key={h.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/history/[id]', params: { id: h.id } })}>
              <Card style={h.error ? { borderColor: C.error } : undefined}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Label>{fmt(h.date)} · {categoryLabels[h.category].split(' ')[0]}{h.kind === 'polish' ? ' · csiszolt' : ''}</Label>
                  <Label>{Math.round(h.durationSeconds)} mp</Label>
                </View>
                {h.error ? <Text style={[T.body, { color: C.error }]}>{h.error} — koppints az újrapróbáláshoz</Text> : <Text style={T.body} numberOfLines={3}>{h.text}</Text>}
              </Card>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}

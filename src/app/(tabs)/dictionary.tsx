import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { insertEntry, makeEntry, updateEntry } from '@/engine/editing';
import { updateSettings, useApp } from '@/state/store';
import { Button, Card, Input, Label, Pill, Screen } from '@/ui/components';
import { Icon } from '@/ui/Icon';
import { C, S, T } from '@/ui/theme';

export default function Dictionary() {
  const dict = useApp((s) => s.settings.dictionary);
  const [editing, setEditing] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [heard, setHeard] = useState('');
  const reset = () => { setEditing(null); setTerm(''); setHeard(''); };
  const save = () => {
    if (editing && editing !== 'new') updateSettings((s) => ({ dictionary: updateEntry(editing, term, heard, s.dictionary) }));
    else {
      const e = makeEntry(term, heard);
      if (e) updateSettings((s) => ({ dictionary: insertEntry(e, s.dictionary) }));
    }
    reset();
  };
  return (
    <Screen title="Szótár" subtitle="Nevek, márkák, szakszavak — így írja le a Flow helyesen. Az átírás is ezeket a kulcsszavakat kapja."
      right={!editing ? <Button small kind="secondary" icon="plus" title="Új" onPress={() => setEditing('new')} /> : null}>
      {editing ? (
        <Card accent style={{ marginBottom: S.x4 }}>
          <Input label="Helyes alak" placeholder="pl. BusinessNative" value={term} onChangeText={setTerm} autoCapitalize="none" autoCorrect={false} />
          <Input label="Így hallja (vesszővel, opcionális)" placeholder="pl. biznisz nétiv, business native" value={heard} onChangeText={setHeard} autoCapitalize="none" autoCorrect={false} />
          <View style={{ flexDirection: 'row', gap: S.x2, marginTop: S.x4 }}>
            <View style={{ flex: 1 }}><Button kind="secondary" title="Mégse" onPress={reset} /></View>
            <View style={{ flex: 1 }}><Button title="Mentés" disabled={!term.trim()} onPress={save} /></View>
          </View>
        </Card>
      ) : null}
      <View style={{ gap: S.x2 }}>
        {dict.map((d) => (
          <Card key={d.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: S.x3 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Szerkesztés: ${d.term}`} style={{ flex: 1 }} onPress={() => { setEditing(d.id); setTerm(d.term); setHeard(d.heardAs.join(', ')); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.x2 }}>
                <Text style={[T.body, { color: C.text }]}>{d.term}</Text>
                {d.autoLearned ? <Pill text="tanult" color={C.accent} /> : null}
              </View>
              {d.heardAs.length ? <Text style={[T.small, { marginTop: 2 }]}>← {d.heardAs.join(', ')}</Text> : null}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${d.term} törlése`} hitSlop={10} onPress={() => updateSettings((s) => ({ dictionary: s.dictionary.filter((x) => x.id !== d.id) }))}>
              <Icon name="trash" size={17} color={C.text48} />
            </Pressable>
          </Card>
        ))}
      </View>
      <Label style={{ marginTop: S.x5 }}>{dict.length} kifejezés</Label>
    </Screen>
  );
}

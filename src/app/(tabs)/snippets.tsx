import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { saveSnippet } from '@/engine/editing';
import { updateSettings, useApp } from '@/state/store';
import { Button, Card, Input, Label, Screen } from '@/ui/components';
import { Icon } from '@/ui/Icon';
import { C, S, T } from '@/ui/theme';

export default function Snippets() {
  const snippets = useApp((s) => s.settings.snippets);
  const [editing, setEditing] = useState<string | null>(null);
  const [trigger, setTrigger] = useState('');
  const [expansion, setExpansion] = useState('');
  const reset = () => { setEditing(null); setTrigger(''); setExpansion(''); };
  return (
    <Screen title="Snippetek" subtitle="Mondd ki a kulcsszót, és a Flow a teljes szöveget illeszti be — pl. „foglalási link”."
      right={!editing ? <Button small kind="secondary" icon="plus" title="Új" onPress={() => setEditing('new')} /> : null}>
      {editing ? (
        <Card accent style={{ marginBottom: S.x4 }}>
          <Input label="Kulcsszó (amit mondasz)" placeholder="pl. foglalási link" value={trigger} onChangeText={setTrigger} autoCapitalize="none" />
          <Input label="Beillesztett szöveg" placeholder="pl. https://cal.com/sajat-nev" value={expansion} onChangeText={setExpansion} multiline autoCapitalize="none" />
          <View style={{ flexDirection: 'row', gap: S.x2, marginTop: S.x4 }}>
            <View style={{ flex: 1 }}><Button kind="secondary" title="Mégse" onPress={reset} /></View>
            <View style={{ flex: 1 }}><Button title="Mentés" disabled={!trigger.trim() || !expansion.trim()} onPress={() => { updateSettings((s) => ({ snippets: saveSnippet(editing === 'new' ? null : editing, trigger, expansion, s.snippets) })); reset(); }} /></View>
          </View>
        </Card>
      ) : null}
      {snippets.length === 0 && !editing ? <Card><Text style={T.small}>Még nincs snippet. Gyakori válaszok, linkek, címek, aláírások valók ide.</Text></Card> : null}
      <View style={{ gap: S.x2 }}>
        {snippets.map((s) => (
          <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: S.x3 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Szerkesztés: ${s.trigger}`} style={{ flex: 1 }} onPress={() => { setEditing(s.id); setTrigger(s.trigger); setExpansion(s.expansion); }}>
              <Label>„{s.trigger}”</Label>
              <Text style={[T.body, { marginTop: 4 }]} numberOfLines={2}>{s.expansion}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Törlés" hitSlop={10} onPress={() => updateSettings((st) => ({ snippets: st.snippets.filter((x) => x.id !== s.id) }))}>
              <Icon name="trash" size={17} color={C.text48} />
            </Pressable>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

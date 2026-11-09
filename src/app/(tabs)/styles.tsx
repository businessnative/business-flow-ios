import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { builtInPolishPresets, categoryDetails, categoryLabels, newId, toneExamples, toneLabels, type AppCategory, type StyleTone } from '@/engine/types';
import { updateSettings, useApp } from '@/state/store';
import { Button, Card, Input, Label, Screen, Segmented } from '@/ui/components';
import { Icon } from '@/ui/Icon';
import { C, S, T } from '@/ui/theme';

const cats: AppCategory[] = ['personal', 'work', 'email', 'other'];
const tones: StyleTone[] = ['formal', 'casual', 'veryCasual'];

export default function Styles() {
  const settings = useApp((s) => s.settings);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [adding, setAdding] = useState(false);
  return (
    <Screen title="Stílusok" subtitle="Kategóriánként más hangnem — magyarul is. A billentyűzeten a kategória-chippel váltasz.">
      {cats.map((c) => (
        <Card key={c} style={{ marginBottom: S.x3 }}>
          <Text style={T.h2}>{categoryLabels[c]}</Text>
          <Text style={[T.small, { marginTop: 2, marginBottom: S.x3 }]}>{categoryDetails[c]}</Text>
          <Segmented options={tones.map((t) => ({ value: t, label: toneLabels[t] }))} value={settings.styles[c]} onChange={(t) => updateSettings((s) => ({ styles: { ...s.styles, [c]: t } }))} />
          <Text style={[T.small, { marginTop: S.x3, fontStyle: 'italic' }]}>„{toneExamples[settings.styles[c]]}”</Text>
        </Card>
      ))}
      <View style={{ marginTop: S.x3 }}>
        <Label style={{ marginBottom: S.x2 }}>Alapértelmezett kategória (billentyűzet)</Label>
        <Segmented options={cats.map((c) => ({ value: c, label: categoryLabels[c].split(' ')[0] }))} value={settings.defaultCategory} onChange={(c) => updateSettings({ defaultCategory: c })} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: S.x8, marginBottom: S.x2 }}>
        <Label style={{ flex: 1 }}>Csiszolási promptok</Label>
        {!adding ? <Button small kind="ghost" icon="plus" title="Saját" onPress={() => setAdding(true)} /> : null}
      </View>
      {adding ? (
        <Card accent style={{ marginBottom: S.x3 }}>
          <Input label="Név" value={name} onChangeText={setName} placeholder="pl. LinkedIn poszt" />
          <Input label="Utasítás" value={prompt} onChangeText={setPrompt} multiline placeholder="pl. Írd át rövid, lendületes LinkedIn-posztra." />
          <View style={{ flexDirection: 'row', gap: S.x2, marginTop: S.x4 }}>
            <View style={{ flex: 1 }}><Button kind="secondary" title="Mégse" onPress={() => setAdding(false)} /></View>
            <View style={{ flex: 1 }}><Button title="Mentés" disabled={!name.trim() || !prompt.trim()} onPress={() => { updateSettings((s) => ({ customPolish: [...s.customPolish, { id: newId(), name: name.trim(), prompt: prompt.trim(), builtIn: false }] })); setAdding(false); setName(''); setPrompt(''); }} /></View>
          </View>
        </Card>
      ) : null}
      <Card style={{ paddingVertical: 0 }}>
        {[...builtInPolishPresets, ...settings.customPolish].map((p, i, arr) => (
          <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ selected: p.id === settings.defaultPolishID }} onPress={() => updateSettings({ defaultPolishID: p.id })} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 0.5 : 0, borderBottomColor: C.text16 }}>
            <View style={{ flex: 1 }}>
              <Text style={[T.body, { color: C.text }]}>{p.name}</Text>
              <Text style={T.small} numberOfLines={2}>{p.prompt}</Text>
            </View>
            {settings.defaultPolishID === p.id ? <Icon name="check" size={18} color={C.accent} /> : null}
            {!p.builtIn ? (
              <Pressable hitSlop={10} accessibilityLabel="Törlés" onPress={() => updateSettings((s) => ({ customPolish: s.customPolish.filter((x) => x.id !== p.id) }))} style={{ marginLeft: S.x3 }}>
                <Icon name="trash" size={16} color={C.text48} />
              </Pressable>
            ) : null}
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { PROVIDERS, maskKey, testKey, type ProviderId } from '@/services/providers';
import { readKey, setKey } from '@/state/keychain';
import { setKeyPresent } from '@/state/store';
import { Button, Card, Input, Label, Segmented } from './components';
import { C, S, T } from './theme';

const short: Record<ProviderId, string> = { openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini' };

/** Bring-your-own-key for OpenAI / Claude / Gemini. Keys stay in this device's Keychain. */
export function ApiKeyCard() {
  const [p, setP] = useState<ProviderId>('openai');
  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const info = PROVIDERS[p];
  const choose = (v: ProviderId) => {
    setMsg(null);
    setDraft('');
    setP(v);
  };
  useEffect(() => {
    void readKey(p).then((r) => {
      setCurrent(r.value);
      if (r.error) setMsg({ text: r.error, ok: false });
    });
  }, [p]);
  const save = async () => {
    if (!info.looksLikeKey(draft)) return setMsg({ text: `Ez nem tűnik ${info.name}-kulcsnak (${info.keyHint}).`, ok: false });
    try {
      await setKey(p, draft);
    } catch {
      return setMsg({ text: 'Nem sikerült menteni a kulcstartóba. Próbáld újra.', ok: false });
    }
    setCurrent(draft.trim());
    setDraft('');
    setKeyPresent(p, true);
    setMsg({ text: 'Elmentve a Kulcskarikába (csak ezen az eszközön).', ok: true });
  };
  const test = async () => {
    const k = draft.trim() || current;
    if (!k) return setMsg({ text: 'Előbb illessz be egy kulcsot.', ok: false });
    setBusy(true);
    setMsg({ text: 'Tesztelés…', ok: true });
    const r = await testKey(p, k);
    setBusy(false);
    setMsg({ text: r.message, ok: r.ok });
  };
  return (
    <Card>
      <Label>API-kulcsok (saját kulccsal)</Label>
      <View style={{ marginTop: S.x2 }}>
        <Segmented<ProviderId> options={(['openai', 'anthropic', 'gemini'] as const).map((v) => ({ value: v, label: short[v] }))} value={p} onChange={choose} />
      </View>
      <Text style={[T.small, { marginTop: 6 }]}>
        {current ? `${info.name}: beállítva (${maskKey(current)})` : `${info.name}: nincs beállítva.`} A kulcs az iOS Kulcskarikában marad ezen az eszközön; nincs beépítve az appba és nem szinkronizálódik.
      </Text>
      <Input placeholder={info.keyHint} value={draft} onChangeText={setDraft} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" />
      <View style={{ flexDirection: 'row', gap: S.x2, marginTop: S.x3 }}>
        <View style={{ flex: 1 }}><Button title="Mentés" icon="key" disabled={!draft} onPress={() => void save()} /></View>
        <View style={{ flex: 1 }}><Button kind="secondary" title="Kulcs tesztelése" disabled={busy || (!draft && !current)} onPress={() => void test()} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: S.x2, marginTop: S.x2 }}>
        <View style={{ flex: 1 }}><Button kind="ghost" small title="Kulcs létrehozása ↗" onPress={() => void Linking.openURL(info.keyUrl)} /></View>
        {current ? <View style={{ flex: 1 }}><Button kind="ghost" small title="Törlés" onPress={() => void setKey(p, null).then(() => { setCurrent(null); setKeyPresent(p, false); setMsg({ text: 'Törölve.', ok: true }); })} /></View> : null}
      </View>
      {msg ? <Text style={[T.small, { marginTop: S.x2, color: msg.ok ? C.accent : '#ff8a7a' }]}>{msg.text}</Text> : null}
    </Card>
  );
}

import { Text, View } from 'react-native';

import { CLAUDE_NO_STT, PROVIDERS, type ProviderId, type TranscriptionProviderId } from '@/services/providers';
import { updateSettings, useApp } from '@/state/store';
import { Label, Section, Segmented, ToggleRow } from './components';
import { C, S, T } from './theme';

const short = (label: string) => label.replace(/\s*\(.*\)$/, '');

export function ProviderSettings() {
  const s = useApp((x) => x.settings);
  const keys = useApp((x) => x.keys);
  const missing = (p: ProviderId) => (keys[p] ? '' : ' – nincs kulcs');
  const chatModels = PROVIDERS[s.chatProviderId].chatModels;
  const chatModel = s.chatProviderId === 'openai' ? s.chatModel : s.chatProviderId === 'anthropic' ? s.claudeModel : s.geminiChatModel;
  const setChatModel = (m: string) => updateSettings(s.chatProviderId === 'openai' ? { chatModel: m } : s.chatProviderId === 'anthropic' ? { claudeModel: m } : { geminiChatModel: m });
  const sttModels = PROVIDERS[s.transcriptionProvider].transcriptionModels;
  const sttModel = s.transcriptionProvider === 'openai' ? s.transcriptionModel : s.geminiTranscriptionModel;
  return (
    <View>
      <View style={{ marginTop: S.x6 }}>
        <Label style={{ marginBottom: S.x2 }}>Átírás (beszéd → szöveg)</Label>
        <Segmented<TranscriptionProviderId> options={[{ value: 'openai', label: 'OpenAI' }, { value: 'gemini', label: 'Gemini' }]} value={s.transcriptionProvider} onChange={(transcriptionProvider) => updateSettings({ transcriptionProvider })} />
        <View style={{ marginTop: S.x2 }}>
          <Segmented<string> options={sttModels.map((m) => ({ value: m.id, label: short(m.label) }))} value={sttModel} onChange={(m) => updateSettings(s.transcriptionProvider === 'openai' ? { transcriptionModel: m } : { geminiTranscriptionModel: m })} />
        </View>
        <Text style={[T.small, { marginTop: 6 }]}>{PROVIDERS[s.transcriptionProvider].name}{missing(s.transcriptionProvider)}. {CLAUDE_NO_STT}</Text>
      </View>
      <View style={{ marginTop: S.x6 }}>
        <Label style={{ marginBottom: S.x2 }}>Szöveg tisztázása</Label>
        <Segmented<ProviderId> options={[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Claude' }, { value: 'gemini', label: 'Gemini' }]} value={s.chatProviderId} onChange={(chatProviderId) => updateSettings({ chatProviderId })} />
        <View style={{ marginTop: S.x2 }}>
          <Segmented<string> options={chatModels.map((m) => ({ value: m.id, label: short(m.label) }))} value={chatModel} onChange={setChatModel} />
        </View>
        <Text style={[T.small, { marginTop: 6, color: keys[s.chatProviderId] ? C.text64 : C.accent }]}>
          {chatModels.find((m) => m.id === chatModel)?.label ?? chatModel}{missing(s.chatProviderId)}. Az alapértelmezett modellek a legolcsóbb, gyors változatok.
        </Text>
      </View>
      <Section label="Tartalék">
        <ToggleRow title="Másik szolgáltató, ha az egyik hibázik" detail="Ha a választott szolgáltató nem elérhető vagy a kulcs hibás, automatikusan a másikkal próbálja (ha van hozzá kulcsod)." value={s.providerFallback} onChange={(providerFallback) => updateSettings({ providerFallback })} last />
      </Section>
    </View>
  );
}

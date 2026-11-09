import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { C, F, R, S, T } from './theme';

export function Screen({ title, subtitle, children, right, scroll = true }: { title?: string; subtitle?: string; children: ReactNode; right?: ReactNode; scroll?: boolean }) {
  const body = (
    <>
      {title ? (
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={T.h1}>{title}</Text>
            {subtitle ? <Text style={[T.small, { marginTop: 4 }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </>
  );
  return (
    <SafeAreaView style={st.screen} edges={['top']}>
      {scroll ? <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">{body}</ScrollView> : <View style={[st.content, { flex: 1 }]}>{body}</View>}
    </SafeAreaView>
  );
}

export const Label = ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[T.label, style]}>{children}</Text>;

export function Card({ children, style, accent }: { children: ReactNode; style?: ViewStyle; accent?: boolean }) {
  return <View style={[st.card, accent && { borderColor: C.accent }, style]}>{children}</View>;
}

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: S.x6 }}>
      <Label style={{ marginBottom: S.x2, marginLeft: 2 }}>{label}</Label>
      <Card style={{ paddingVertical: 0 }}>{children}</Card>
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, small }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; disabled?: boolean; small?: boolean }) {
  const bg = kind === 'primary' ? C.text : kind === 'secondary' ? C.text08 : 'transparent';
  const fg = kind === 'primary' ? C.base : kind === 'danger' ? C.error : C.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [st.button, small && st.buttonSmall, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, kind === 'secondary' && { borderWidth: 1, borderColor: C.text16 }]}>
      {icon ? <Icon name={icon} size={small ? 15 : 17} color={fg} /> : null}
      <Text style={[st.buttonText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Row({ title, detail, value, onPress, right, last, icon }: { title: string; detail?: string; value?: string; onPress?: () => void; right?: ReactNode; last?: boolean; icon?: IconName }) {
  const inner = (
    <View style={[st.row, !last && st.rowBorder]}>
      {icon ? <View style={st.rowIcon}><Icon name={icon} size={17} color={C.text64} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={st.rowTitle}>{title}</Text>
        {detail ? <Text style={[T.small, { marginTop: 2 }]}>{detail}</Text> : null}
      </View>
      {value ? <Text style={[T.small, { marginLeft: S.x2 }]}>{value}</Text> : null}
      {right}
      {onPress && !right ? <Icon name="chevron" size={16} color={C.text32} /> : null}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{inner}</Pressable> : inner;
}

export function ToggleRow({ title, detail, value, onChange, last }: { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <Row title={title} detail={detail} last={last}
      right={<Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent, false: C.depth }} thumbColor={C.text} ios_backgroundColor={C.depth} accessibilityLabel={title} />} />
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={st.segment}>
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: o.value === value }} onPress={() => onChange(o.value)}
          style={[st.segmentItem, o.value === value && { backgroundColor: C.depth, borderColor: C.text16 }]}>
          <Text style={[st.segmentText, o.value === value && { color: C.text }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginTop: S.x3 }}>
      {label ? <Label style={{ marginBottom: 6 }}>{label}</Label> : null}
      <TextInput placeholderTextColor={C.text32} selectionColor={C.accent} keyboardAppearance="dark" {...rest} style={[st.input, rest.multiline && { minHeight: 88, textAlignVertical: 'top' }, style]} />
    </View>
  );
}

export const Pill = ({ text, color = C.text64 }: { text: string; color?: string }) => (
  <View style={[st.pill, { borderColor: color }]}><Text style={[T.label, { color, fontSize: 10 }]}>{text}</Text></View>
);

export const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.base },
  content: { padding: S.x5, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: S.x5, marginTop: S.x2 },
  card: { backgroundColor: C.lift, borderRadius: R.lg, borderWidth: 1, borderColor: C.text08, padding: S.x4 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: R.md, paddingHorizontal: S.x5 },
  buttonSmall: { height: 34, paddingHorizontal: S.x3 },
  buttonText: { fontFamily: F.medium, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, minHeight: 52, gap: S.x2 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.text16 },
  rowIcon: { width: 28 },
  rowTitle: { fontFamily: F.regular, fontSize: 15, color: C.text },
  segment: { flexDirection: 'row', backgroundColor: C.text08, borderRadius: R.md, padding: 3, gap: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: 'transparent' },
  segmentText: { fontFamily: F.medium, fontSize: 13, color: C.text48 },
  input: { backgroundColor: C.base, borderWidth: 1, borderColor: C.text16, borderRadius: R.md, color: C.text, fontFamily: F.regular, fontSize: 15, paddingHorizontal: 12, paddingVertical: 12 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
});

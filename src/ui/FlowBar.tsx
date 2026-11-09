// The BN Flow bar (tokens.json → flowBar): ready / push-to-talk / hands-free / processing / error, sized ×2 for touch.
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Phase } from '@/session/protocol';
import { Icon } from './Icon';
import { C, EASE, F } from './theme';

const SCALE = 2;
const sizes = { ready: [50, 30], ptt: [73, 30], handsFree: [102.5, 30], processing: [98, 30], error: [91, 30] } as const;
const weights = [0.35, 0.6, 0.85, 1, 0.75, 0.9, 1, 0.7, 0.5, 0.3];
const ease = Easing.bezier(...EASE);

export function FlowBar({ phase, level, mode, onPress, onStop, onCancel }: { phase: Phase; level: number; mode: 'toggle' | 'ptt'; onPress: () => void; onStop?: () => void; onCancel?: () => void }) {
  const key = phase === 'recording' || phase === 'starting' ? (mode === 'ptt' ? 'ptt' : 'handsFree') : phase === 'processing' ? 'processing' : phase === 'error' ? 'error' : 'ready';
  const [w, h] = sizes[key];
  const [width] = useState(() => new Animated.Value(w * SCALE));
  const [spin] = useState(() => new Animated.Value(0));
  const [rotate] = useState(() => spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }));
  useEffect(() => {
    Animated.timing(width, { toValue: w * SCALE, duration: 350, easing: ease, useNativeDriver: false }).start();
  }, [w, width]);
  useEffect(() => {
    if (key !== 'processing') return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [key, spin]);
  const active = key === 'ptt' || key === 'handsFree';
  const border = key === 'error' ? C.error : active ? C.accent : C.text16;
  const label = key === 'ready' ? 'Diktálás indítása' : key === 'processing' ? 'Feldolgozás, koppints a megszakításhoz' : key === 'error' ? 'Hiba' : 'Felvétel, koppints a leállításhoz';

  return (
    <View style={s.wrap}>
      {active && onCancel ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Mégse" onPress={onCancel} style={s.side}>
          <Icon name="x" size={20} />
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
        <Animated.View style={[s.bar, { width, height: h * SCALE, borderColor: border, borderWidth: key === 'error' ? 1.5 : 1 }]}>
          {key === 'processing' ? (
            <Animated.View pointerEvents="none" style={[s.ring, { transform: [{ rotate }] }]} />
          ) : null}
          {key === 'processing' ? (
            <Text style={s.mono}>FELDOLGOZÁS</Text>
          ) : key === 'error' ? (
            <Text style={[s.mono, { color: C.error }]}>HIBA</Text>
          ) : (
            <View style={s.bars}>
              {weights.map((wt, i) => (
                <View key={i} style={{ width: 2 * SCALE * 0.75, borderRadius: 2, backgroundColor: active ? C.accent : C.text48, height: Math.max(3, 18 * Math.min(1, (active ? level : 0) * 1.3) * wt) * SCALE * 0.75 }} />
              ))}
            </View>
          )}
        </Animated.View>
      </Pressable>
      {active && onStop ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Kész" onPress={onStop} style={[s.side, { backgroundColor: C.text }]}>
          <Icon name="check" size={20} color={C.base} />
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 72 },
  bar: { borderRadius: 999, backgroundColor: C.lift, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2 * SCALE * 0.75 },
  ring: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 130, borderTopColor: C.accent, borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent', opacity: 0.25 },
  mono: { fontFamily: F.mono, fontSize: 11, letterSpacing: 0.75, color: C.text64 },
  side: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.text08, borderWidth: 1, borderColor: C.text16, alignItems: 'center', justifyContent: 'center' },
});

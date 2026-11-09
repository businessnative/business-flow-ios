import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import FlowSession from '../../../modules/flow-session';
import { addAudio } from '@/calls/store';
import { formatTime } from '@/calls/core';
import { Button, Card, Label, Screen } from '@/ui/components';
import { C, S, T } from '@/ui/theme';

/** 16 kHz mono WAV ≈ 1.9 MB/min → 12 min stays under the 24 MB upload limit. */
export const MAX_RECORD_S = 12 * 60;

export default function Record() {
  const [on, setOn] = useState(false);
  const [t, setT] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const stop = async () => {
    if (timer.current) clearInterval(timer.current);
    setOn(false);
    try {
      const r = await FlowSession.stopRecording();
      if (r.silent) return setErr('Nem hallottam semmit. Kapcsold be a kihangosítót, és tedd a telefont közelebb.');
      const id = addAudio(r.uri, 'Kihangosított hívás.wav', 'speakerphone', r.seconds);
      router.replace(`/calls/${id}`);
    } catch {
      setErr('A felvétel leállítása nem sikerült.');
    }
  };
  useEffect(() => {
    stopRef.current = () => void stop();
  });

  const start = async () => {
    setErr(null);
    try {
      if (!(await FlowSession.requestMicPermission())) return setErr('Nincs mikrofon-engedély (Beállítások → Business Flow).');
      await FlowSession.startRecording();
      setOn(true);
      setT(0);
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const s = Math.round((Date.now() - t0) / 1000);
        setT(s);
        if (s >= MAX_RECORD_S) stopRef.current();
      }, 500);
    } catch {
      setErr('A felvétel nem indult el.');
    }
  };
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    try { if (FlowSession.isRecording()) FlowSession.cancelRecording(); } catch {}
  }, []);

  return (
    <Screen title="Kihangosítós felvétel" subtitle="Tartalék megoldás, ha a natív hívásrögzítés nem érhető el." right={<Button small kind="ghost" title="Bezár" onPress={() => router.back()} />}>
      <Card style={{ borderColor: C.warning }}>
        <Label style={{ color: C.warning }}>Fontos</Label>
        <Text style={[T.body, { marginTop: 6 }]}>Ez NEM a hívás hangját rögzíti, hanem a mikrofont: a hívást kihangosítóra kell tenni, és a telefon a szobában hallható hangot veszi fel. A minőség gyengébb, a beszélők szétválasztása bizonytalanabb. Tájékoztasd a másik felet a rögzítésről. Max. 12 perc.</Text>
        <Text style={[T.small, { marginTop: 6 }]}>Tipp: egy iPhone-on hívás közben a mikrofont a hívás foglalja. Ilyenkor egy másik eszközön (iPad, második telefon) indítsd a felvételt.</Text>
      </Card>
      <View style={{ alignItems: 'center', marginTop: S.x6 }}>
        <Text style={[T.h1, { fontVariant: ['tabular-nums'] }]}>{formatTime(t)}</Text>
        <View style={{ marginTop: S.x4, width: '100%' }}>
          <Button title={on ? 'Leállítás és feldolgozás' : 'Felvétel indítása'} icon={on ? 'square' : 'mic'} kind={on ? 'danger' : 'primary'} onPress={() => void (on ? stop() : start())} />
        </View>
        {err ? <Text style={[T.small, { color: C.error, marginTop: S.x3 }]}>{err}</Text> : null}
      </View>
    </Screen>
  );
}

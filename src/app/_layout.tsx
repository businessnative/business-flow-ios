import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { importInbox } from '@/calls/store';
import { prewarmTextPipeline } from '@/engine/pipeline';
import { initSession } from '@/session/controller';
import { warmTranscriptionConnection } from '@/services/providers';
import { readAllKeys } from '@/state/keychain';
import { getState, loadStore, useApp } from '@/state/store';
import { C } from '@/ui/theme';

// Keep the native splash up until fonts and stored settings are ready. The Keychain read is not on this path.
SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.base, card: C.base, text: C.text, border: C.text08, primary: C.accent } };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, GeistMono_400Regular });
  const ready = useApp((s) => s.ready);
  const keysReady = useApp((s) => s.keysReady);
  const transcriptionProvider = useApp((s) => s.settings.transcriptionProvider);
  const visible = ready && (fontsLoaded || fontError != null);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(C.base);
    void loadStore().then(() => {
      // Regex compile for the cleanup rules happens while the user is looking at the shell, not after they stop talking.
      setTimeout(() => prewarmTextPipeline(), 0);
    });
    initSession();
    // Share Extension items (call recordings / transcripts) are picked up whenever the app becomes active.
    void importInbox().catch(() => {});
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void importInbox().catch(() => {}));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!keysReady) return;
    let cancelled = false;
    void readAllKeys().then((k) => {
      if (!cancelled) warmTranscriptionConnection(getState().settings, k.keys);
    });
    return () => {
      cancelled = true;
    };
  }, [keysReady, transcriptionProvider]);
  useEffect(() => {
    if (visible) void SplashScreen.hideAsync().catch(() => {});
  }, [visible]);
  if (!visible) return null;
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.base } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="dictate" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="history/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="calls/index" />
        <Stack.Screen name="calls/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="calls/guide" options={{ presentation: 'modal' }} />
        <Stack.Screen name="calls/record" options={{ presentation: 'modal', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}

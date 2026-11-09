// API keys (OpenAI / Anthropic / Gemini): iOS Keychain via expo-secure-store.
// - kSecAttrAccessibleAfterFirstUnlock(ThisDeviceOnly): readable in the background and from the keyboard
//   extension without any UI; iOS never shows a password prompt for these items (the macOS "allow access"
//   dialog does not exist on iOS). The shared keychain-access-groups entitlement is the first group, so new
//   items land in the group the keyboard extension can also read.
// - Reads are cached in memory and wrapped in a timeout so a slow/locked Keychain never blocks dictation.
// - Never bundled, never synced (ThisDeviceOnly), never logged.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { ProviderId } from '@/services/providers';

const ITEMS: Record<ProviderId, { key: string; service: string }> = {
  openai: { key: 'openai_api_key', service: 'com.example.businessflow.openai' }, // unchanged from 0.1/0.2 → existing keys keep working
  anthropic: { key: 'anthropic_api_key', service: 'com.example.businessflow.anthropic' },
  gemini: { key: 'gemini_api_key', service: 'com.example.businessflow.gemini' },
};
const opts = (p: ProviderId): SecureStore.SecureStoreOptions => ({
  keychainService: ITEMS[p].service,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  requireAuthentication: false,
});

export const KEYCHAIN_TIMEOUT_MS = 4000;
export const KEYCHAIN_TIMEOUT_MSG = 'A kulcstartó nem válaszolt időben. Oldd fel a telefont, majd koppints az Újra gombra.';
export const KEYCHAIN_ERROR_MSG = 'Nem sikerült kiolvasni az API-kulcsot a kulcstartóból. Mentsd el újra a Beállításokban.';

const webMemory: Partial<Record<ProviderId, string | null>> = {};
const cache: Partial<Record<ProviderId, string | null>> = {};
const inflight = new Map<ProviderId, Promise<KeyRead>>();
const readGen: Record<ProviderId, number> = { openai: 0, anthropic: 0, gemini: 0 };

export interface KeyRead {
  value: string | null;
  error?: string;
}

/**
 * Non-blocking read: cached, time-limited, never throws, Hungarian error text on failure.
 * Concurrent callers share one Keychain round-trip. A timeout does not cancel that round-trip:
 * a late success still fills the cache so the next dictation does not wait again.
 * `timeoutMs` of Infinity waits for the real read (startup uses this so a slow Keychain is not reported as "no key").
 */
export async function readKey(p: ProviderId, timeoutMs = KEYCHAIN_TIMEOUT_MS, impl = SecureStore.getItemAsync): Promise<KeyRead> {
  if (Platform.OS === 'web') return { value: webMemory[p] ?? null };
  if (p in cache) return { value: cache[p] ?? null };
  let task = inflight.get(p);
  if (!task) {
    const gen = readGen[p];
    task = new Promise<string | null>((resolve, reject) => {
      try {
        resolve(impl(ITEMS[p].key, opts(p)));
      } catch (e) {
        reject(e);
      }
    }).then(
      (v) => {
        if (readGen[p] === gen) cache[p] = v;
        return { value: v } as KeyRead;
      },
      () => ({ value: null, error: KEYCHAIN_ERROR_MSG }) as KeyRead,
    );
    inflight.set(p, task);
    void task.finally(() => {
      if (inflight.get(p) === task) inflight.delete(p);
    });
  }
  if (!Number.isFinite(timeoutMs)) return task;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<KeyRead>((res) => {
    timer = setTimeout(() => res({ value: null, error: KEYCHAIN_TIMEOUT_MSG }), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readAllKeys(timeoutMs = KEYCHAIN_TIMEOUT_MS): Promise<{ keys: Partial<Record<ProviderId, string | null>>; error?: string }> {
  const ps: ProviderId[] = ['openai', 'anthropic', 'gemini'];
  const rs = await Promise.all(ps.map((p) => readKey(p, timeoutMs)));
  const keys: Partial<Record<ProviderId, string | null>> = {};
  ps.forEach((p, i) => (keys[p] = rs[i].value));
  return { keys, error: rs.find((r) => r.error)?.error };
}

/** Back-compat: OpenAI key. */
export const getApiKey = async () => (await readKey('openai')).value;

export const invalidateKeyCache = () => {
  for (const k of Object.keys(cache)) delete cache[k as ProviderId];
  inflight.clear();
  for (const k of Object.keys(readGen) as ProviderId[]) readGen[k]++;
};

export async function setKey(p: ProviderId, value: string | null): Promise<void> {
  const v = value?.trim() || null;
  readGen[p]++;
  inflight.delete(p);
  if (Platform.OS === 'web') {
    webMemory[p] = v;
    cache[p] = v;
    return;
  }
  delete cache[p];
  const gen = readGen[p];
  if (v) await SecureStore.setItemAsync(ITEMS[p].key, v, opts(p));
  else await SecureStore.deleteItemAsync(ITEMS[p].key, opts(p));
  // A read that started before this write must not put the old value back.
  readGen[p]++;
  if (readGen[p] === gen + 1) cache[p] = v;
}
export const setApiKey = (v: string | null) => setKey('openai', v);

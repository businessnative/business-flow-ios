import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import FlowSession from '../../modules/flow-session';
import type { MicPermission } from '../../modules/flow-session';
import { useApp } from './store';

export interface SetupStatus {
  keyboard: boolean;
  fullAccess: boolean;
  mic: MicPermission;
  apiKey: boolean;
  /** False while the Keychain read is still in flight. Missing-key UI waits for this. */
  keysReady: boolean;
}

type Native = Omit<SetupStatus, 'apiKey' | 'keysReady'>;
function read(): Native {
  try {
    return { keyboard: FlowSession.isKeyboardEnabled(), fullAccess: FlowSession.keyboardFullAccessSeenAt() > 0, mic: FlowSession.micPermission() };
  } catch {
    return { keyboard: false, fullAccess: false, mic: 'undetermined' };
  }
}

/** Re-checks on focus and every second while visible (Wispr advances onboarding as soon as Full Access is detected). */
export function useSetupStatus(): SetupStatus {
  const hasKey = useApp((s) => s.hasKey);
  const keysReady = useApp((s) => s.keysReady);
  const [st, setSt] = useState(read);
  useEffect(() => {
    const update = () => setSt((prev) => {
      const n = read();
      return n.keyboard === prev.keyboard && n.fullAccess === prev.fullAccess && n.mic === prev.mic ? prev : n;
    });
    const sub = AppState.addEventListener('change', (a) => a === 'active' && update());
    const t = Platform.OS === 'web' ? null : setInterval(update, 1000);
    return () => {
      sub.remove();
      if (t) clearInterval(t);
    };
  }, []);
  return { ...st, apiKey: hasKey, keysReady };
}

export const setupComplete = (s: SetupStatus) => s.keyboard && s.fullAccess && s.mic === 'granted' && s.keysReady && s.apiKey;

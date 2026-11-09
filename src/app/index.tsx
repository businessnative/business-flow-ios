import { Redirect } from 'expo-router';

import { useApp } from '@/state/store';

export default function Index() {
  const done = useApp((s) => s.settings.onboardingDone);
  return <Redirect href={done ? '/home' : '/onboarding'} />;
}

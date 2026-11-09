import { Tabs } from 'expo-router/tabs';

import { Icon, type IconName } from '@/ui/Icon';
import { C, F } from '@/ui/theme';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: unknown }) => <Icon name={icon} size={21} color={typeof color === "string" ? color : C.text32} />,
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.text,
        tabBarInactiveTintColor: C.text32,
        tabBarStyle: { backgroundColor: C.base, borderTopColor: C.text08 },
        tabBarLabelStyle: { fontFamily: F.medium, fontSize: 10 },
        sceneStyle: { backgroundColor: C.base },
      }}>
      <Tabs.Screen name="home" options={tab('Kezdőlap', 'home')} />
      <Tabs.Screen name="history" options={tab('Előzmény', 'history')} />
      <Tabs.Screen name="dictionary" options={tab('Szótár', 'book')} />
      <Tabs.Screen name="snippets" options={tab('Snippet', 'zap')} />
      <Tabs.Screen name="styles" options={tab('Stílusok', 'sparkles')} />
      <Tabs.Screen name="settings" options={tab('Beállítás', 'sliders')} />
    </Tabs>
  );
}

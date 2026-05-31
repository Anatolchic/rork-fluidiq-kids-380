import { Tabs } from 'expo-router';
import { COLORS } from '../../lib/constants';

export default function StudentLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: COLORS.textSecondary,
      tabBarStyle: { backgroundColor: COLORS.white, borderTopColor: COLORS.border },
      headerShown: false,
    }}>
      <Tabs.Screen name="index" options={{ title: 'Репетиторы', tabBarIcon: ({ color }) => <TabIcon emoji="🔍" color={color} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Уроки', tabBarIcon: ({ color }) => <TabIcon emoji="📅" color={color} /> }} />
      <Tabs.Screen name="favorites" options={{ title: 'Избранное', tabBarIcon: ({ color }) => <TabIcon emoji="❤️" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль', tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }} />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20, opacity: color === COLORS.primary ? 1 : 0.5 }}>{emoji}</Text>;
}

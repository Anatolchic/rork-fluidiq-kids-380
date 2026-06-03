import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Calendar, Heart, MessageCircle, User } from 'lucide-react-native';
import { COLORS } from '../../lib/constants';

export default function StudentLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: { backgroundColor: COLORS.white, borderTopColor: COLORS.border, height: 56 + insets.bottom, paddingBottom: insets.bottom + 4, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Репетиторы', tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Уроки', tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }} />
      <Tabs.Screen name="favorites" options={{ title: 'Избранное', tabBarIcon: ({ color, size }) => <Heart color={color} size={size} /> }} />
      <Tabs.Screen name="messages" options={{ title: 'Сообщения', tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}

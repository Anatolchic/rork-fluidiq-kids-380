import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Home, Users, GraduationCap, Calendar, DollarSign, MessageSquare, Settings, User } from 'lucide-react-native';
import { Platform } from 'react-native';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';

export default function AdminLayout() {
  const { profile, loading } = useAuthStore();

  useEffect(() => {
    if (!loading && profile && profile.role !== 'admin') {
      router.replace('/');
    }
  }, [profile, loading]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: { backgroundColor: COLORS.white, borderTopColor: COLORS.border, height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Главная', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="users" options={{ title: 'Юзеры', tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="tutors" options={{ title: 'Репет.', tabBarIcon: ({ color, size }) => <GraduationCap color={color} size={size} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Сделки', tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }} />
      <Tabs.Screen name="payments" options={{ title: 'Деньги', tabBarIcon: ({ color, size }) => <DollarSign color={color} size={size} /> }} />
      <Tabs.Screen name="tickets" options={{ title: 'Обращ.', tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Настр.', tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Я', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}

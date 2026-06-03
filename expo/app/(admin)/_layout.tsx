import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Slot, Tabs, router, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Users, GraduationCap, Calendar, DollarSign, MessageSquare, Settings, User, LogOut, FileCheck, ScrollText } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';
import { useResponsive } from '../../lib/responsive';

const NAV = [
  { route: 'index', path: '/(admin)', label: 'Главная', icon: Home },
  { route: 'users', path: '/(admin)/users', label: 'Пользователи', icon: Users },
  { route: 'tutors', path: '/(admin)/tutors', label: 'Репетиторы', icon: GraduationCap },
  { route: 'bookings', path: '/(admin)/bookings', label: 'Сделки', icon: Calendar },
  { route: 'payments', path: '/(admin)/payments', label: 'Платежи', icon: DollarSign },
  { route: 'tickets', path: '/(admin)/tickets', label: 'Обращения', icon: MessageSquare },
  { route: 'verifications', path: '/(admin)/verifications', label: 'Документы', icon: FileCheck },
  { route: 'audit', path: '/(admin)/audit', label: 'Журнал', icon: ScrollText },
  { route: 'settings', path: '/(admin)/settings', label: 'Настройки', icon: Settings },
  { route: 'profile', path: '/(admin)/profile', label: 'Я', icon: User },
];

export default function AdminLayout() {
  const { profile, loading, session, setSession, setProfile } = useAuthStore();
  const { isDesktop } = useResponsive();
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!loading && profile && profile.role !== 'admin') {
      router.replace('/');
    }
  }, [profile, loading]);

  // На десктопе — sidebar layout (Slot), на мобиле — Tabs внизу
  if (isDesktop) {
    const currentRoute = segments[segments.length - 1] || 'index';
    return (
      <View style={styles.row}>
        <View style={styles.sidebar}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>Репетиторы</Text>
            <Text style={styles.logoSub}>Админ-панель</Text>
          </View>
          <ScrollView contentContainerStyle={styles.navList}>
            {NAV.map(n => {
              const active = currentRoute === n.route || (currentRoute === '(admin)' && n.route === 'index');
              const Icon = n.icon;
              return (
                <TouchableOpacity key={n.route} style={[styles.navItem, active && styles.navItemActive]} onPress={() => router.push(n.path as any)}>
                  <Icon size={18} color={active ? '#fff' : COLORS.text} />
                  <Text style={[styles.navText, active && styles.navTextActive]}>{n.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.logoutItem} onPress={async () => {
            await supabase.auth.signOut();
            // onAuthStateChange в app/_layout.tsx сам перенаправит на login
          }}>
            <LogOut size={16} color={COLORS.error} />
            <Text style={styles.logoutText}>Выйти</Text>
          </TouchableOpacity>
          <Text style={styles.email}>{session?.user.email}</Text>
        </View>
        <View style={styles.content}>
          <Slot />
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: { backgroundColor: COLORS.white, borderTopColor: COLORS.border, height: 56 + insets.bottom, paddingBottom: insets.bottom + 4, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Главная', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="users" options={{ title: 'Юзеры', tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="tutors" options={{ title: 'Репет.', tabBarIcon: ({ color, size }) => <GraduationCap color={color} size={size} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Сделки', tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }} />
      <Tabs.Screen name="payments" options={{ title: 'Деньги', tabBarIcon: ({ color, size }) => <DollarSign color={color} size={size} /> }} />
      <Tabs.Screen name="tickets" options={{ title: 'Обращ.', tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} /> }} />
      <Tabs.Screen name="verifications" options={{ title: 'Док.', tabBarIcon: ({ color, size }) => <FileCheck color={color} size={size} /> }} />
      <Tabs.Screen name="audit" options={{ title: 'Журнал', tabBarIcon: ({ color, size }) => <ScrollText color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Настр.', tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Я', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  sidebar: { width: 240, backgroundColor: COLORS.white, borderRightWidth: 1, borderRightColor: COLORS.border, paddingVertical: 16 },
  logo: { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 12 },
  logoText: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  logoSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  navList: { paddingHorizontal: 8, gap: 2, flexGrow: 1 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  navItemActive: { backgroundColor: COLORS.primary },
  navText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  navTextActive: { color: '#fff', fontWeight: '700' },
  logoutItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 20, marginTop: 12 },
  logoutText: { fontSize: 13, color: COLORS.error, fontWeight: '600' },
  email: { fontSize: 11, color: COLORS.textSecondary, paddingHorizontal: 20, paddingTop: 8 },
  content: { flex: 1, backgroundColor: COLORS.background },
});

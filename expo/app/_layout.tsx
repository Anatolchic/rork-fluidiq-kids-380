import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import supabase from '../lib/supabase';
import { registerForPushNotifications, savePushToken } from '../lib/notifications';
import { useAuthStore } from '../stores/auth';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const { setSession, setProfile, setLoading } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        await loadProfile(session.user.id);
        const token = await registerForPushNotifications();
        if (token) savePushToken(session.user.id, token);
      }
      setLoading(false);
      setReady(true);
      SplashScreen.hideAsync();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        await loadProfile(session.user.id);
      } else {
        setProfile(null);
        router.replace('/(auth)/login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).single();
    if (data?.role) {
      setProfile({ role: data.role, userId });
      if (!ready) {
        if (data.role === 'student') router.replace('/(student)');
        else if (data.role === 'tutor') router.replace('/(tutor)');
        else if (data.role === 'admin') router.replace('/(admin)');
      }
    } else {
      router.replace('/(auth)/role-select');
    }
  }

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(student)" />
        <Stack.Screen name="(tutor)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="admin-user/[id]" options={{ headerShown: true, title: 'Пользователь', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="review/[bookingId]" options={{ headerShown: true, title: 'Отзыв', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="support" options={{ headerShown: true, title: 'Поддержка', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="tutor-setup" options={{ headerShown: true, title: 'Профиль репетитора', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="tutor/[id]" options={{ headerShown: true, title: '', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="booking/new" options={{ headerShown: true, title: 'Запись на урок', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: true, title: 'Бронирование', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: 'Чат', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </QueryClientProvider>
  );
}

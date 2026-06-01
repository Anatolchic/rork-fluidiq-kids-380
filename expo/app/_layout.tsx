import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import supabase from '../lib/supabase';
import { registerForPushNotifications, savePushToken } from '../lib/notifications';
import { useAuthStore } from '../stores/auth';
import { COLORS } from '../lib/constants';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

export default function RootLayout() {
  const { setSession, setProfile, setLoading } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Жёсткий таймаут на getSession — если Supabase недоступен,
        // не блокируем приложение бесконечно
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 8000)
        );
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        if (cancelled) return;
        setSession(session);
        if (session?.user) {
          await loadProfile(session.user.id);
          registerForPushNotifications().then(token => {
            if (token && session.user) savePushToken(session.user.id, token);
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('[init] error', e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setReady(true);
          SplashScreen.hideAsync().catch(() => {});
        }
      }
    }
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        await loadProfile(session.user.id);
      } else {
        setProfile(null);
        router.replace('/(auth)/login');
      }
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  async function loadProfile(userId: string) {
    try {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
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
    } catch (e) {
      console.warn('[loadProfile] error', e);
    }
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

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
        <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/verify-email" options={{ headerShown: false }} />
        <Stack.Screen name="tutor/[id]" options={{ headerShown: true, title: '', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="booking/new" options={{ headerShown: true, title: 'Запись на урок', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: true, title: 'Бронирование', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: 'Чат', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </QueryClientProvider>
  );
}

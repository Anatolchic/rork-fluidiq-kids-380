import { useEffect, useRef, useState } from 'react';
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
  // Дедупликация навигаций: на каждое обновление сессии (например refresh
  // токена каждые ~5 минут) onAuthStateChange выстреливает заново. Без
  // guard'а router.replace вызывается без необходимости и Safari/Rork
  // отрубает приложение ошибкой «history.replaceState() more than 100 times
  // per 10 seconds». Запоминаем последний путь и userId — не навигируем
  // повторно туда же, не перезагружаем профиль для того же пользователя.
  const lastNavigatedRef = useRef<string | null>(null);
  const lastLoadedUserIdRef = useRef<string | null>(null);

  function safeReplace(target: string) {
    if (lastNavigatedRef.current === target) return;
    lastNavigatedRef.current = target;
    router.replace(target as any);
  }

  useEffect(() => {
    let cancelled = false;

    // Failsafe: монтируем Stack через 1.5s даже если supabase висит — иначе
    // в Expo Go белый splash остаётся бесконечно (наблюдалось в проде).
    const failsafe = setTimeout(() => {
      if (!cancelled) {
        setReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }, 1500);

    async function init() {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 5000)
        );
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        if (cancelled) return;
        setSession(session);
        if (session?.user) {
          // НЕ await: иначе init блокируется, splash зависает
          loadProfile(session.user.id).catch(e => console.warn('[loadProfile]', e));
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
        if (lastLoadedUserIdRef.current !== session.user.id) {
          await loadProfile(session.user.id);
        }
      } else {
        setProfile(null);
        lastLoadedUserIdRef.current = null;
        safeReplace('/(auth)/login');
      }
    });

    return () => { cancelled = true; clearTimeout(failsafe); subscription.unsubscribe(); };
  }, []);

  async function loadProfile(userId: string) {
    try {
      lastLoadedUserIdRef.current = userId;
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
      if (data?.role) {
        setProfile({ role: data.role, userId });
        if (!ready) {
          if (data.role === 'student') safeReplace('/(student)');
          else if (data.role === 'tutor') safeReplace('/(tutor)');
          else if (data.role === 'admin') safeReplace('/(admin)');
        }
      } else {
        safeReplace('/(auth)/role-select');
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
        <Stack.Screen name="verification" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/verify-email" options={{ headerShown: false }} />
        <Stack.Screen name="tutor/[id]" options={{ headerShown: true, title: '', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="booking/new" options={{ headerShown: true, title: 'Запись на урок', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: true, title: 'Бронирование', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: 'Чат', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="chat/direct/[id]" options={{ headerShown: true, title: 'Чат', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </QueryClientProvider>
  );
}

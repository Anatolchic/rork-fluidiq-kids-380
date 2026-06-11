import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import supabase from '../lib/supabase';
import { registerForPushNotifications, savePushToken } from '../lib/notifications';
import { useAuthStore } from '../stores/auth';
import { COLORS } from '../lib/constants';
import { VpnNotice } from '../components/VpnNotice';

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        if (lastLoadedUserIdRef.current !== session.user.id) {
          // НЕ await — иначе supabase-js может зависнуть на signIn пока
          // loadProfile не закончит (наблюдалось как «Сервер не отвечает»)
          loadProfile(session.user.id).catch(e => console.warn('[loadProfile]', e));
        }
      } else if (event === 'SIGNED_OUT') {
        // Редиректим на login ТОЛЬКО на явный logout. На INITIAL_SESSION с
        // session=null (холодный старт без сохранённой сессии) — не редиректим,
        // потому что _layout сам отрендерит /(auth)/login через файл-роутинг.
        // Раньше любой null валил пользователя на login даже после reload c
        // valid сессией в localStorage.
        setProfile(null);
        lastLoadedUserIdRef.current = null;
        safeReplace('/(auth)/login');
      }
    });

    return () => { cancelled = true; clearTimeout(failsafe); subscription.unsubscribe(); };
  }, []);

  async function loadProfile(userId: string) {
    // Retry до 3 раз — иначе плохой ответ network может выбросить
    // на role-select даже у пользователя с ролью.
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await supabase
          .from('user_roles').select('role')
          .eq('user_id', userId).maybeSingle();
        if (error) { lastErr = error; await new Promise(r => setTimeout(r, 400 * (attempt + 1))); continue; }
        if (data?.role) {
          lastLoadedUserIdRef.current = userId;
          setProfile({ role: data.role, userId });
          if (!ready) {
            if (data.role === 'student') safeReplace('/(student)');
            else if (data.role === 'tutor') safeReplace('/(tutor)');
            else if (data.role === 'admin') safeReplace('/(admin)');
          }
          return;
        }
        // data=null И нет ошибки → реально нет роли → role-select
        lastLoadedUserIdRef.current = userId;
        safeReplace('/(auth)/role-select');
        return;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    console.warn('[loadProfile] all retries failed, keeping user where they are', lastErr);
    // НЕ навигируем — пусть остаётся на текущем экране, попробуем при
    // следующем onAuthStateChange. Не сбрасываем lastLoadedUserIdRef
    // чтобы повторить попытку при следующем событии.
  }

  if (!ready) {
    return (
      <WebFrame>
        <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </WebFrame>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <WebFrame>
        <VpnNotice />
        <Stack screenOptions={{ headerShown: false, gestureEnabled: true, animation: 'slide_from_right' }}>
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
      </WebFrame>
    </QueryClientProvider>
  );
}

// На web React Native растягивает root на всю ширину окна — превью в эмуляторе
// и в браузере выглядит «крупным». Оборачиваем приложение в контейнер с
// max-width=480px, центрируем и подкладываем мягкий фон вокруг. На native
// (iOS/Android) этот компонент — просто проброс детей.
function WebFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={webFrameStyles.outer}>
      <View style={webFrameStyles.phone}>{children}</View>
    </View>
  );
}

const webFrameStyles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
    justifyContent: 'center',
    // height: '100vh' на web — без этого root коллапсируется
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : {}),
  },
  phone: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          height: '100vh',
          maxHeight: '100vh',
          boxShadow: '0 10px 40px rgba(20,20,60,0.12)',
        } as any)
      : {}),
  },
});

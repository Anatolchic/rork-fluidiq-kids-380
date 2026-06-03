// Web Push регистрация через VAPID + Service Worker.
// Используется только в браузере (Platform.OS === 'web'). На native платформах
// уведомления идут через Expo Push (см. lib/notifications.ts).
//
// Поток:
//   1) Проверяем поддержку (serviceWorker + PushManager).
//   2) Регистрируем /sw.js (он уже умеет обрабатывать 'push' и 'notificationclick').
//   3) Запрашиваем разрешение Notification.requestPermission().
//   4) PushManager.subscribe c VAPID applicationServerKey.
//   5) Сохраняем JSON подписку в push_tokens с platform='web'.

import supabase from './supabase';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

/** base64url → Uint8Array — формат VAPID public key для applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getOrRegisterSW(): Promise<ServiceWorkerRegistration | null> {
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (e) {
    console.warn('[web-push] sw register failed', e);
    return null;
  }
}

/**
 * Регистрирует Web Push для пользователя и сохраняет подписку в push_tokens.
 * Возвращает true если подписка создана/обновлена, иначе false.
 */
export async function registerWebPush(userId: string): Promise<boolean> {
  if (!isWebPushSupported()) {
    console.warn('[web-push] не поддерживается в этом браузере');
    return false;
  }
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[web-push] EXPO_PUBLIC_VAPID_PUBLIC_KEY не задан');
    return false;
  }

  const reg = await getOrRegisterSW();
  if (!reg) return false;

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    console.warn('[web-push] permission =', permission);
    return false;
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (e) {
      console.warn('[web-push] subscribe failed', e);
      return false;
    }
  }

  const token = JSON.stringify(sub.toJSON());

  // Сохраняем подписку. В существующей схеме push_tokens.user_id — PRIMARY KEY,
  // поэтому upsert по user_id заменит токен предыдущего устройства этого юзера
  // (это устраивающий нас компромисс до перехода на составной ключ).
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform: 'web', updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) {
    console.warn('[web-push] save token failed', error.message);
    return false;
  }
  return true;
}

/**
 * Снимает подписку Web Push и удаляет токен из push_tokens.
 */
export async function unregisterWebPush(): Promise<void> {
  if (!isWebPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const token = JSON.stringify(sub.toJSON());
      await sub.unsubscribe();
      await supabase.from('push_tokens').delete().eq('token', token).eq('platform', 'web');
    } else {
      // На всякий случай — чистим веб-токены текущего юзера.
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (userId) {
        await supabase.from('push_tokens').delete().eq('user_id', userId).eq('platform', 'web');
      }
    }
  } catch (e) {
    console.warn('[web-push] unregister failed', e);
  }
}

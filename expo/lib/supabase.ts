import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Fallback-значения — используются если .env не подхватился по любой причине
// (например, Expo Go не успел загрузить env, кэш bundle, проблема с babel-плагином).
// Anon-key публичный по дизайну (роль anon Supabase), всё равно встраивается в любой
// клиентский bundle — безопасно хранить в коде.
const FALLBACK_URL = 'https://supabase.repetitory-app.ru';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwMjIwMjg2LCJleHAiOjIwOTU1ODAyODZ9.80_WkEQbxzR2yQxPmXyVTRCfv_tv0jf9Y7uYAKhIJBA';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

// Безопасная обёртка с 1.5s timeout — если localStorage висит (private
// mode, политика браузера, расширения, корпоративный прокси), вернём
// fallback не блокируя signInWithPassword. Был баг «Сервер не отвечает»
// из-за того что supabase-js await'ит storage.setItem.
function withFastTimeout<T>(fn: () => T, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const id = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, 1500);
    try {
      const v = fn();
      if (!done) { done = true; clearTimeout(id); resolve(v); }
    } catch {
      if (!done) { done = true; clearTimeout(id); resolve(fallback); }
    }
  });
}

const WebStorageAdapter = {
  getItem: (key: string) =>
    withFastTimeout<string | null>(() => (isBrowser ? window.localStorage.getItem(key) : null), null),
  setItem: (key: string, value: string) =>
    withFastTimeout<void>(() => { if (isBrowser) window.localStorage.setItem(key, value); }, undefined),
  removeItem: (key: string) =>
    withFastTimeout<void>(() => { if (isBrowser) window.localStorage.removeItem(key); }, undefined),
};

// ВАЖНО: на native используем AsyncStorage вместо expo-secure-store.
// SecureStore имеет лимит ~2KB на значение, а Supabase session
// (access_token + refresh_token) обычно больше — это вызывает зависание
// signInWithPassword в Expo Go (promise никогда не резолвится).
const storage = Platform.OS === 'web' ? WebStorageAdapter : AsyncStorage;

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;

    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: storage as any,
        autoRefreshToken: isBrowser || Platform.OS !== 'web',
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

/**
 * Lazy-initialized Supabase client.
 * The client is created on first access to avoid module-level
 * initialization errors when env vars aren't available yet (e.g. in Expo Go).
 */
const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getClient() as any)[prop];
  },
});

export default supabase;

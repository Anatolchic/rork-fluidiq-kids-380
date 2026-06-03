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

const WebStorageAdapter = {
  getItem: (key: string) => Promise.resolve(isBrowser ? window.localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (isBrowser) window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (isBrowser) window.localStorage.removeItem(key);
    return Promise.resolve();
  },
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

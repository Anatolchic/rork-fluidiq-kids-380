import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

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

const NativeStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const storage = Platform.OS === 'web' ? WebStorageAdapter : NativeStorageAdapter;

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required. ' +
        'Make sure they are set in your .env file.'
      );
    }

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

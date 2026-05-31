import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const SecureStoreAdapter = {
  getItem: (key: string) => Platform.OS === 'web' ? Promise.resolve(localStorage.getItem(key)) : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => { if (Platform.OS === 'web') { localStorage.setItem(key, value); return Promise.resolve(); } return SecureStore.setItemAsync(key, value); },
  removeItem: (key: string) => { if (Platform.OS === 'web') { localStorage.removeItem(key); return Promise.resolve(); } return SecureStore.deleteItemAsync(key); },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: SecureStoreAdapter as any, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
export default supabase;

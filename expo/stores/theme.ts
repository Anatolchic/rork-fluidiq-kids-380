import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from '../lib/theme';

type S = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
};

export const useThemeStore = create<S>()(
  persist(
    set => ({
      mode: 'system' as ThemeMode,
      setMode: m => set({ mode: m }),
    }),
    {
      name: 'theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

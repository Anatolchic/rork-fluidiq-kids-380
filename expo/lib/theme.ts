import { useColorScheme } from 'react-native';
import { useThemeStore } from '../stores/theme';

export const LIGHT_COLORS = {
  primary: '#6C63FF', primaryDark: '#5048CC', primaryLight: '#EEF0FF',
  secondary: '#FF6584',
  background: '#F8F9FF', white: '#FFFFFF', surface: '#FFFFFF', card: '#FFFFFF',
  text: '#1A1A2E', textSecondary: '#666680', border: '#E8E8F0',
  success: '#4CAF50', warning: '#FF9800', error: '#F44336', star: '#FFD700',
};

export const DARK_COLORS = {
  primary: '#8B85FF', primaryDark: '#6C63FF', primaryLight: '#2A2750',
  secondary: '#FF7A93',
  background: '#0A0E1A', white: '#1A1F2E', surface: '#1A1F2E', card: '#1A1F2E',
  text: '#F3F4F6', textSecondary: '#9CA3AF', border: '#374151',
  success: '#34D399', warning: '#FBBF24', error: '#F87171', star: '#FBBF24',
};

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorSet = typeof LIGHT_COLORS;

export function useColors(): ColorSet {
  const mode = useThemeStore(s => s.mode);
  const system = useColorScheme();
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  return isDark ? DARK_COLORS : LIGHT_COLORS;
}

export function useIsDark(): boolean {
  const mode = useThemeStore(s => s.mode);
  const system = useColorScheme();
  return mode === 'dark' || (mode === 'system' && system === 'dark');
}

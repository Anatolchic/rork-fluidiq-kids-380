import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '../../lib/constants';

// Регистрация теперь на едином экране /(auth)/login через сегментный тогл.
// Этот экран — редирект для обратной совместимости старых ссылок.
export default function RegisterRedirect() {
  useEffect(() => {
    const t = setTimeout(() => router.replace('/(auth)/login'), 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

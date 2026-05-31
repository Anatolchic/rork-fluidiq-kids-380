import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/auth';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '../lib/constants';

export default function Index() {
  const { session, profile, loading } = useAuthStore();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile) return <Redirect href="/(auth)/role-select" />;
  if (profile.role === 'student') return <Redirect href="/(student)" />;
  if (profile.role === 'tutor') return <Redirect href="/(tutor)" />;
  return <Redirect href="/(auth)/login" />;
}

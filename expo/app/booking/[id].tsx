import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../lib/constants';

export default function BookingDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🚧</Text>
        <Text style={styles.title}>Экран бронирования в разработке</Text>
        <Text style={styles.sub}>booking id: {id}</Text>
        <Text style={styles.hint}>Здесь будут детали урока, чат, кнопка «Начать урок», возможность отменить.</Text>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20, justifyContent: 'center' },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 24, alignItems: 'center', gap: 8 },
  emoji: { fontSize: 56 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  sub: { fontSize: 12, color: COLORS.textSecondary },
  hint: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 18, marginTop: 8 },
});

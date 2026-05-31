import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../lib/constants';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Не найдено' }} />
      <View style={styles.container}>
        <Text style={styles.emoji}>🔍</Text>
        <Text style={styles.title}>Страница не найдена</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>На главную →</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: COLORS.background, gap: 12 },
  emoji: { fontSize: 64 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  link: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: COLORS.primary, borderRadius: 12 },
  linkText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});

import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { COLORS } from '../../lib/constants';

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.emoji}>📹</Text>
        <Text style={styles.title}>Видеоурок в разработке</Text>
        <Text style={styles.sub}>booking id: {id}</Text>
        <Text style={styles.hint}>WebRTC через coturn (5.35.87.176), адаптивный битрейт, auto-reconnect, Y.js доска.</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeText}>Закрыть</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  emoji: { fontSize: 64 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  sub: { fontSize: 12, color: '#ffffff70' },
  hint: { fontSize: 13, color: '#ffffffaa', textAlign: 'center', lineHeight: 18, marginTop: 8, paddingHorizontal: 20 },
  closeBtn: { marginTop: 24, paddingHorizontal: 28, paddingVertical: 14, backgroundColor: '#ffffff20', borderRadius: 12, borderWidth: 1, borderColor: '#ffffff40' },
  closeText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

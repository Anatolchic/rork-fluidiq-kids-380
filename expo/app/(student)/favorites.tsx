import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { TutorProfile } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';
import { useResponsive } from '../../lib/responsive';

export default function Favorites() {
  const { session } = useAuthStore();
  const { contentMaxWidth, gridCols } = useResponsive();
  const [tutors, setTutors] = useState<TutorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { if (session) fetchFavorites(); }, [session]);

  async function fetchFavorites() {
    setLoading(true);
    const { data: profile } = await supabase.from('student_profiles').select('favorites').eq('user_id', session!.user.id).single();
    if (!profile?.favorites?.length) { setTutors([]); setLoading(false); return; }
    const { data } = await supabase.from('tutor_profiles').select('*').in('user_id', profile.favorites);
    setTutors(data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchFavorites(); setRefreshing(false); }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}><Text style={styles.title}>Избранное</Text></View>
      {loading ? (
        <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={tutors}
          key={`fav-${gridCols}`}
          keyExtractor={item => item.id}
          numColumns={gridCols}
          columnWrapperStyle={gridCols > 1 ? { gap: 12 } : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          contentContainerStyle={[styles.list, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.card, gridCols > 1 && { flex: 1 }]} onPress={() => router.push(`/tutor/${item.user_id}`)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.subjects} numberOfLines={1}>{item.subjects.slice(0, 3).join(' · ')}</Text>
                <Text style={styles.price}>{(item.price_per_hour / 100).toLocaleString('ru')} ₽/час · ⭐ {item.rating > 0 ? item.rating.toFixed(1) : 'Новый'}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>❤️</Text>
              <Text style={styles.emptyText}>Избранное пусто</Text>
              <Text style={styles.emptySubtext}>Добавляйте репетиторов, нажав ❤️ в профиле</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  subjects: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },
  price: { fontSize: 13, color: COLORS.textSecondary },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  emptySubtext: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
});

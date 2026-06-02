import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import supabase from '../../lib/supabase';
import { COLORS, BOOKING_STATUS_LABELS } from '../../lib/constants';
import { Booking } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';
import { ListSkeleton } from '../../lib/Skeleton';
import { loadBookings } from '../../lib/bookings';
import { useResponsive } from '../../lib/responsive';

export default function StudentBookings() {
  const { session } = useAuthStore();
  const { contentMaxWidth } = useResponsive();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => { if (session) fetchBookings(); }, [session, tab]);

  async function fetchBookings() {
    setLoading(true);
    const now = new Date().toISOString();
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('student_id', session!.user.id)
      .order('start_time', { ascending: tab === 'upcoming' });

    if (tab === 'upcoming') {
      query = query.gte('start_time', now).in('status', ['pending', 'confirmed', 'active']);
    } else {
      query = query.in('status', ['completed', 'cancelled']);
    }

    const data = await loadBookings(query.limit(30));
    setBookings(data as any);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBookings();
    setRefreshing(false);
  }, [tab]);

  function getStatusColor(status: string) {
    const map: Record<string, string> = {
      pending: COLORS.warning, confirmed: COLORS.success,
      active: COLORS.primary, completed: COLORS.textSecondary, cancelled: COLORS.error,
    };
    return map[status] || COLORS.textSecondary;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}>
        <Text style={styles.title}>Мои уроки</Text>
        <View style={styles.tabs}>
          {[{ key: 'upcoming', label: 'Предстоящие' }, { key: 'past', label: 'Прошедшие' }].map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key as any)}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ListSkeleton count={3} />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          contentContainerStyle={[styles.list, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/booking/${item.id}`)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardSubject}>{item.subject}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                    {BOOKING_STATUS_LABELS[item.status]}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardTutor}>
                👤 {(item as any).tutor?.name || 'Репетитор'}
              </Text>
              <Text style={styles.cardDate}>
                📅 {format(new Date(item.start_time), 'd MMMM, HH:mm', { locale: ru })} · {item.duration} мин
              </Text>
              <Text style={styles.cardPrice}>{(item.price / 100).toLocaleString('ru')} ₽</Text>
              {item.status === 'active' && (
                <TouchableOpacity style={styles.joinBtn} onPress={() => router.push(`/call/${item.id}`)}>
                  <Text style={styles.joinBtnText}>📹 Войти в урок</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{tab === 'upcoming' ? '📅' : '📚'}</Text>
              <Text style={styles.emptyText}>{tab === 'upcoming' ? 'Нет предстоящих уроков' : 'История пуста'}</Text>
              {tab === 'upcoming' && (
                <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(student)')}>
                  <Text style={styles.emptyBtnText}>Найти репетитора →</Text>
                </TouchableOpacity>
              )}
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
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  tabTextActive: { color: COLORS.white, fontWeight: '600' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSubject: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardTutor: { fontSize: 14, color: COLORS.textSecondary },
  cardDate: { fontSize: 13, color: COLORS.textSecondary },
  cardPrice: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  joinBtn: { marginTop: 8, backgroundColor: COLORS.primary, borderRadius: 10, padding: 12, alignItems: 'center' },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  emptyBtn: { marginTop: 8, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

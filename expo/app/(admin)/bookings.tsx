import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import supabase from '../../lib/supabase';
import { COLORS, BOOKING_STATUS_LABELS } from '../../lib/constants';
import { loadBookings, BookingWithParticipants } from '../../lib/bookings';
import { usePagination } from '../../lib/pagination';

const PAGE_SIZE = 20;

export default function AdminBookings() {
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  // fetcher пересоздаётся при смене filter — usePagination это ловит через refresh()
  // ниже (вызывается из useEffect(filter)).
  const fetcher = useCallback(
    async (from: number, to: number) => {
      let q = supabase
        .from('bookings')
        .select('*')
        .order('start_time', { ascending: false })
        .range(from, to);
      if (filter) q = q.eq('status', filter);
      return (await loadBookings(q)) as BookingWithParticipants[];
    },
    [filter],
  );

  const { items, loading, loadingMore, hasMore, loadMore, refresh } =
    usePagination<BookingWithParticipants>(fetcher, PAGE_SIZE);

  // Когда меняется filter — fetcher уже обновился через ref внутри хука, нам остаётся
  // дёрнуть refresh(). Первый рендер пропускаем — initial load делает сам хук.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Все бронирования</Text>
        <View style={s.filters}>
          {[
            { k: null, l: `Все` },
            { k: 'pending', l: 'Ожидают' },
            { k: 'confirmed', l: 'Подтв.' },
            { k: 'active', l: 'Идут' },
            { k: 'completed', l: 'Завершены' },
            { k: 'cancelled', l: 'Отменены' },
          ].map(f => (
            <TouchableOpacity key={String(f.k)} style={[s.chip, filter === f.k && s.chipActive]} onPress={() => setFilter(f.k)}>
              <Text style={[s.chipText, filter === f.k && s.chipTextActive]}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/booking/${item.id}`)}>
              <View style={s.cardTop}>
                <Text style={s.cardSubject}>{item.subject}</Text>
                <View style={[s.pill, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                  <Text style={[s.pillText, { color: getStatusColor(item.status) }]}>{BOOKING_STATUS_LABELS[item.status]}</Text>
                </View>
              </View>
              <View style={s.line}>
                <TouchableOpacity onPress={() => router.push(`/admin-user/${item.tutor_id}`)}>
                  <Text style={s.link}>👨‍🏫 {item.tutor?.name || '—'}</Text>
                </TouchableOpacity>
                <Text style={s.dim}> · </Text>
                <TouchableOpacity onPress={() => router.push(`/admin-user/${item.student_id}`)}>
                  <Text style={s.link}>👤 {item.student?.name || '—'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.meta}>📅 {format(new Date(item.start_time), 'd MMMM yyyy, HH:mm', { locale: ru })} · {item.duration} мин</Text>
              <Text style={s.meta}>💰 {(item.price / 100).toLocaleString('ru')} ₽ · Комиссия: {(item.commission / 100).toLocaleString('ru')} ₽</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.dim}>Нет бронирований</Text></View>}
          ListFooterComponent={
            items.length === 0 ? null : hasMore ? (
              <TouchableOpacity style={s.moreBtn} onPress={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <Text style={s.moreBtnText}>Загрузить ещё</Text>
                )}
              </TouchableOpacity>
            ) : (
              <Text style={s.endLabel}>Это всё</Text>
            )
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (hasMore && !loadingMore) loadMore(); }}
        />
      )}
    </SafeAreaView>
  );
}

function getStatusColor(s: string) {
  const m: Record<string, string> = { pending: COLORS.warning, confirmed: COLORS.success, active: COLORS.primary, completed: COLORS.textSecondary, cancelled: COLORS.error };
  return m[s] || COLORS.textSecondary;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dim: { color: COLORS.textSecondary },
  header: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  filters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 11, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 12, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSubject: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  link: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  meta: { fontSize: 12, color: COLORS.textSecondary },
  empty: { padding: 40, alignItems: 'center' },
  moreBtn: { marginTop: 12, marginBottom: 24, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, minWidth: 180, alignItems: 'center' },
  moreBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  endLabel: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 11, paddingVertical: 16 },
});

import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import supabase from '../../lib/supabase';
import { COLORS, BOOKING_STATUS_LABELS } from '../../lib/constants';

export default function AdminBookings() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    let q = supabase.from('bookings').select('*, tutor:tutor_profiles!tutor_id(name), student:student_profiles!student_id(name, user_id)').order('start_time', { ascending: false });
    if (filter) q = q.eq('status', filter);
    const { data } = await q.limit(200);
    setList(data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [filter]);

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
          data={list}
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
});

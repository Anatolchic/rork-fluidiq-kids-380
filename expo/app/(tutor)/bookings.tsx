import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, X } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS, BOOKING_STATUS_LABELS } from '../../lib/constants';
import { Booking } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';

type Tab = 'pending' | 'upcoming' | 'past';

export default function TutorBookings() {
  const { session } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('pending');

  useEffect(() => { if (session) load(); }, [session, tab]);

  async function load() {
    setLoading(true);
    let q = supabase
      .from('bookings')
      .select('*, student:student_profiles!student_id(*)')
      .eq('tutor_id', session!.user.id);

    const now = new Date().toISOString();
    if (tab === 'pending') q = q.eq('status', 'pending').order('created_at', { ascending: false });
    else if (tab === 'upcoming') q = q.in('status', ['confirmed', 'active']).gte('start_time', now).order('start_time', { ascending: true });
    else q = q.in('status', ['completed', 'cancelled']).order('start_time', { ascending: false });

    const { data } = await q.limit(50);
    setBookings((data as any) || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [tab]);

  async function confirm(b: Booking) {
    const { error } = await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', b.id);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    load();
  }
  async function decline(b: Booking) {
    Alert.alert('Отклонить заявку?', 'Ученик получит уведомление об отмене', [
      { text: 'Отмена' },
      { text: 'Отклонить', style: 'destructive', onPress: async () => {
        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', b.id);
        load();
      }},
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Заявки</Text>
        <View style={styles.tabs}>
          {([
            { key: 'pending', label: 'Новые' },
            { key: 'upcoming', label: 'Подтверждены' },
            { key: 'past', label: 'История' },
          ] as { key: Tab; label: string }[]).map(t => (
            <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/booking/${item.id}`)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardSubject}>{item.subject}</Text>
                <View style={[styles.pill, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                  <Text style={[styles.pillText, { color: getStatusColor(item.status) }]}>{BOOKING_STATUS_LABELS[item.status]}</Text>
                </View>
              </View>
              <Text style={styles.cardLine}>👤 {(item as any).student?.name || 'Ученик'}</Text>
              <Text style={styles.cardLine}>📅 {format(new Date(item.start_time), 'd MMMM, HH:mm', { locale: ru })} · {item.duration} мин</Text>
              <Text style={styles.cardLine}>📚 Уровень: {item.level}</Text>
              {item.topic && <Text style={styles.cardLine}>🎯 Тема: {item.topic}</Text>}
              <Text style={styles.cardPrice}>{(item.price / 100).toLocaleString('ru')} ₽</Text>

              {item.status === 'pending' && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.declineBtn} onPress={() => decline(item)}>
                    <X size={16} color={COLORS.error} />
                    <Text style={styles.declineText}>Отклонить</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirm(item)}>
                    <Check size={16} color="#fff" />
                    <Text style={styles.confirmText}>Подтвердить</Text>
                  </TouchableOpacity>
                </View>
              )}
              {item.status === 'active' && (
                <TouchableOpacity style={styles.joinBtn} onPress={() => router.push(`/call/${item.id}`)}>
                  <Text style={styles.joinText}>📹 Войти в урок</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{tab === 'pending' ? '📥' : tab === 'upcoming' ? '📅' : '📚'}</Text>
              <Text style={styles.emptyText}>
                {tab === 'pending' ? 'Нет новых заявок' : tab === 'upcoming' ? 'Нет подтверждённых уроков' : 'История пуста'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function getStatusColor(s: string): string {
  const m: Record<string, string> = { pending: COLORS.warning, confirmed: COLORS.success, active: COLORS.primary, completed: COLORS.textSecondary, cancelled: COLORS.error };
  return m[s] || COLORS.textSecondary;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardSubject: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '600' },
  cardLine: { fontSize: 13, color: COLORS.textSecondary },
  cardPrice: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  declineBtn: { flex: 1, height: 42, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: COLORS.error + '15', borderRadius: 10 },
  declineText: { color: COLORS.error, fontSize: 13, fontWeight: '700' },
  confirmBtn: { flex: 1.5, height: 42, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 10 },
  confirmText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  joinBtn: { marginTop: 8, height: 42, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 10 },
  joinText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
});

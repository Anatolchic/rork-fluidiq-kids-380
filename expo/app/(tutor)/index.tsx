import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AlertTriangle, TrendingUp, Star, Users, Eye, EyeOff } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS, BOOKING_STATUS_LABELS, MIN_BALANCE_KOPECKS } from '../../lib/constants';
import { Booking, TutorProfile } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';
import { loadBookings } from '../../lib/bookings';
import NotificationBell from '../../components/NotificationBell';

export default function TutorHome() {
  const { session } = useAuthStore();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [stats, setStats] = useState({ totalLessons: 0, rating: 0, reviewsCount: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { if (session) load(); }, [session]);

  async function load() {
    setLoading(true);
    const [p, bookings, s] = await Promise.all([
      supabase.from('tutor_profiles').select('*').eq('user_id', session!.user.id).maybeSingle(),
      loadBookings(
        supabase.from('bookings').select('*').eq('tutor_id', session!.user.id)
          .gte('start_time', new Date().toISOString())
          .in('status', ['pending', 'confirmed', 'active'])
          .order('start_time', { ascending: true }).limit(5)
      ),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('tutor_id', session!.user.id).eq('status', 'completed'),
    ]);
    if (p.data) {
      setProfile(p.data);
      setStats(prev => ({ ...prev, rating: p.data.rating || 0, reviewsCount: p.data.reviews_count || 0 }));
    }
    setUpcoming(bookings as any);
    setStats(prev => ({ ...prev, totalLessons: s.count || 0 }));
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [session]);

  async function togglePublish() {
    if (!profile) return;
    if (!profile.is_published) {
      const ready = profile.name && profile.photo_url && profile.subjects.length && profile.levels.length && profile.bio.length >= 20;
      if (!ready) {
        Alert.alert('Заполните профиль', 'Перед публикацией нужны: имя, фото, предметы, уровни и описание не короче 20 символов.');
        return;
      }
    }
    const { error } = await supabase.from('tutor_profiles').update({ is_published: !profile.is_published }).eq('user_id', session!.user.id);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    setProfile({ ...profile, is_published: !profile.is_published });
  }

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  const lowBalance = (profile?.balance ?? 0) < MIN_BALANCE_KOPECKS;
  const balanceRub = ((profile?.balance ?? 0) / 100).toLocaleString('ru');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Здравствуйте,</Text>
            <Text style={styles.name}>{profile?.name || 'Репетитор'}</Text>
          </View>
          <NotificationBell />
          <TouchableOpacity style={[styles.publishBadge, profile?.is_published ? styles.publishBadgeOn : styles.publishBadgeOff]} onPress={togglePublish}>
            {profile?.is_published ? <Eye size={14} color={COLORS.success} /> : <EyeOff size={14} color={COLORS.textSecondary} />}
            <Text style={[styles.publishText, { color: profile?.is_published ? COLORS.success : COLORS.textSecondary }]}>
              {profile?.is_published ? 'Виден' : 'Скрыт'}
            </Text>
          </TouchableOpacity>
        </View>

        {lowBalance && (
          <TouchableOpacity style={styles.warningCard} onPress={() => router.push('/(tutor)/wallet')}>
            <AlertTriangle size={20} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Низкий баланс: {balanceRub} ₽</Text>
              <Text style={styles.warningSub}>Чтобы начать урок, нужно минимум {MIN_BALANCE_KOPECKS / 100} ₽. Пополнить →</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <TrendingUp size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{stats.totalLessons}</Text>
            <Text style={styles.statLabel}>уроков</Text>
          </View>
          <View style={styles.statCard}>
            <Star size={20} color={COLORS.star} />
            <Text style={styles.statValue}>{stats.rating > 0 ? stats.rating.toFixed(1) : '—'}</Text>
            <Text style={styles.statLabel}>рейтинг</Text>
          </View>
          <View style={styles.statCard}>
            <Users size={20} color={COLORS.success} />
            <Text style={styles.statValue}>{stats.reviewsCount}</Text>
            <Text style={styles.statLabel}>отзывов</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ближайшие уроки</Text>
            {upcoming.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tutor)/bookings')}>
                <Text style={styles.sectionLink}>Все →</Text>
              </TouchableOpacity>
            )}
          </View>
          {upcoming.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyText}>Пока нет уроков</Text>
              <Text style={styles.emptySub}>
                {profile?.is_published ? 'Ученики скоро вас найдут' : 'Опубликуйте профиль, чтобы получить заявки'}
              </Text>
            </View>
          ) : (
            upcoming.map(b => (
              <TouchableOpacity key={b.id} style={styles.bookingCard} onPress={() => router.push(`/booking/${b.id}`)}>
                <View style={styles.bookingTop}>
                  <Text style={styles.bookingSubject}>{b.subject}</Text>
                  <View style={[styles.statusPill, { backgroundColor: getStatusColor(b.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(b.status) }]}>{BOOKING_STATUS_LABELS[b.status]}</Text>
                  </View>
                </View>
                <Text style={styles.bookingStudent}>👤 {(b as any).student?.name || 'Ученик'}</Text>
                <Text style={styles.bookingTime}>📅 {format(new Date(b.start_time), 'd MMMM, HH:mm', { locale: ru })} · {b.duration} мин</Text>
                <Text style={styles.bookingPrice}>{(b.price / 100).toLocaleString('ru')} ₽</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStatusColor(s: string): string {
  const m: Record<string, string> = { pending: COLORS.warning, confirmed: COLORS.success, active: COLORS.primary, completed: COLORS.textSecondary, cancelled: COLORS.error };
  return m[s] || COLORS.textSecondary;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scroll: { padding: 16, gap: 16, maxWidth: 880, alignSelf: 'center' as any, width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingTop: 8 },
  greeting: { fontSize: 14, color: COLORS.textSecondary },
  name: { fontSize: 26, fontWeight: '700', color: COLORS.text },
  publishBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  publishBadgeOn: { backgroundColor: COLORS.success + '15', borderColor: COLORS.success + '40' },
  publishBadgeOff: { backgroundColor: COLORS.white, borderColor: COLORS.border },
  publishText: { fontSize: 12, fontWeight: '600' },
  warningCard: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.warning + '15', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.warning + '30', alignItems: 'center' },
  warningTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  warningSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  sectionLink: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  emptyCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 24, alignItems: 'center', gap: 6 },
  emptyEmoji: { fontSize: 36 },
  emptyText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  bookingCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 4 },
  bookingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookingSubject: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  bookingStudent: { fontSize: 13, color: COLORS.textSecondary },
  bookingTime: { fontSize: 13, color: COLORS.textSecondary },
  bookingPrice: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 2 },
});

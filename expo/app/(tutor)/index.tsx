import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, Alert, Pressable, Animated } from 'react-native';
import { router } from 'expo-router';
import { format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  AlertTriangle, TrendingUp, Star, MessageSquare, Eye, EyeOff,
  Calendar, User, Sun, Sunrise, Moon,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const GreetIcon = hour < 6 ? Moon : hour < 12 ? Sunrise : hour < 18 ? Sun : Moon;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
        {/* Приветствие */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.greetRow}>
              <GreetIcon size={14} color={COLORS.warning} />
              <Text style={styles.greeting}>{greeting},</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>{profile?.name || 'Репетитор'}</Text>
          </View>
          <View style={styles.headerActions}>
            <NotificationBell />
            <Pressable
              style={({ pressed }) => [
                styles.publishBadge,
                profile?.is_published ? styles.publishBadgeOn : styles.publishBadgeOff,
                { transform: [{ scale: pressed ? 0.96 : 1 }] },
              ]}
              onPress={togglePublish}
            >
              {profile?.is_published ? <Eye size={14} color={COLORS.success} /> : <EyeOff size={14} color={COLORS.textSecondary} />}
              <Text style={[styles.publishText, { color: profile?.is_published ? COLORS.success : COLORS.textSecondary }]}>
                {profile?.is_published ? 'Виден' : 'Скрыт'}
              </Text>
            </Pressable>
          </View>
        </View>

        {lowBalance && (
          <Pressable
            style={({ pressed }) => [
              styles.warningCard,
              { transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            onPress={() => router.push('/(tutor)/wallet')}
          >
            <View style={styles.warningIcon}>
              <AlertTriangle size={20} color={COLORS.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Низкий баланс: {balanceRub} ₽</Text>
              <Text style={styles.warningSub}>Чтобы начать урок, нужно минимум {MIN_BALANCE_KOPECKS / 100} ₽. Пополнить →</Text>
            </View>
          </Pressable>
        )}

        {/* Stat-карточки с градиентами */}
        <View style={styles.statsRow}>
          <StatCard
            colors={[COLORS.success, '#2E8B57']}
            Icon={TrendingUp}
            value={String(stats.totalLessons)}
            label="уроков"
            index={0}
          />
          <StatCard
            colors={['#FFD700', '#FFA000']}
            Icon={Star}
            value={stats.rating > 0 ? stats.rating.toFixed(1) : '—'}
            label="рейтинг"
            index={1}
          />
          <StatCard
            colors={[COLORS.primary, '#8B7FFF']}
            Icon={MessageSquare}
            value={String(stats.reviewsCount)}
            label="отзывов"
            index={2}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ближайшие уроки</Text>
            {upcoming.length > 0 && (
              <Pressable
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                onPress={() => router.push('/(tutor)/bookings')}
              >
                <Text style={styles.sectionLink}>Все →</Text>
              </Pressable>
            )}
          </View>
          {upcoming.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Calendar size={32} color={COLORS.primary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyText}>Пока нет уроков</Text>
              <Text style={styles.emptySub}>
                {profile?.is_published ? 'Ученики скоро вас найдут' : 'Опубликуйте профиль, чтобы получить заявки'}
              </Text>
            </View>
          ) : (
            upcoming.map((b, i) => (
              <BookingItem key={b.id} booking={b} index={i} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ colors, Icon, value, label, index }: { colors: [string, string]; Icon: any; value: string; label: string; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: index * 80, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 320, delay: index * 80, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[{ flex: 1, opacity, transform: [{ translateY: ty }] }]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statCard}
      >
        <Icon size={22} color="#fff" />
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

function BookingItem({ booking, index }: { booking: Booking; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: 200 + index * 70, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 320, delay: 200 + index * 70, useNativeDriver: true }),
    ]).start();
  }, []);

  const start = new Date(booking.start_time);
  const now = new Date();
  const minutesLeft = differenceInMinutes(start, now);
  const hoursLeft = differenceInHours(start, now);
  const daysLeft = differenceInDays(start, now);

  // Прогресс — 0..1 от 7 дней до 0 (за сутки до — почти полная шкала)
  const dayWindow = 7 * 24 * 60; // минут в 7 днях
  const progress = Math.max(0, Math.min(1, 1 - minutesLeft / dayWindow));

  let countdown = '';
  if (minutesLeft <= 0) countdown = 'Идёт сейчас';
  else if (minutesLeft < 60) countdown = `через ${minutesLeft} мин`;
  else if (hoursLeft < 24) countdown = `через ${hoursLeft} ч`;
  else countdown = `через ${daysLeft} дн.`;

  const statusColor = getStatusColor(booking.status);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.bookingCard,
          { transform: [{ scale: pressed ? 0.985 : 1 }] },
        ]}
        onPress={() => router.push(`/booking/${booking.id}`)}
      >
        <View style={styles.bookingTop}>
          <Text style={styles.bookingSubject} numberOfLines={1}>{booking.subject}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{BOOKING_STATUS_LABELS[booking.status]}</Text>
          </View>
        </View>
        <View style={styles.bookingMetaRow}>
          <User size={13} color={COLORS.textSecondary} />
          <Text style={styles.bookingMeta}>{(booking as any).student?.name || 'Ученик'}</Text>
        </View>
        <View style={styles.bookingMetaRow}>
          <Calendar size={13} color={COLORS.textSecondary} />
          <Text style={styles.bookingMeta}>{format(start, 'd MMMM, HH:mm', { locale: ru })} · {booking.duration} мин</Text>
        </View>

        <View style={styles.bookingFooter}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: statusColor }]} />
          </View>
          <Text style={[styles.countdown, { color: statusColor }]}>{countdown}</Text>
        </View>

        <Text style={styles.bookingPrice}>{(booking.price / 100).toLocaleString('ru')} ₽</Text>
      </Pressable>
    </Animated.View>
  );
}

function getStatusColor(s: string): string {
  const m: Record<string, string> = { pending: COLORS.warning, confirmed: COLORS.success, active: COLORS.primary, completed: COLORS.textSecondary, cancelled: COLORS.error };
  return m[s] || COLORS.textSecondary;
}

const cardShadow = {
  shadowColor: '#0006',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scroll: { padding: 16, gap: 18, maxWidth: 880, alignSelf: 'center' as any, width: '100%' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingTop: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  greeting: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  name: { fontSize: 30, fontWeight: '800', color: COLORS.text, marginTop: 2, letterSpacing: -0.5 },

  publishBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  publishBadgeOn: { backgroundColor: COLORS.success + '15', borderColor: COLORS.success + '40' },
  publishBadgeOff: { backgroundColor: COLORS.white, borderColor: COLORS.border },
  publishText: { fontSize: 12, fontWeight: '700' },

  warningCard: {
    flexDirection: 'row', gap: 12, backgroundColor: COLORS.warning + '15',
    borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.warning + '30', alignItems: 'center',
  },
  warningIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.warning + '20', justifyContent: 'center', alignItems: 'center' },
  warningTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  warningSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 17 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    borderRadius: 18, padding: 14, alignItems: 'flex-start', gap: 6,
    minHeight: 110,
    ...cardShadow,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, color: '#ffffffdd', fontWeight: '600' },

  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  sectionLink: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },

  emptyCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 28, alignItems: 'center', gap: 8,
    ...cardShadow,
  },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 18 },

  bookingCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16, gap: 6,
    ...cardShadow,
  },
  bookingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  bookingSubject: { fontSize: 16, fontWeight: '800', color: COLORS.text, flex: 1, letterSpacing: -0.3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  bookingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bookingMeta: { fontSize: 13, color: COLORS.textSecondary },

  bookingFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  progressBar: { flex: 1, height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  countdown: { fontSize: 12, fontWeight: '700' },

  bookingPrice: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginTop: 4, letterSpacing: -0.3 },
});

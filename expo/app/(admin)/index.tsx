import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, useWindowDimensions, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Users, GraduationCap, Calendar, DollarSign, MessageSquare, TrendingUp, Star, UserCog } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const cols = width > 900 ? 4 : width > 600 ? 3 : 2;

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('admin_dashboard_stats');
    setStats(data || {});
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, []);

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!stats) return <View style={s.loader}><Text style={s.dim}>Нет данных</Text></View>;

  const cards = [
    { label: 'Пользователей', value: stats.users_total, icon: Users, color: '#6C63FF', route: '/(admin)/users' },
    { label: 'Репетиторов', value: `${stats.tutors_published || 0} / ${stats.tutors_total || 0}`, icon: GraduationCap, color: '#a78bfa', route: '/(admin)/tutors' },
    { label: 'Учеников', value: stats.students_total, icon: Users, color: '#4CAF50', route: '/(admin)/users?role=student' },
    { label: 'Админов', value: stats.admins_total, icon: UserCog, color: '#FF9800', route: '/(admin)/profile' },
    { label: 'Бронирований', value: stats.bookings_total, icon: Calendar, color: '#6C63FF', route: '/(admin)/bookings' },
    { label: 'Завершено', value: stats.bookings_completed, icon: Calendar, color: '#4CAF50', route: '/(admin)/bookings?status=completed' },
    { label: 'Комиссия (₽)', value: (stats.commission_total_rub || 0).toLocaleString('ru'), icon: TrendingUp, color: '#FF6584', route: '/(admin)/payments' },
    { label: 'Пополнено (₽)', value: (stats.topup_total_rub || 0).toLocaleString('ru'), icon: DollarSign, color: '#4CAF50', route: '/(admin)/payments' },
    { label: 'Отзывов', value: stats.reviews_total, icon: Star, color: '#FFD700' },
    { label: 'Обращений', value: stats.tickets_open, icon: MessageSquare, color: stats.tickets_open > 0 ? '#F44336' : '#666', route: '/(admin)/tickets' },
    { label: 'DAU', value: stats.dau, icon: TrendingUp, color: '#1e5b7a' },
  ];

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={s.header}>
          <Text style={s.title}>Админ-панель</Text>
          <Text style={s.sub}>Репетиторы · мониторинг</Text>
        </View>

        <View style={[s.grid, { gap: 10 }]}>
          {cards.map((c, i) => {
            const cardW = `${(100 / cols) - 1}%`;
            const Ic = c.icon;
            return (
              <TouchableOpacity
                key={i}
                style={[s.statCard, { width: cardW as any }]}
                onPress={c.route ? () => router.push(c.route as any) : undefined}
                activeOpacity={c.route ? 0.6 : 1}
              >
                <View style={[s.iconWrap, { backgroundColor: c.color + '15' }]}><Ic size={18} color={c.color} /></View>
                <Text style={s.statValue}>{c.value ?? 0}</Text>
                <Text style={s.statLabel}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dim: { color: COLORS.textSecondary },
  scroll: { padding: 16, gap: 16 },
  header: { paddingHorizontal: 4, paddingTop: 8 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 6, minHeight: 100 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 2 },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },
});

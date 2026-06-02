import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Star, GraduationCap, Award } from 'lucide-react-native';
import { addDays, format, startOfMonth, addMonths } from 'date-fns';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { TutorProfile } from '../../lib/types';
import CalendarMonth from '../../components/CalendarMonth';

export default function PublicTutorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [avails, setAvails] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => { if (id) load(); }, [id, month]);

  async function load() {
    setLoading(true);
    const monthStart = startOfMonth(month).toISOString();
    const monthEnd = addMonths(startOfMonth(month), 1).toISOString();
    const [t, a, b, sub] = await Promise.all([
      supabase.from('tutor_profiles').select('*').eq('user_id', id).maybeSingle(),
      supabase.from('tutor_availability').select('*').eq('tutor_id', id),
      supabase.from('bookings').select('start_time, end_time, status').eq('tutor_id', id)
        .gte('start_time', monthStart).lt('start_time', monthEnd)
        .in('status', ['pending', 'confirmed', 'active']),
      supabase.from('tutor_subscriptions').select('expires_at').eq('tutor_id', id)
        .gt('expires_at', new Date().toISOString()).limit(1).maybeSingle(),
    ]);
    setTutor(t.data);
    setAvails(a.data || []);
    setBookings(b.data || []);
    setIsPro(!!sub.data);
    setLoading(false);
  }

  /** Маркеры дат для ученика: hasSlots = есть свободные окна */
  const markers = useMemo(() => {
    const map: Record<string, { hasSlots: boolean }> = {};
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = addDays(today, i);
      const k = format(d, 'yyyy-MM-dd');
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const hasSpecific = avails.some(a => a.specific_date === k);
      const hasWeekly = avails.some(a => a.specific_date === null && a.day_of_week === dow);
      if (hasSpecific || hasWeekly) {
        map[k] = { hasSlots: true };
      }
    }
    // Если все слоты в дате забронированы — снимаем hasSlots
    // (упрощённо: считаем что если есть хоть один забронированный слот И не больше одного availability — занято)
    return Object.entries(map).map(([date, m]) => ({ date, hasSlots: m.hasSlots }));
  }, [avails, bookings]);

  function onBook() {
    if (!tutor) return;
    if (selectedDate) {
      router.push(`/booking/new?tutor=${tutor.user_id}&date=${format(selectedDate, 'yyyy-MM-dd')}`);
    } else {
      router.push(`/booking/new?tutor=${tutor.user_id}`);
    }
  }

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!tutor) return <View style={s.loader}><Text style={s.empty}>Репетитор не найден</Text></View>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.avatarBlock}>
          {tutor.photo_url ? (
            <Image source={{ uri: tutor.photo_url }} style={s.avatarImg} />
          ) : (
            <View style={s.avatar}>
              <Text style={s.avatarText}>{tutor.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={s.nameRow}>
            <Text style={s.name}>{tutor.name}</Text>
            {isPro && (
              <View style={s.proBadge}>
                <Star size={12} color="#fff" fill="#fff" />
                <Text style={s.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
          <View style={s.ratingRow}>
            <Star size={16} color={COLORS.star} fill={COLORS.star} />
            <Text style={s.rating}>{tutor.rating > 0 ? `${tutor.rating.toFixed(1)} (${tutor.reviews_count} отзывов)` : 'Новый профиль'}</Text>
          </View>
          <Text style={s.price}>{(tutor.price_per_hour / 100).toLocaleString('ru')} ₽/час</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>О репетиторе</Text>
          <Text style={s.bio}>{tutor.bio}</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Предметы</Text>
          <View style={s.chips}>
            {tutor.subjects.map(x => <View key={x} style={s.chip}><Text style={s.chipText}>{x}</Text></View>)}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Уровни учеников</Text>
          <View style={s.chips}>
            {tutor.levels.map(x => <View key={x} style={s.chip}><Text style={s.chipText}>{x}</Text></View>)}
          </View>
        </View>

        <View style={s.section}>
          <View style={s.row}><GraduationCap size={16} color={COLORS.primary} /><Text style={s.sectionTitle}>Образование</Text></View>
          <Text style={s.bio}>{tutor.education}</Text>
          <View style={s.row}><Award size={14} color={COLORS.textSecondary} /><Text style={s.meta}>Опыт работы: {tutor.experience_years} лет</Text></View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Свободные даты</Text>
          <Text style={s.helper}>Зелёным подсвечены даты, на которые можно записаться. Тапни дату для выбора.</Text>
          <CalendarMonth
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            markers={markers}
            studentMode
          />
        </View>

        <TouchableOpacity style={s.bookBtn} onPress={onBook}>
          <Text style={s.bookBtnText}>{selectedDate ? `Записаться на ${format(selectedDate, 'd MMMM')}` : 'Записаться на урок'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  empty: { fontSize: 16, color: COLORS.textSecondary },
  scroll: { padding: 20, gap: 16, paddingBottom: 40, maxWidth: 720, alignSelf: 'center' as any, width: '100%' },
  avatarBlock: { alignItems: 'center', gap: 6, paddingVertical: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarImg: { width: 100, height: 100, borderRadius: 50, marginBottom: 8 },
  avatarText: { fontSize: 40, fontWeight: '700', color: COLORS.primary },
  name: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  proBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rating: { fontSize: 14, color: COLORS.textSecondary },
  price: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginTop: 8 },
  section: { gap: 10, backgroundColor: COLORS.white, borderRadius: 14, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bio: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  meta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  helper: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.primaryLight },
  chipText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  bookBtn: { height: 56, backgroundColor: COLORS.primary, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

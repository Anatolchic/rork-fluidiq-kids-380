import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Image, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Star, GraduationCap, Award, MessageCircle, Heart } from 'lucide-react-native';
import { addDays, format, startOfMonth, addMonths } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { TutorProfile } from '../../lib/types';
import CalendarMonth from '../../components/CalendarMonth';
import { useResponsive } from '../../lib/responsive';
import { useAuthStore } from '../../stores/auth';
import { openDirectChat } from '../../lib/direct-chats';
import { ru } from '../../lib/errors';

type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  student_id: string;
  tutor_reply: string | null;
};

export default function PublicTutorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [avails, setAvails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [isFav, setIsFav] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const { contentMaxWidth } = useResponsive();
  const { session, profile } = useAuthStore();

  useEffect(() => { if (id) load(); }, [id, month]);

  async function load() {
    setLoading(true);
    const monthStart = startOfMonth(month).toISOString();
    const monthEnd = addMonths(startOfMonth(month), 1).toISOString();
    const [t, slots, sub, rev] = await Promise.all([
      supabase.from('tutor_profiles').select('*').eq('user_id', id).maybeSingle(),
      supabase.from('tutor_slots').select('slot_start, duration_minutes')
        .eq('tutor_id', id)
        .is('booking_id', null)
        .gte('slot_start', monthStart).lt('slot_start', monthEnd),
      supabase.from('tutor_subscriptions').select('expires_at').eq('tutor_id', id)
        .gt('expires_at', new Date().toISOString()).limit(1).maybeSingle(),
      supabase.from('reviews').select('id, rating, comment, created_at, student_id, tutor_reply')
        .eq('tutor_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setTutor(t.data);
    setAvails(slots.data || []);
    setIsPro(!!sub.data);
    setReviews((rev.data || []) as ReviewItem[]);

    const sids = Array.from(new Set((rev.data || []).map((r: any) => r.student_id)));
    if (sids.length > 0) {
      const { data: ps } = await supabase
        .from('student_profiles').select('user_id, name')
        .in('user_id', sids);
      const map: Record<string, string> = {};
      (ps || []).forEach((p: any) => { map[p.user_id] = p.name; });
      setStudentNames(map);
    }

    // Узнаем — в избранном ли репетитор у текущего ученика
    if (profile?.role === 'student') {
      const { data: sp } = await supabase.from('student_profiles')
        .select('favorites').eq('user_id', session!.user.id).maybeSingle();
      setIsFav(!!sp?.favorites?.includes(id as string));
    }
    setLoading(false);
  }

  async function toggleFavorite() {
    if (!session || profile?.role !== 'student' || !id) return;
    setFavLoading(true);
    const { data: sp } = await supabase.from('student_profiles')
      .select('favorites').eq('user_id', session.user.id).maybeSingle();
    const list: string[] = sp?.favorites || [];
    const next = list.includes(id as string)
      ? list.filter(x => x !== id)
      : [...list, id as string];
    const { error } = await supabase.from('student_profiles')
      .update({ favorites: next }).eq('user_id', session.user.id);
    setFavLoading(false);
    if (!error) setIsFav(next.includes(id as string));
  }

  /** Маркеры дат для ученика: hasSlots = есть свободные слоты */
  const markers = useMemo(() => {
    const byDay = new Map<string, number>();
    avails.forEach((s: any) => {
      const k = format(new Date(s.slot_start), 'yyyy-MM-dd');
      byDay.set(k, (byDay.get(k) || 0) + 1);
    });
    return Array.from(byDay.entries()).map(([date, count]) => ({ date, hasSlots: count > 0 }));
  }, [avails]);

  function onBook() {
    if (!tutor) return;
    if (selectedDate) {
      router.push(`/booking/new?tutor=${tutor.user_id}&date=${format(selectedDate, 'yyyy-MM-dd')}`);
    } else {
      router.push(`/booking/new?tutor=${tutor.user_id}`);
    }
  }

  async function onWrite() {
    if (!tutor || openingChat) return;
    setOpeningChat(true);
    try {
      const chatId = await openDirectChat(tutor.user_id);
      router.push(`/chat/direct/${chatId}`);
    } catch (e: any) {
      Alert.alert('Не удалось открыть чат', ru(e));
    } finally {
      setOpeningChat(false);
    }
  }

  const canWrite =
    profile?.role === 'student' &&
    !!session &&
    !!tutor &&
    tutor.user_id !== session.user.id;

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!tutor) return <View style={s.loader}><Text style={s.empty}>Репетитор не найден</Text></View>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={[s.scroll, { maxWidth: contentMaxWidth }]}>
        {/* Hero: аватар слева, инфа справа */}
        <View style={s.heroBlock}>
          <View style={s.heroAvatarWrap}>
            {tutor.photo_url ? (
              <Image source={{ uri: tutor.photo_url }} style={s.avatarImg} />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarText}>{tutor.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            {profile?.role === 'student' && (
              <TouchableOpacity
                onPress={toggleFavorite}
                disabled={favLoading}
                style={s.favBtnCorner}
                hitSlop={8}
              >
                <Heart
                  size={20}
                  color={isFav ? COLORS.error : COLORS.textSecondary}
                  fill={isFav ? COLORS.error : COLORS.white}
                />
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={s.name}>{tutor.name}</Text>
              {isPro && (
                <View style={s.proBadge}>
                  <Star size={11} color="#fff" fill="#fff" />
                  <Text style={s.proBadgeText}>PRO</Text>
                </View>
              )}
            </View>
            <View style={s.metricsRow}>
              <View style={s.metric}>
                <Star size={13} color={COLORS.star} fill={COLORS.star} />
                <Text style={s.metricValue}>{tutor.rating > 0 ? tutor.rating.toFixed(1) : '—'}</Text>
                <Text style={s.metricLabel}>{tutor.reviews_count > 0 ? `(${tutor.reviews_count})` : 'Новый'}</Text>
              </View>
              <View style={s.metricDot} />
              <Text style={s.price}>{(tutor.price_per_hour / 100).toLocaleString('ru')} ₽<Text style={s.priceUnit}>/час</Text></Text>
            </View>
          </View>
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

        <View style={s.ctaRow}>
          <TouchableOpacity style={[s.bookBtn, canWrite && s.bookBtnFlex]} onPress={onBook}>
            <Text style={s.bookBtnText}>{selectedDate ? `Записаться на ${format(selectedDate, 'd MMMM', { locale: ruLocale })}` : 'Записаться на урок'}</Text>
          </TouchableOpacity>
          {canWrite && (
            <TouchableOpacity
              style={[s.writeBtn, openingChat && { opacity: 0.6 }]}
              onPress={onWrite}
              disabled={openingChat}
            >
              <MessageCircle size={18} color={COLORS.primary} />
              <Text style={s.writeBtnText}>Написать</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Отзывы */}
        {reviews.length > 0 && (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.sectionTitle}>Отзывы ({tutor?.reviews_count ?? reviews.length})</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Star size={16} color={COLORS.warning} fill={COLORS.warning} />
                <Text style={{ fontWeight: '700', color: COLORS.text, fontSize: 14 }}>{(tutor?.rating ?? 0).toFixed(1)}</Text>
              </View>
            </View>
            {reviews.slice(0, 5).map(r => (
              <View key={r.id} style={s.reviewItem}>
                <View style={s.reviewHead}>
                  <Text style={s.reviewName}>{studentNames[r.student_id] || 'Ученик'}</Text>
                  <View style={{ flexDirection: 'row', gap: 1 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={12} color={i < r.rating ? COLORS.warning : COLORS.border} fill={i < r.rating ? COLORS.warning : 'transparent'} />
                    ))}
                  </View>
                </View>
                {r.comment ? <Text style={s.reviewComment}>{r.comment}</Text> : null}
                {r.tutor_reply ? (
                  <View style={s.replyBlock}>
                    <Text style={s.replyLabel}>Ответ репетитора:</Text>
                    <Text style={s.replyText}>{r.tutor_reply}</Text>
                  </View>
                ) : null}
                <Text style={s.reviewDate}>{format(new Date(r.created_at), 'd MMM yyyy', { locale: ruLocale })}</Text>
              </View>
            ))}
            {reviews.length > 5 && (
              <Text style={[s.helper, { textAlign: 'center', marginTop: 4 }]}>
                и ещё {reviews.length - 5} {reviews.length - 5 === 1 ? 'отзыв' : 'отзывов'}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  empty: { fontSize: 16, color: COLORS.textSecondary },
  scroll: { padding: 20, gap: 16, paddingBottom: 40, maxWidth: 720, alignSelf: 'center' as any, width: '100%' },
  heroBlock: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.white, borderRadius: 18, padding: 14,
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  heroAvatarWrap: { position: 'relative' },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 76, height: 76, borderRadius: 38 },
  avatarText: { fontSize: 30, fontWeight: '800', color: COLORS.primary },
  favBtnCorner: {
    position: 'absolute', bottom: -4, right: -4,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  name: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricValue: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  metricLabel: { fontSize: 12, color: COLORS.textSecondary },
  metricDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.textSecondary },
  priceUnit: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  proBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rating: { fontSize: 13, color: COLORS.textSecondary },
  price: { fontSize: 18, fontWeight: '800', color: COLORS.primary, letterSpacing: -0.3 },
  section: { gap: 10, backgroundColor: COLORS.white, borderRadius: 14, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bio: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  meta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  helper: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.primaryLight },
  chipText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  bookBtn: { height: 56, backgroundColor: COLORS.primary, borderRadius: 14, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  bookBtnFlex: { flex: 1 },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  writeBtn: {
    height: 56, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.primary,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  writeBtnText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 10 },
  reviewItem: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border + '60' },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  reviewName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  reviewComment: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  reviewDate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
  replyBlock: { backgroundColor: COLORS.primaryLight, borderRadius: 10, padding: 10, marginTop: 6, borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  replyLabel: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },
  replyText: { fontSize: 13, color: COLORS.text, marginTop: 2 },
  favBtn: { marginLeft: 'auto', padding: 4 },
});

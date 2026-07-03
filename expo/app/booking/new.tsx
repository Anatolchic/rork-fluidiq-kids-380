import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, SafeAreaView,
  ActivityIndicator, TextInput, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { format, startOfDay, addDays, isSameDay } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { Gift, ChevronDown, Info, Sparkles, ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { TutorProfile, Subject, Level } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';
import { ru } from '../../lib/errors';
import { useResponsive } from '../../lib/responsive';

type Slot = {
  id: string;
  slot_start: string;
  duration_minutes: number;
  is_intro: boolean;
  booking_id: string | null;
};

const DAYS_AHEAD = 14;

export default function BookingNew() {
  const { tutor: tutorId, date: presetDate } = useLocalSearchParams<{ tutor: string; date?: string }>();
  const { session } = useAuthStore();
  const { contentMaxWidth } = useResponsive();
  const insets = useSafeAreaInsets();

  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [previousBookings, setPreviousBookings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedDay, setSelectedDay] = useState<Date>(presetDate ? new Date(presetDate) : startOfDay(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [wantIntro, setWantIntro] = useState(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [topic, setTopic] = useState('');
  const [topicOpen, setTopicOpen] = useState(false);

  useEffect(() => { if (tutorId && session) load(); }, [tutorId, session]);

  async function load() {
    setLoading(true);
    const [t, slotsRes, prev] = await Promise.all([
      supabase.from('tutor_profiles').select('*').eq('user_id', tutorId).maybeSingle(),
      supabase.from('tutor_slots').select('*')
        .eq('tutor_id', tutorId)
        .is('booking_id', null)
        .gte('slot_start', new Date().toISOString())
        .lte('slot_start', addDays(new Date(), DAYS_AHEAD).toISOString())
        .order('slot_start'),
      session ? supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId).eq('student_id', session.user.id)
        .neq('status', 'cancelled') : Promise.resolve({ count: 0 }),
    ]);
    if (t.data) {
      setTutor(t.data);
      if (t.data.subjects?.[0]) setSubject(t.data.subjects[0]);
      if (t.data.levels?.[0]) setLevel(t.data.levels[0]);
    }
    setSlots((slotsRes.data || []) as Slot[]);
    setPreviousBookings(prev.count || 0);
    setLoading(false);
  }

  // Дни на 14 дней вперёд с числом свободных слотов
  const daysStrip = useMemo(() => {
    const arr: { date: Date; count: number }[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = addDays(startOfDay(new Date()), i);
      const count = slots.filter(s => isSameDay(new Date(s.slot_start), d)).length;
      arr.push({ date: d, count });
    }
    return arr;
  }, [slots]);

  const daySlots = useMemo(
    () => slots.filter(s => isSameDay(new Date(s.slot_start), selectedDay)),
    [slots, selectedDay],
  );

  const canIntro = previousBookings === 0;

  // Расчёт цены и длительности
  const lessonInfo = useMemo(() => {
    if (!selectedSlot || !tutor) return null;
    const duration = selectedSlot.duration_minutes;
    const lesson = duration === 30 ? 25 : duration - 10;
    const brk = duration === 30 ? 5 : 10;
    let priceKop = Math.round((tutor.price_per_hour * duration) / 60);
    if (wantIntro && canIntro) priceKop = Math.round(priceKop * 0.5);
    return { duration, lesson, brk, priceKop };
  }, [selectedSlot, tutor, wantIntro, canIntro]);

  const canBook = !!(tutor && session && selectedSlot && subject && level);

  async function book() {
    if (!canBook || !selectedSlot) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('book_slot', {
        p_slot_id: selectedSlot.id,
        p_subject: subject,
        p_level: level,
        p_topic: topic.trim() || null,
      });
      if (error) throw error;
      if (data?.ok === false) {
        Alert.alert('Не удалось забронировать', data.error === 'already_booked' ? 'Слот уже занят, выберите другой' : data.error);
        await load();
        setSelectedSlot(null);
        return;
      }
      router.replace(`/booking/${data.booking_id}`);
    } catch (e: any) {
      Alert.alert('Ошибка', ru(e) || e?.message || 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!tutor) return <View style={s.loader}><Text style={s.error}>Репетитор не найден</Text></View>;

  const priceRub = lessonInfo ? Math.round(lessonInfo.priceKop / 100) : Math.round(tutor.price_per_hour / 100);

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            s.scroll,
            { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%', paddingBottom: 120 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Шапка с репетитором */}
          <View style={s.header}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
              <ArrowLeft size={20} color={COLORS.text} />
            </Pressable>
            {tutor.photo_url ? (
              <Image source={{ uri: tutor.photo_url }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarPlaceholder]}>
                <Text style={s.avatarInitial}>{tutor.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.tutorName} numberOfLines={1}>{tutor.name}</Text>
              <Text style={s.tutorMeta}>{Math.round(tutor.price_per_hour / 100)} ₽/час · ★ {tutor.rating.toFixed(1)}</Text>
            </View>
          </View>

          {/* Ознакомительный — прогрессивно, только если доступен */}
          {canIntro && (
            <Pressable
              onPress={() => setWantIntro(v => !v)}
              style={({ pressed }) => [s.introBanner, wantIntro && s.introBannerActive, { transform: [{ scale: pressed ? 0.99 : 1 }] }]}
            >
              <Sparkles size={18} color={wantIntro ? COLORS.success : COLORS.primary} />
              <Text style={[s.introText, wantIntro && { color: COLORS.success }]}>
                {wantIntro ? '✓ Ознакомительный урок −50%' : 'Первый урок — скидка 50%'}
              </Text>
            </Pressable>
          )}

          {/* Предмет + Уровень одной строкой */}
          <Text style={s.sectionLabel}>Предмет</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsScroll}>
            {(tutor.subjects || []).map(s2 => (
              <Pressable key={s2} onPress={() => setSubject(s2)}
                style={[s.pill, subject === s2 && s.pillActive]}>
                <Text style={[s.pillText, subject === s2 && s.pillTextActive]}>{s2}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={s.sectionLabel}>Уровень</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsScroll}>
            {(tutor.levels || []).map(l => (
              <Pressable key={l} onPress={() => setLevel(l)}
                style={[s.pill, level === l && s.pillActive]}>
                <Text style={[s.pillText, level === l && s.pillTextActive]}>{l}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Дни строкой */}
          <Text style={s.sectionLabel}>Дата урока</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsScroll}>
            {daysStrip.map(({ date, count }) => {
              const active = isSameDay(date, selectedDay);
              const disabled = count === 0;
              return (
                <Pressable
                  key={+date}
                  onPress={() => { if (!disabled) { setSelectedDay(date); setSelectedSlot(null); } }}
                  disabled={disabled}
                  style={[s.dayCard, active && s.dayCardActive, disabled && s.dayCardDisabled]}
                >
                  <Text style={[s.dayDow, active && { color: '#fff' }]}>
                    {format(date, 'EEE', { locale: ruLocale })}
                  </Text>
                  <Text style={[s.dayNum, active && { color: '#fff' }]}>
                    {format(date, 'd')}
                  </Text>
                  <View style={[s.dayCountPill, active && s.dayCountPillActive, disabled && s.dayCountPillDisabled]}>
                    <Text style={[s.dayCountText, active && { color: '#fff' }, disabled && { color: COLORS.textSecondary }]}>{count}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Слоты выбранного дня */}
          <Text style={s.sectionLabel}>Время</Text>
          {daySlots.length === 0 ? (
            <View style={s.emptySlots}>
              <Text style={s.emptyText}>В этот день нет свободных слотов</Text>
              <Text style={s.emptyHint}>Выбери другой день слева</Text>
            </View>
          ) : (
            <View style={s.slotsGrid}>
              {daySlots.map(slot => {
                const t = new Date(slot.slot_start);
                const active = selectedSlot?.id === slot.id;
                const durLabel = slot.duration_minutes === 30 ? '25 мин' : `${slot.duration_minutes - 10} мин`;
                return (
                  <Pressable key={slot.id} onPress={() => setSelectedSlot(slot)}
                    style={({ pressed }) => [s.slotChip, active && s.slotChipActive, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                    <Text style={[s.slotTime, active && { color: '#fff' }]}>{format(t, 'HH:mm')}</Text>
                    <Text style={[s.slotDur, active && { color: '#ffffffcc' }]}>{durLabel}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Тема — свёрнутый expander */}
          <Pressable onPress={() => setTopicOpen(v => !v)} style={s.topicHeader}>
            <ChevronDown size={16} color={COLORS.primary} style={{ transform: [{ rotate: topicOpen ? '180deg' : '0deg' }] }} />
            <Text style={s.topicHeaderText}>{topic ? `Тема: ${topic.slice(0, 30)}${topic.length > 30 ? '…' : ''}` : 'Уточнить тему урока (необязательно)'}</Text>
          </Pressable>
          {topicOpen && (
            <TextInput
              style={s.topicInput}
              value={topic}
              onChangeText={setTopic}
              placeholder="Например: подготовка к ЕГЭ, разбор ошибок…"
              placeholderTextColor={COLORS.textSecondary}
              multiline
              maxLength={200}
            />
          )}

          {/* Инфо о длительности */}
          {lessonInfo && (
            <View style={s.durBox}>
              <Info size={16} color={COLORS.primary} />
              <Text style={s.durText}>
                {lessonInfo.lesson} мин урок + {lessonInfo.brk} мин восстановление · слот {lessonInfo.duration} мин
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Sticky bottom bar */}
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.bottomLabel}>{selectedSlot ? format(new Date(selectedSlot.slot_start), 'd MMM, HH:mm', { locale: ruLocale }) : 'Выберите слот'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={s.bottomPrice}>{priceRub.toLocaleString('ru')} ₽</Text>
              {wantIntro && canIntro && lessonInfo && <Text style={s.bottomOldPrice}>−50%</Text>}
            </View>
          </View>
          <Pressable onPress={book} disabled={!canBook || saving}
            style={({ pressed }) => [s.bookBtn, (!canBook || saving) && { opacity: 0.4 }, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <LinearGradient colors={[COLORS.primary, '#8B7FFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.bookBtnInner} pointerEvents="none">
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.bookBtnText}>Забронировать</Text>}
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  error: { color: COLORS.error, fontSize: 15 },
  scroll: { padding: 16 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, backgroundColor: COLORS.white, padding: 12, borderRadius: 16, shadowColor: '#0006', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  backBtn: { padding: 6, borderRadius: 10, backgroundColor: COLORS.background },
  avatar: { width: 44, height: 44, borderRadius: 22, marginLeft: 4 },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  tutorName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  tutorMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  introBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primary + '10',
    borderWidth: 1, borderColor: COLORS.primary + '30',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    marginBottom: 16,
  },
  introBannerActive: { backgroundColor: COLORS.success + '15', borderColor: COLORS.success },
  introText: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.primary },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipsScroll: { gap: 8, paddingRight: 16, paddingBottom: 4 },

  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  pillTextActive: { color: '#fff' },

  dayCard: {
    width: 68, alignItems: 'center', paddingVertical: 10,
    borderRadius: 14, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border,
  },
  dayCardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayCardDisabled: { opacity: 0.4 },
  dayDow: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' },
  dayNum: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginVertical: 2 },
  dayCountPill: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: COLORS.primary + '15', borderRadius: 10, alignItems: 'center' },
  dayCountPillActive: { backgroundColor: '#ffffff33' },
  dayCountPillDisabled: { backgroundColor: COLORS.border },
  dayCountText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },

  emptySlots: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  emptyHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },

  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  slotChip: {
    minWidth: 78, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  slotChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  slotTime: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  slotDur: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },

  topicHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, marginTop: 8 },
  topicHeaderText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  topicInput: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 12,
    fontSize: 14, color: COLORS.text, minHeight: 56, textAlignVertical: 'top',
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 12,
  },

  durBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, backgroundColor: COLORS.primary + '08', borderRadius: 10 },
  durText: { flex: 1, fontSize: 12, color: COLORS.text, fontWeight: '600' },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 14,
    backgroundColor: COLORS.white,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 8,
  },
  bottomLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  bottomPrice: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  bottomOldPrice: { fontSize: 12, color: COLORS.success, fontWeight: '700' },
  bookBtn: { borderRadius: 14, overflow: 'hidden', minWidth: 180, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  bookBtnInner: { height: 50, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  bookBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

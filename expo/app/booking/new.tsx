import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, SafeAreaView,
  ActivityIndicator, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { format, startOfDay } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { Gift, BookOpen, GraduationCap, Clock, CalendarDays, ChevronLeft, ChevronRight, Info } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { TutorProfile, Subject, Level } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';
import { ru } from '../../lib/errors';
import { useResponsive } from '../../lib/responsive';
import CalendarMonth from '../../components/CalendarMonth';

type Slot = {
  id: string;
  slot_start: string;
  duration_minutes: number;
  is_intro: boolean;
  booking_id: string | null;
};

export default function BookingNew() {
  const { tutor: tutorId, date: presetDate } = useLocalSearchParams<{ tutor: string; date?: string }>();
  const { session } = useAuthStore();
  const { contentMaxWidth } = useResponsive();

  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [previousBookings, setPreviousBookings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [month, setMonth] = useState<Date>(presetDate ? new Date(presetDate) : new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(presetDate ? new Date(presetDate) : null);
  const [showSlots, setShowSlots] = useState<boolean>(!!presetDate);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [wantIntro, setWantIntro] = useState(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [topic, setTopic] = useState('');

  useEffect(() => { if (tutorId && session) load(); }, [tutorId, session]);

  async function load() {
    setLoading(true);
    const [t, slotsRes, prev] = await Promise.all([
      supabase.from('tutor_profiles').select('*').eq('user_id', tutorId).maybeSingle(),
      supabase.from('tutor_slots').select('*')
        .eq('tutor_id', tutorId)
        .is('booking_id', null)
        .gte('slot_start', new Date().toISOString())
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

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    slots.forEach(slot => {
      const key = format(new Date(slot.slot_start), 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(slot);
      map.set(key, arr);
    });
    return map;
  }, [slots]);

  const markers = useMemo(() => {
    const arr: { date: Date; hasSlots?: boolean }[] = [];
    for (const [key, ds] of slotsByDay.entries()) {
      if (ds.length > 0) arr.push({ date: new Date(key), hasSlots: true });
    }
    return arr;
  }, [slotsByDay]);

  const daySlots = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, 'yyyy-MM-dd');
    return slotsByDay.get(key) || [];
  }, [slotsByDay, selectedDay]);

  const canIntro = previousBookings === 0;
  const effectiveSlot = selectedSlot;
  const lessonMinutes = effectiveSlot ? (effectiveSlot.duration_minutes === 30 ? 25 : effectiveSlot.duration_minutes - 10) : 0;
  const breakMinutes = effectiveSlot ? (effectiveSlot.duration_minutes === 30 ? 5 : 10) : 0;

  const basePrice = useMemo(() => {
    if (!tutor || !effectiveSlot) return 0;
    let p = Math.round((tutor.price_per_hour * effectiveSlot.duration_minutes) / 60);
    if (wantIntro && canIntro) p = Math.round(p * 0.5);
    return p;
  }, [tutor, effectiveSlot, wantIntro, canIntro]);

  function canBook(): boolean {
    return !!tutor && !!session && !!effectiveSlot && !!subject && !!level;
  }

  async function book() {
    if (!canBook() || !tutor || !session || !effectiveSlot) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('book_slot', {
        p_slot_id: effectiveSlot.id,
        p_subject: subject,
        p_level: level,
        p_topic: topic.trim() || null,
      });
      if (error) throw error;
      if (data?.ok === false) {
        Alert.alert('Не удалось забронировать', data.error === 'already_booked' ? 'Этот слот уже занят, выберите другой' : data.error);
        await load();
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

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[s.scroll, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.title}>Запись к {tutor.name}</Text>
          <Text style={s.priceHint}>{Math.round(tutor.price_per_hour / 100)} ₽/час</Text>

          <View style={s.stepCard}>
            <View style={s.stepHeader}>
              <View style={s.stepIcon}><BookOpen size={16} color={COLORS.primary} /></View>
              <Text style={s.stepTitle}>Предмет</Text>
            </View>
            <View style={s.chips}>
              {(tutor.subjects || []).map(s2 => (
                <Pressable key={s2} onPress={() => setSubject(s2)}
                  style={[s.chip, subject === s2 && s.chipActive]}>
                  <Text style={[s.chipText, subject === s2 && s.chipTextActive]}>{s2}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={s.stepCard}>
            <View style={s.stepHeader}>
              <View style={s.stepIcon}><GraduationCap size={16} color={COLORS.primary} /></View>
              <Text style={s.stepTitle}>Уровень</Text>
            </View>
            <View style={s.chips}>
              {(tutor.levels || []).map(l => (
                <Pressable key={l} onPress={() => setLevel(l)}
                  style={[s.chip, level === l && s.chipActive]}>
                  <Text style={[s.chipText, level === l && s.chipTextActive]}>{l}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {canIntro && (
            <Pressable onPress={() => setWantIntro(v => !v)}
              style={({ pressed }) => [s.introCard, wantIntro && s.introCardActive, { transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
              <Gift size={22} color={wantIntro ? COLORS.success : COLORS.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.introTitle}>Ознакомительный урок (50% от цены)</Text>
                <Text style={s.introSub}>Доступен один раз с этим репетитором. 25 мин урок + 5 мин восстановления = 30 мин слот</Text>
              </View>
              <View style={[s.toggle, wantIntro && s.toggleOn]}>
                <View style={s.toggleDot} />
              </View>
            </Pressable>
          )}

          <View style={s.stepCard}>
            <View style={s.stepHeader}>
              <View style={s.stepIcon}><CalendarDays size={16} color={COLORS.primary} /></View>
              <Text style={s.stepTitle}>{showSlots ? 'Свободные слоты' : 'Дата'}</Text>
              {showSlots && (
                <Pressable onPress={() => { setShowSlots(false); setSelectedSlot(null); }}
                  style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 }} hitSlop={8}>
                  <ChevronLeft size={16} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '700' }}>Назад</Text>
                </Pressable>
              )}
            </View>

            {slots.length === 0 ? (
              <View style={s.empty}>
                <Clock size={28} color={COLORS.textSecondary} />
                <Text style={s.warn}>Репетитор ещё не выложил свободных слотов</Text>
              </View>
            ) : !showSlots ? (
              <>
                <CalendarMonth
                  month={month}
                  onMonthChange={setMonth}
                  selectedDate={selectedDay}
                  onSelect={(d) => { setSelectedDay(d); setSelectedSlot(null); }}
                  markers={markers}
                  studentMode
                  minDate={startOfDay(new Date())}
                />
                {selectedDay && daySlots.length > 0 && (
                  <Pressable onPress={() => setShowSlots(true)}
                    style={({ pressed }) => [s.viewSlotsBtn, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                    <Text style={s.viewSlotsBtnText}>
                      Свободные слоты на {format(selectedDay, 'd MMMM', { locale: ruLocale })} ({daySlots.length})
                    </Text>
                    <ChevronRight size={18} color="#fff" />
                  </Pressable>
                )}
                {selectedDay && daySlots.length === 0 && (
                  <Text style={[s.warn, { marginTop: 10, textAlign: 'center' }]}>В этот день нет свободных слотов</Text>
                )}
              </>
            ) : (
              <>
                {selectedDay && (
                  <Text style={s.slotsHeading}>{format(selectedDay, 'd MMMM, EEEE', { locale: ruLocale })}</Text>
                )}
                <View style={s.timeWrap}>
                  {daySlots.map(slot => {
                    const t = new Date(slot.slot_start);
                    const isSel = selectedSlot?.id === slot.id;
                    return (
                      <Pressable key={slot.id} onPress={() => setSelectedSlot(slot)}
                        style={({ pressed }) => [s.timeBtn, isSel && s.timeBtnActive, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                        <Text style={[s.timeText, isSel && s.timeTextActive]}>{format(t, 'HH:mm')}</Text>
                        <Text style={[s.timeDur, isSel && { color: '#fff' }]}>{slot.duration_minutes} мин</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>

          {effectiveSlot && (
            <View style={s.durBox}>
              <Info size={18} color={COLORS.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.durBoxTitle}>
                  Урок {lessonMinutes} мин + {breakMinutes} мин на восстановление = слот {effectiveSlot.duration_minutes} мин
                </Text>
                <Text style={s.durBoxSub}>
                  Начало в {format(new Date(effectiveSlot.slot_start), 'HH:mm')}, окончание урока в {format(new Date(new Date(effectiveSlot.slot_start).getTime() + lessonMinutes * 60000), 'HH:mm')}
                </Text>
              </View>
            </View>
          )}

          {effectiveSlot && (
            <View style={s.stepCard}>
              <View style={s.stepHeader}>
                <Text style={s.stepTitle}>Тема (опционально)</Text>
              </View>
              <TextInput
                style={s.input}
                value={topic}
                onChangeText={setTopic}
                placeholder="Например: подготовка к ЕГЭ"
                placeholderTextColor={COLORS.textSecondary}
                multiline
                maxLength={200}
              />
            </View>
          )}

          <View style={s.summary}>
            <View>
              <Text style={s.summaryLabel}>Итого</Text>
              <Text style={s.summaryPrice}>{Math.round(basePrice / 100)} ₽</Text>
              {wantIntro && canIntro && <Text style={s.summaryDiscount}>скидка 50% за ознакомительный</Text>}
            </View>
            <Pressable onPress={book} disabled={!canBook() || saving}
              style={({ pressed }) => [s.btnPrimary, (!canBook() || saving) && { opacity: 0.4 }, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
              <LinearGradient colors={[COLORS.primary, '#8B7FFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnGradient} pointerEvents="none">
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Забронировать</Text>}
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  error: { color: COLORS.error, fontSize: 15 },
  scroll: { padding: 16, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  priceHint: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 16, marginTop: 2 },

  stepCard: { backgroundColor: COLORS.white, borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: '#0006', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  stepIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center' },
  stepTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  introCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: COLORS.white, marginBottom: 12, borderWidth: 1.5, borderColor: COLORS.primary + '30', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 },
  introCardActive: { borderColor: COLORS.success, backgroundColor: COLORS.success + '10' },
  introTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  introSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: COLORS.border, padding: 3, flexDirection: 'row', alignItems: 'center' },
  toggleOn: { backgroundColor: COLORS.success, justifyContent: 'flex-end' as any },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },

  empty: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  warn: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center' },

  viewSlotsBtn: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  viewSlotsBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  slotsHeading: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 12, textTransform: 'capitalize' },

  timeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', minWidth: 80 },
  timeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  timeText: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  timeTextActive: { color: '#fff' },
  timeDur: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },

  durBox: { flexDirection: 'row', gap: 10, backgroundColor: COLORS.primary + '08', borderLeftWidth: 3, borderLeftColor: COLORS.primary, padding: 12, borderRadius: 10, marginBottom: 12 },
  durBoxTitle: { fontSize: 13, color: COLORS.text, fontWeight: '700', lineHeight: 18 },
  durBoxSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },

  input: { backgroundColor: COLORS.background, borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.text, minHeight: 48, textAlignVertical: 'top' },

  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 16, borderRadius: 18, backgroundColor: COLORS.white, marginTop: 8, shadowColor: '#0006', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  summaryLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  summaryPrice: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  summaryDiscount: { fontSize: 11, color: COLORS.success, marginTop: 2, fontWeight: '700' },

  btnPrimary: { borderRadius: 14, overflow: 'hidden', minWidth: 160, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  btnGradient: { height: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

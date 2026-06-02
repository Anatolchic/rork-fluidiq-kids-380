import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { format, addDays, isSameDay, startOfDay, addMinutes, isBefore } from 'date-fns';
import { ru } from 'date-fns/locale';
import supabase from '../../lib/supabase';
import { COLORS, SUBJECTS, LEVELS, LESSON_DURATIONS } from '../../lib/constants';
import { TutorProfile, TutorAvailability, Booking, LessonDuration, Subject, Level } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';

const DAYS_AHEAD = 14;
const SLOT_INTERVAL_MIN = 30;

type Slot = { iso: string; label: string; isBusy: boolean };

const INTRO_DURATION = 30; // 30-минутный слот = 25 мин урок + 5 мин

export default function BookingNew() {
  const { tutor: tutorId, date: presetDate } = useLocalSearchParams<{ tutor: string; date?: string }>();
  const { session } = useAuthStore();

  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [availability, setAvailability] = useState<TutorAvailability[]>([]);
  const [busy, setBusy] = useState<Booking[]>([]);
  const [previousBookings, setPreviousBookings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | null>(presetDate ? new Date(presetDate) : null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<LessonDuration>(60);
  const [isIntro, setIsIntro] = useState(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [topic, setTopic] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ percent: number; discount_kopecks: number } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);

  useEffect(() => { if (tutorId && session) load(); }, [tutorId, session]);

  async function load() {
    setLoading(true);
    const [t, a, b, prev] = await Promise.all([
      supabase.from('tutor_profiles').select('*').eq('user_id', tutorId).maybeSingle(),
      supabase.from('tutor_availability').select('*').eq('tutor_id', tutorId),
      supabase.from('bookings').select('*').eq('tutor_id', tutorId).gte('start_time', new Date().toISOString()).in('status', ['pending', 'confirmed', 'active']),
      // Сколько уроков уже было у этого ученика с этим репетитором (для intro-флага)
      session ? supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId).eq('student_id', session.user.id)
        .neq('status', 'cancelled') : Promise.resolve({ count: 0 }),
    ]);
    if (t.data) {
      setTutor(t.data);
      setDuration(t.data.min_duration);
      if (t.data.subjects?.[0]) setSubject(t.data.subjects[0]);
      if (t.data.levels?.[0]) setLevel(t.data.levels[0]);
    }
    setAvailability(a.data || []);
    setBusy(b.data || []);
    setPreviousBookings(prev.count || 0);
    setLoading(false);
  }

  // Когда юзер включает «ознакомительный» — заставим duration=30
  function toggleIntro() {
    const next = !isIntro;
    setIsIntro(next);
    if (next) setDuration(INTRO_DURATION as LessonDuration);
    setSelectedTime(null);
  }

  // Возвращает массив availability-окон для конкретной даты с учётом specific_date overrides
  function availForDate(date: Date) {
    const k = format(date, 'yyyy-MM-dd');
    const dow = date.getDay() === 0 ? 6 : date.getDay() - 1;
    const specific = availability.filter(a => a.specific_date === k);
    if (specific.length > 0) return specific; // override побеждает
    return availability.filter(a => a.specific_date === null && a.day_of_week === dow);
  }

  const availableDates = useMemo(() => {
    const today = startOfDay(new Date());
    const dates: Date[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = addDays(today, i);
      if (availForDate(d).length > 0) dates.push(d);
    }
    return dates;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability]);

  const slotsForDate = useMemo<Slot[]>(() => {
    if (!selectedDate) return [];
    const slots = availForDate(selectedDate);
    if (!slots.length) return [];
    const now = new Date();
    const out: Slot[] = [];
    for (const slot of slots) {
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      const start = new Date(selectedDate); start.setHours(sh, sm, 0, 0);
      const end = new Date(selectedDate); end.setHours(eh, em, 0, 0);
      let cur = new Date(start);
      while (isBefore(addMinutes(cur, duration), end) || +addMinutes(cur, duration) === +end) {
        const slotEnd = addMinutes(cur, duration);
        const isBusy = busy.some(b => {
          const bs = new Date(b.start_time); const be = new Date(b.end_time);
          return cur < be && slotEnd > bs;
        });
        const inPast = isBefore(cur, now);
        out.push({ iso: cur.toISOString(), label: format(cur, 'HH:mm'), isBusy: isBusy || inPast });
        cur = addMinutes(cur, SLOT_INTERVAL_MIN);
      }
    }
    // дедуп по iso
    const seen = new Set<string>();
    return out.filter(s => seen.has(s.iso) ? false : (seen.add(s.iso), true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, availability, busy, duration]);

  function canBook(): boolean {
    return !!tutor && !!session && !!selectedDate && !!selectedTime && !!subject && !!level;
  }

  async function book() {
    if (!canBook() || !tutor || !session) return;
    setSaving(true);
    try {
      const start = new Date(selectedTime!);
      const end = addMinutes(start, duration);
      // Ознакомительный — 50% от цены 30-минутного слота (примерно полцены за пол-урока)
      const basePrice = isIntro && previousBookings === 0
        ? Math.round((tutor.price_per_hour * 25) / 60 / 2)
        : Math.round((tutor.price_per_hour * duration) / 60);
      const price = promoApplied ? Math.max(basePrice - promoApplied.discount_kopecks, 0) : basePrice;
      const status = tutor.auto_confirm ? 'confirmed' : 'pending';

      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          student_id: session.user.id,
          tutor_id: tutor.user_id,
          subject,
          level,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration,
          topic: topic.trim() || null,
          status,
          price,
          is_intro: isIntro && previousBookings === 0,
        })
        .select('id')
        .single();
      if (bookingError) throw bookingError;

      if (promoApplied) {
        await supabase.from('promo_code_uses').insert({
          code: promoCode, user_id: session.user.id, booking_id: bookingData.id,
          discount_kopecks: promoApplied.discount_kopecks,
        });
        await supabase.rpc('increment_promo_use' as any, { p_code: promoCode }).catch(() => {});
      }

      await supabase.from('chat_rooms').insert({
        booking_id: bookingData.id,
        student_id: session.user.id,
        tutor_id: tutor.user_id,
      });

      router.replace(`/booking/${bookingData.id}`);
    } catch (e: any) {
      Alert.alert('Не удалось забронировать', e.message || 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!tutor) return <View style={styles.loader}><Text style={styles.empty}>Репетитор не найден</Text></View>;

  const subjects = tutor.subjects || [];
  const levels = tutor.levels || [];
  const allowedDurations = LESSON_DURATIONS.filter(d => d.value >= tutor.min_duration);
  const priceForChoice = Math.round((tutor.price_per_hour * duration) / 60) / 100;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Запись к репетитору</Text>
          <Text style={styles.tutorName}>👤 {tutor.name}</Text>

          <Text style={styles.label}>Предмет</Text>
          <View style={styles.chipsWrap}>
            {subjects.map(s => (
              <TouchableOpacity key={s} style={[styles.chip, subject === s && styles.chipActive]} onPress={() => setSubject(s)}>
                <Text style={[styles.chipText, subject === s && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Уровень</Text>
          <View style={styles.chipsWrap}>
            {levels.map(l => (
              <TouchableOpacity key={l} style={[styles.chip, level === l && styles.chipActive]} onPress={() => setLevel(l)}>
                <Text style={[styles.chipText, level === l && styles.chipTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {previousBookings === 0 && (
            <TouchableOpacity style={[introStyles.card, isIntro && introStyles.cardActive]} onPress={toggleIntro} activeOpacity={0.8}>
              <View style={[introStyles.check, isIntro && introStyles.checkOn]}>
                {isIntro && <Text style={introStyles.checkMark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={introStyles.title}>🎁 Ознакомительный урок · 25 мин</Text>
                <Text style={introStyles.sub}>Только для первого занятия с этим репетитором — со скидкой 50% от обычной цены. Слот занимает 30 минут (25 мин урок + 5 мин знакомство).</Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={styles.label}>Длительность</Text>
          <View style={styles.chipsWrap}>
            {allowedDurations.map(d => (
              <TouchableOpacity key={d.value} style={[styles.durBtn, duration === d.value && styles.durBtnActive]} onPress={() => { setDuration(d.value as LessonDuration); setSelectedTime(null); }}>
                <Text style={[styles.durText, duration === d.value && styles.durTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Дата</Text>
          {availableDates.length === 0 ? (
            <Text style={styles.warn}>Репетитор не задал расписание</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
              {availableDates.map(d => {
                const active = selectedDate && isSameDay(d, selectedDate);
                return (
                  <TouchableOpacity key={d.toISOString()} style={[styles.dateBtn, active && styles.dateBtnActive]} onPress={() => { setSelectedDate(d); setSelectedTime(null); }}>
                    <Text style={[styles.dateDow, active && styles.dateTextActive]}>{format(d, 'EEE', { locale: ru })}</Text>
                    <Text style={[styles.dateDay, active && styles.dateTextActive]}>{format(d, 'd')}</Text>
                    <Text style={[styles.dateMonth, active && styles.dateTextActive]}>{format(d, 'LLL', { locale: ru })}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {selectedDate && (
            <>
              <Text style={styles.label}>Время</Text>
              {slotsForDate.length === 0 ? (
                <Text style={styles.warn}>В этот день нет свободных слотов</Text>
              ) : (
                <View style={styles.timeWrap}>
                  {slotsForDate.map(s => (
                    <TouchableOpacity
                      key={s.iso}
                      style={[styles.timeBtn, selectedTime === s.iso && styles.timeBtnActive, s.isBusy && styles.timeBtnBusy]}
                      disabled={s.isBusy}
                      onPress={() => setSelectedTime(s.iso)}
                    >
                      <Text style={[styles.timeText, selectedTime === s.iso && styles.timeTextActive, s.isBusy && styles.timeTextBusy]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={styles.label}>Тема (необязательно)</Text>
          <TextInput
            style={styles.input}
            value={topic}
            onChangeText={setTopic}
            placeholder="Например: подготовка к ЕГЭ, профильная математика"
            placeholderTextColor={COLORS.textSecondary}
            maxLength={200}
          />

          <Text style={styles.label}>Промокод (опционально)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1, textTransform: 'uppercase' }]}
              value={promoCode}
              onChangeText={t => { setPromoCode(t.toUpperCase()); setPromoApplied(null); }}
              placeholder="HELLO50"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
              editable={!promoApplied}
            />
            <TouchableOpacity
              style={[styles.durBtn, { paddingHorizontal: 16 }, (!promoCode || promoChecking) && { opacity: 0.5 }]}
              disabled={!promoCode || promoChecking}
              onPress={async () => {
                if (promoApplied) { setPromoApplied(null); setPromoCode(''); return; }
                if (!tutor) return;
                setPromoChecking(true);
                const base = Math.round((tutor.price_per_hour * duration) / 60);
                const { data, error } = await supabase.rpc('apply_promo_code', { p_code: promoCode, p_base_kopecks: base, p_target: 'lesson_price' });
                setPromoChecking(false);
                if (error) { Alert.alert('Ошибка', error.message); return; }
                if (!data?.ok) { Alert.alert('Промокод не применён', data?.error || 'Не подошёл'); return; }
                setPromoApplied({ percent: data.percent, discount_kopecks: data.discount_kopecks });
              }}
            >
              <Text style={styles.durText}>{promoApplied ? 'Убрать' : 'Применить'}</Text>
            </TouchableOpacity>
          </View>
          {promoApplied && (
            <Text style={{ fontSize: 12, color: COLORS.success, marginTop: 4 }}>✓ Скидка {promoApplied.percent}% · −{(promoApplied.discount_kopecks/100).toLocaleString('ru')} ₽</Text>
          )}

          <View style={styles.summary}>
            <Text style={styles.summaryLine}>Длительность: <Text style={styles.summaryBold}>{duration} минут</Text></Text>
            <Text style={styles.summaryLine}>К оплате репетитору: <Text style={styles.summaryBold}>{priceForChoice.toLocaleString('ru')} ₽</Text></Text>
            <Text style={styles.summaryHint}>Оплата происходит напрямую репетитору указанным им способом после подтверждения брони.</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.bookBtn, (!canBook() || saving) && styles.bookBtnDisabled]} disabled={!canBook() || saving} onPress={book}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.bookBtnText}>{tutor.auto_confirm ? 'Забронировать' : 'Отправить заявку'}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const introStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: 12, backgroundColor: COLORS.warning + '15', borderRadius: 12, borderWidth: 1, borderColor: COLORS.warning + '40' },
  cardActive: { backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  checkOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  empty: { fontSize: 16, color: COLORS.textSecondary },
  scroll: { padding: 20, gap: 10, paddingBottom: 24, maxWidth: 720, alignSelf: 'center' as any, width: '100%' },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  tutorName: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 12 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  durBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, minWidth: 84, alignItems: 'center' },
  durBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  durText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  durTextActive: { color: '#fff' },
  dateScroll: { gap: 8, paddingVertical: 4 },
  dateBtn: { width: 64, paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  dateBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dateDow: { fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase' },
  dateDay: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginVertical: 2 },
  dateMonth: { fontSize: 11, color: COLORS.textSecondary },
  dateTextActive: { color: '#fff' },
  timeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, minWidth: 70, alignItems: 'center' },
  timeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  timeBtnBusy: { backgroundColor: COLORS.background, opacity: 0.4 },
  timeText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  timeTextActive: { color: '#fff' },
  timeTextBusy: { textDecorationLine: 'line-through' },
  warn: { fontSize: 13, color: COLORS.warning, padding: 12, backgroundColor: COLORS.warning + '15', borderRadius: 10 },
  input: { backgroundColor: COLORS.white, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.border, fontSize: 14, color: COLORS.text },
  summary: { backgroundColor: COLORS.primaryLight, borderRadius: 12, padding: 14, marginTop: 12, gap: 4 },
  summaryLine: { fontSize: 14, color: COLORS.text },
  summaryBold: { fontWeight: '700' },
  summaryHint: { fontSize: 11, color: COLORS.textSecondary, marginTop: 6, lineHeight: 16 },
  footer: { padding: 16, paddingBottom: Platform.OS === 'ios' ? 24 : 16, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background },
  bookBtn: { height: 56, backgroundColor: COLORS.primary, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  bookBtnDisabled: { opacity: 0.4 },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

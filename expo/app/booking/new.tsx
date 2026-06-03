import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, SafeAreaView, ActivityIndicator, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { format, addDays, isSameDay, startOfDay, addMinutes, isBefore } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { User, Gift, Repeat as RepeatIcon, Check, BookOpen, GraduationCap, Clock, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS, SUBJECTS, LEVELS, LESSON_DURATIONS } from '../../lib/constants';
import { TutorProfile, TutorAvailability, Booking, LessonDuration, Subject, Level } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';
import { ru } from '../../lib/errors';
import { useResponsive } from '../../lib/responsive';
import CalendarMonth from '../../components/CalendarMonth';

const DAYS_AHEAD = 14;
const SLOT_INTERVAL_MIN = 30;

type Slot = { iso: string; label: string; isBusy: boolean };

const INTRO_DURATION = 30; // 30-минутный слот = 25 мин урок + 5 мин

export default function BookingNew() {
  const { tutor: tutorId, date: presetDate } = useLocalSearchParams<{ tutor: string; date?: string }>();
  const { session } = useAuthStore();
  const { isDesktop, contentMaxWidth } = useResponsive();

  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [availability, setAvailability] = useState<TutorAvailability[]>([]);
  const [busy, setBusy] = useState<Booking[]>([]);
  const [previousBookings, setPreviousBookings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | null>(presetDate ? new Date(presetDate) : null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(presetDate ? new Date(presetDate) : new Date());
  const [showSlots, setShowSlots] = useState<boolean>(!!presetDate);
  const [duration, setDuration] = useState<LessonDuration>(60);
  const [isIntro, setIsIntro] = useState(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [topic, setTopic] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ percent: number; discount_kopecks: number } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState<4 | 8 | 12>(4);

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

  // Маркеры для CalendarMonth — какие даты в видимом месяце имеют слоты
  const calendarMarkers = useMemo(() => {
    return availableDates.map(d => ({ date: d, hasSlots: true }));
  }, [availableDates]);

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
      const canRecur = isRecurring && !isIntro; // ознакомительный не размножаем

      // Регулярная серия — сначала booking_series, потом N бронирований с series_id
      let seriesId: string | null = null;
      if (canRecur) {
        const { data: seriesData, error: seriesError } = await supabase
          .from('booking_series' as any)
          .insert({
            student_id: session.user.id,
            tutor_id: tutor.user_id,
            subject,
            level,
            duration,
            weeks: recurringWeeks,
            topic: topic.trim() || null,
          } as any)
          .select('id')
          .single();
        if (seriesError) throw seriesError;
        seriesId = (seriesData as any).id;
      }

      const occurrences = canRecur ? recurringWeeks : 1;
      const createdIds: string[] = [];
      for (let i = 0; i < occurrences; i++) {
        const s = addDays(start, i * 7);
        const e = addDays(end, i * 7);
        const { data: bd, error: be } = await supabase
          .from('bookings')
          .insert({
            student_id: session.user.id,
            tutor_id: tutor.user_id,
            subject,
            level,
            start_time: s.toISOString(),
            end_time: e.toISOString(),
            duration,
            topic: topic.trim() || null,
            status,
            price,
            is_intro: isIntro && previousBookings === 0 && i === 0,
            series_id: seriesId,
          } as any)
          .select('id')
          .single();
        if (be) throw be;
        createdIds.push((bd as any).id);
      }

      const firstId = createdIds[0];

      if (promoApplied && firstId) {
        await supabase.from('promo_code_uses').insert({
          code: promoCode, user_id: session.user.id, booking_id: firstId,
          discount_kopecks: promoApplied.discount_kopecks,
        });
        await supabase.rpc('increment_promo_use' as any, { p_code: promoCode }).catch(() => {});
      }

      // Чат-комната — одна на серию (по первой брони)
      if (firstId) {
        await supabase.from('chat_rooms').insert({
          booking_id: firstId,
          student_id: session.user.id,
          tutor_id: tutor.user_id,
        });
      }

      if (canRecur && occurrences > 1) {
        Alert.alert('Готово', `Создано ${occurrences} бронирований`, [
          { text: 'OK', onPress: () => router.replace(`/booking/${firstId}`) },
        ]);
      } else {
        router.replace(`/booking/${firstId}`);
      }
    } catch (e: any) {
      Alert.alert('Не удалось забронировать', ru(e) || e.message || 'Попробуйте ещё раз');
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
        <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: contentMaxWidth }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Запись к репетитору</Text>
          <View style={styles.tutorRow}>
            <User size={14} color={COLORS.textSecondary} />
            <Text style={styles.tutorName}>{tutor.name}</Text>
          </View>

          <View style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepIcon}><BookOpen size={16} color={COLORS.primary} /></View>
              <Text style={styles.stepTitle}>Предмет</Text>
            </View>
            <View style={styles.chipsWrap}>
              {subjects.map(sj => (
                <Pressable
                  key={sj}
                  testID={`subject-${slugify(sj)}`}
                  style={({ pressed }) => [styles.chip, subject === sj && styles.chipActive, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                  onPress={() => setSubject(sj)}
                >
                  <Text style={[styles.chipText, subject === sj && styles.chipTextActive]}>{sj}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepIcon}><GraduationCap size={16} color={COLORS.primary} /></View>
              <Text style={styles.stepTitle}>Уровень</Text>
            </View>
            <View style={styles.chipsWrap}>
              {levels.map(l => (
                <Pressable
                  key={l}
                  style={({ pressed }) => [styles.chip, level === l && styles.chipActive, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                  onPress={() => setLevel(l)}
                >
                  <Text style={[styles.chipText, level === l && styles.chipTextActive]}>{l}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {previousBookings === 0 && (
            <Pressable
              style={({ pressed }) => [
                introStyles.cardWrap,
                isIntro && introStyles.cardActiveWrap,
                { transform: [{ scale: pressed ? 0.985 : 1 }] },
              ]}
              onPress={toggleIntro}
            >
              <LinearGradient
                colors={isIntro ? [COLORS.primary, '#8B7FFF'] : ['#FFF7E6', '#FFE9C2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={introStyles.card}
              >
                <View style={[introStyles.check, isIntro && introStyles.checkOn]}>
                  {isIntro && <Check size={13} color={COLORS.primary} strokeWidth={3} />}
                </View>
                <View style={[introStyles.iconWrap, isIntro && introStyles.iconWrapActive]}>
                  <Gift size={20} color={isIntro ? '#fff' : COLORS.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[introStyles.title, isIntro && introStyles.titleActive]}>Ознакомительный урок · 25 мин</Text>
                  <Text style={[introStyles.sub, isIntro && introStyles.subActive]}>Только для первого занятия — скидка 50%. Слот 30 минут (25 мин урок + 5 мин знакомство).</Text>
                </View>
              </LinearGradient>
            </Pressable>
          )}

          <View style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepIcon}><Clock size={16} color={COLORS.primary} /></View>
              <Text style={styles.stepTitle}>Длительность</Text>
            </View>
            <View style={styles.chipsWrap}>
              {allowedDurations.map(d => (
                <Pressable
                  key={d.value}
                  testID={`duration-${d.value}`}
                  style={({ pressed }) => [styles.durBtn, duration === d.value && styles.durBtnActive, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                  onPress={() => { setDuration(d.value as LessonDuration); setSelectedTime(null); }}
                >
                  <Text style={[styles.durText, duration === d.value && styles.durTextActive]}>{d.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepIcon}><CalendarDays size={16} color={COLORS.primary} /></View>
              <Text style={styles.stepTitle}>{showSlots ? 'Свободные слоты' : 'Дата'}</Text>
              {showSlots && (
                <TouchableOpacity
                  onPress={() => { setShowSlots(false); setSelectedTime(null); }}
                  style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 }}
                  hitSlop={8}
                >
                  <ChevronLeft size={16} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '700' }}>Назад</Text>
                </TouchableOpacity>
              )}
            </View>

            {availableDates.length === 0 ? (
              <Text style={styles.warn}>Репетитор не задал расписание</Text>
            ) : !showSlots ? (
              <>
                <CalendarMonth
                  selectedDate={selectedDate}
                  onSelect={(d) => { setSelectedDate(d); setSelectedTime(null); }}
                  markers={calendarMarkers}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  studentMode
                  minDate={startOfDay(new Date())}
                />
                {selectedDate && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.viewSlotsBtn,
                      { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
                    ]}
                    onPress={() => setShowSlots(true)}
                  >
                    <Text style={styles.viewSlotsBtnText}>
                      Смотреть свободные слоты на {format(selectedDate, 'd MMMM', { locale: ruLocale })}
                    </Text>
                    <ChevronRight size={18} color="#fff" />
                  </Pressable>
                )}
              </>
            ) : (
              <>
                {selectedDate && (
                  <Text style={styles.slotsHeading}>
                    {format(selectedDate, 'd MMMM, EEEE', { locale: ruLocale })}
                  </Text>
                )}
                {slotsForDate.length === 0 ? (
                  <Text style={styles.warn}>В этот день нет свободных слотов</Text>
                ) : (
                  <View style={styles.timeWrap}>
                    {slotsForDate.map(s => (
                      <Pressable
                        key={s.iso}
                        style={({ pressed }) => [styles.timeBtn, selectedTime === s.iso && styles.timeBtnActive, s.isBusy && styles.timeBtnBusy, { transform: [{ scale: pressed && !s.isBusy ? 0.95 : 1 }] }]}
                        disabled={s.isBusy}
                        onPress={() => setSelectedTime(s.iso)}
                      >
                        <Text style={[styles.timeText, selectedTime === s.iso && styles.timeTextActive, s.isBusy && styles.timeTextBusy]}>{s.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          {selectedDate && selectedTime && !isIntro && (
            <>
              <Pressable
                style={({ pressed }) => [
                  recurringStyles.card,
                  isRecurring && recurringStyles.cardActive,
                  { transform: [{ scale: pressed ? 0.985 : 1 }] },
                ]}
                onPress={() => setIsRecurring(v => !v)}
              >
                <View style={[recurringStyles.check, isRecurring && recurringStyles.checkOn]}>
                  {isRecurring && <Check size={13} color="#fff" strokeWidth={3} />}
                </View>
                <View style={[recurringStyles.iconWrap, isRecurring && recurringStyles.iconWrapActive]}>
                  <RepeatIcon size={20} color={isRecurring ? COLORS.primary : COLORS.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={recurringStyles.title}>Сделать регулярной</Text>
                  <Text style={recurringStyles.sub}>Несколько бронирований подряд: тот же день недели и время, шаг 7 дней.</Text>
                </View>
              </Pressable>
              {isRecurring && (
                <>
                  <Text style={styles.label}>На сколько недель</Text>
                  <View style={styles.chipsWrap}>
                    {[4, 8, 12].map(w => (
                      <TouchableOpacity
                        key={w}
                        style={[styles.durBtn, recurringWeeks === w && styles.durBtnActive]}
                        onPress={() => setRecurringWeeks(w as 4 | 8 | 12)}
                      >
                        <Text style={[styles.durText, recurringWeeks === w && styles.durTextActive]}>{w} нед.</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
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
            <Text style={styles.summaryLine}>Цена за урок: <Text style={styles.summaryBold}>{priceForChoice.toLocaleString('ru')} ₽</Text></Text>
            {isRecurring && !isIntro && (
              <>
                <Text style={styles.summaryLine}>Уроков в серии: <Text style={styles.summaryBold}>{recurringWeeks}</Text></Text>
                <Text style={styles.summaryLine}>Итого: <Text style={styles.summaryBold}>{(priceForChoice * recurringWeeks).toLocaleString('ru')} ₽</Text></Text>
              </>
            )}
            <Text style={styles.summaryHint}>Оплата происходит напрямую репетитору указанным им способом после подтверждения брони.</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerPriceBlock}>
            <Text style={styles.footerPriceLabel}>Итого</Text>
            <Text style={styles.footerPriceValue}>
              {isRecurring && !isIntro
                ? `${(priceForChoice * recurringWeeks).toLocaleString('ru')} ₽`
                : `${priceForChoice.toLocaleString('ru')} ₽`}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.bookBtnWrap,
              (!canBook() || saving) && styles.bookBtnDisabled,
              { transform: [{ scale: pressed && canBook() ? 0.97 : 1 }] },
            ]}
            disabled={!canBook() || saving}
            onPress={book}
          >
            <LinearGradient
              colors={[COLORS.primary, '#8B7FFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bookBtn}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.bookBtnText}>{tutor.auto_confirm ? 'Забронировать' : 'Отправить заявку'}</Text>}
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const cardShadow = {
  shadowColor: '#0006',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3,
};

const introStyles = StyleSheet.create({
  cardWrap: { marginTop: 4, borderRadius: 18, ...cardShadow },
  cardActiveWrap: {},
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18 },
  cardActive: {},
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: COLORS.warning + '60', justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff80' },
  checkOn: { backgroundColor: '#fff', borderColor: '#fff' },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ffffff80', justifyContent: 'center', alignItems: 'center' },
  iconWrapActive: { backgroundColor: '#ffffff35' },
  title: { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  titleActive: { color: '#fff' },
  sub: { fontSize: 12, color: COLORS.text + 'cc', lineHeight: 17, marginTop: 3 },
  subActive: { color: '#ffffffdd' },
});

const recurringStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 4, backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, ...cardShadow },
  cardActive: { backgroundColor: COLORS.primary + '0A', borderColor: COLORS.primary + '60' },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  checkOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  iconWrapActive: { backgroundColor: COLORS.primaryLight },
  title: { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  sub: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17, marginTop: 3 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  empty: { fontSize: 16, color: COLORS.textSecondary },
  scroll: { padding: 16, gap: 14, paddingBottom: 24, maxWidth: 720, alignSelf: 'center' as any, width: '100%' },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  tutorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tutorName: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  stepCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    ...cardShadow,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  stepTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  label: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginTop: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  durBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, minWidth: 84, alignItems: 'center' },
  durBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  durText: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  durTextActive: { color: '#fff' },
  dateScroll: { gap: 10, paddingVertical: 4 },
  viewSlotsBtn: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  viewSlotsBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  slotsHeading: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 12, textTransform: 'capitalize' },
  dateBtn: { width: 68, paddingVertical: 12, alignItems: 'center', borderRadius: 14, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  dateBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dateDow: { fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.3 },
  dateDay: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginVertical: 2, letterSpacing: -0.5 },
  dateMonth: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  dateTextActive: { color: '#fff' },
  timeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, minWidth: 74, alignItems: 'center' },
  timeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  timeBtnBusy: { backgroundColor: COLORS.background, opacity: 0.35 },
  timeText: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  timeTextActive: { color: '#fff' },
  timeTextBusy: { textDecorationLine: 'line-through' },
  warn: { fontSize: 13, color: COLORS.warning, padding: 12, backgroundColor: COLORS.warning + '15', borderRadius: 12 },
  input: { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, fontSize: 14, color: COLORS.text },
  summary: { backgroundColor: COLORS.primaryLight, borderRadius: 16, padding: 16, marginTop: 6, gap: 5 },
  summaryLine: { fontSize: 14, color: COLORS.text },
  summaryBold: { fontWeight: '800' },
  summaryHint: { fontSize: 11, color: COLORS.textSecondary, marginTop: 6, lineHeight: 16 },
  footer: {
    padding: 16, paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#0006', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 8,
  },
  footerPriceBlock: { justifyContent: 'center' },
  footerPriceLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 0.3 },
  footerPriceValue: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  bookBtnWrap: { flex: 1, borderRadius: 16, ...cardShadow },
  bookBtn: { height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  bookBtnDisabled: { opacity: 0.4 },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

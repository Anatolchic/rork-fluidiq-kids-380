import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator,
  Pressable, Alert, Modal, RefreshControl,
} from 'react-native';
import { format, startOfDay, startOfMonth, endOfMonth, addDays, addWeeks } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { Clock, Check, Info, X, Copy, CalendarRange, Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';
import { useResponsive } from '../../lib/responsive';
import CalendarMonth from '../../components/CalendarMonth';

type Slot = {
  id: string;
  tutor_id: string;
  slot_start: string;
  duration_minutes: number;
  is_intro: boolean;
  booking_id: string | null;
};

// Time-grid: часы 8..21 (14 часов). Каждый час = потенциальный 60-мин слот.
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);

// Дни недели для шаблона (ISO: 1=Пн...7=Вс)
const WEEK_DAYS = [
  { key: 1, label: 'Пн' },
  { key: 2, label: 'Вт' },
  { key: 3, label: 'Ср' },
  { key: 4, label: 'Чт' },
  { key: 5, label: 'Пт' },
  { key: 6, label: 'Сб' },
  { key: 7, label: 'Вс' },
];

export default function TutorSchedule() {
  const { session } = useAuthStore();
  const { contentMaxWidth } = useResponsive();
  const [month, setMonth] = useState<Date>(startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [tplHourFrom, setTplHourFrom] = useState(9);
  const [tplHourTo, setTplHourTo] = useState(18);
  const [tplWeeks, setTplWeeks] = useState<2 | 4 | 8>(4);
  const [tplDays, setTplDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => { if (session) load(); }, [session, month]);

  async function load() {
    if (!session) return;
    setLoading(true);
    const from = startOfMonth(month);
    const to = endOfMonth(month);
    const { data } = await supabase
      .from('tutor_slots').select('*')
      .eq('tutor_id', session.user.id)
      .gte('slot_start', from.toISOString())
      .lte('slot_start', to.toISOString())
      .order('slot_start');
    setSlots((data || []) as Slot[]);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [month]);

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
    const arr: { date: Date; hasSlots?: boolean; hasBookings?: boolean; bookingsCount?: number }[] = [];
    for (const [key, daySlots] of slotsByDay.entries()) {
      const date = new Date(key);
      const booked = daySlots.filter(s => s.booking_id).length;
      arr.push({ date, hasSlots: daySlots.length > 0, hasBookings: booked > 0, bookingsCount: booked });
    }
    return arr;
  }, [slotsByDay]);

  const daySlots = useMemo(() => {
    const key = format(selectedDay, 'yyyy-MM-dd');
    return slotsByDay.get(key) || [];
  }, [slotsByDay, selectedDay]);

  // Map hour → slot (для быстрого toggle)
  const hourToSlot = useMemo(() => {
    const m = new Map<number, Slot>();
    daySlots.forEach(s => {
      const h = new Date(s.slot_start).getHours();
      m.set(h, s);
    });
    return m;
  }, [daySlots]);

  async function toggleHour(hour: number) {
    if (!session || busy) return;
    const existing = hourToSlot.get(hour);
    if (existing) {
      if (existing.booking_id) {
        Alert.alert('Слот забронирован', 'Сначала отмените бронирование со стороны ученика');
        return;
      }
      setBusy(true);
      const { error } = await supabase.rpc('delete_slot', { p_slot_id: existing.id });
      setBusy(false);
      if (error) Alert.alert('Ошибка', error.message);
      else load();
    } else {
      const isPast = selectedDay < startOfDay(new Date()) ||
        (format(selectedDay, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && hour < new Date().getHours() + 1);
      if (isPast) {
        Alert.alert('Прошедшее время', 'Нельзя открыть слот в прошлом');
        return;
      }
      const slotDate = new Date(selectedDay);
      slotDate.setHours(hour, 0, 0, 0);
      setBusy(true);
      const { error } = await supabase.rpc('create_slots_bulk', {
        p_slot_starts: [slotDate.toISOString()],
        p_duration: 60,
      });
      setBusy(false);
      if (error) Alert.alert('Ошибка', error.message);
      else load();
    }
  }

  async function applyTemplate() {
    if (!session) return;
    if (tplDays.length === 0) { Alert.alert('Выберите хотя бы один день недели'); return; }
    if (tplHourFrom >= tplHourTo) { Alert.alert('Проверьте диапазон часов'); return; }

    const starts: string[] = [];
    const today = startOfDay(new Date());
    for (let w = 0; w < tplWeeks; w++) {
      for (let d = 0; d < 7; d++) {
        const day = addDays(today, w * 7 + d);
        const iso = day.getDay() === 0 ? 7 : day.getDay();
        if (!tplDays.includes(iso)) continue;
        for (let h = tplHourFrom; h < tplHourTo; h++) {
          const slotDate = new Date(day); slotDate.setHours(h, 0, 0, 0);
          if (slotDate < new Date()) continue;
          starts.push(slotDate.toISOString());
        }
      }
    }
    if (starts.length === 0) { Alert.alert('Нечего создавать', 'В выбранном диапазоне нет валидных дат'); return; }

    setBusy(true);
    const { data, error } = await supabase.rpc('create_slots_bulk', { p_slot_starts: starts, p_duration: 60 });
    setBusy(false);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    setTemplateOpen(false);
    Alert.alert('Готово', `Создано слотов: ${data}`);
    load();
  }

  async function copyDayToNextWeek() {
    if (!session || daySlots.length === 0) return;
    const target = addWeeks(selectedDay, 1);
    const starts = daySlots
      .filter(s => !s.booking_id)
      .map(s => {
        const orig = new Date(s.slot_start);
        const d = new Date(target);
        d.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
        return d.toISOString();
      });
    if (starts.length === 0) { Alert.alert('Нет свободных слотов для копирования'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('create_slots_bulk', { p_slot_starts: starts, p_duration: 60 });
    setBusy(false);
    if (error) Alert.alert('Ошибка', error.message);
    else Alert.alert('Скопировано', `${data} слотов → ${format(target, 'd MMMM', { locale: ruLocale })}`);
    load();
  }

  function toggleTplDay(d: number) {
    setTplDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  const totalFree = slots.filter(s => !s.booking_id).length;
  const totalBooked = slots.filter(s => s.booking_id).length;

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={[s.scroll, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Расписание</Text>
            <Text style={s.subtitle}>Свободных {totalFree} · Забронировано {totalBooked}</Text>
          </View>
          <Pressable onPress={() => setHelpOpen(true)} hitSlop={10} style={s.infoBtn}>
            <Info size={20} color={COLORS.primary} />
          </Pressable>
        </View>

        {/* Шаблон недели — CTA */}
        <Pressable
          onPress={() => setTemplateOpen(true)}
          style={({ pressed }) => [s.templateBtn, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          <LinearGradient
            colors={[COLORS.primary, '#8B7FFF']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.templateBtnInner}
            pointerEvents="none"
          >
            <Zap size={18} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={s.templateBtnTitle}>Шаблон недели</Text>
              <Text style={s.templateBtnSub}>Быстро открыть слоты на несколько недель вперёд</Text>
            </View>
          </LinearGradient>
        </Pressable>

        <View style={s.calCard}>
          <CalendarMonth
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDay}
            onSelect={setSelectedDay}
            markers={markers}
          />
        </View>

        <View style={s.legend}>
          <View style={s.legendRow}>
            <View style={[s.legendDot, { backgroundColor: COLORS.success }]} />
            <Text style={s.legendText}>есть слоты</Text>
          </View>
          <View style={s.legendRow}>
            <View style={[s.legendDot, { backgroundColor: COLORS.warning }]} />
            <Text style={s.legendText}>есть бронирования</Text>
          </View>
        </View>

        {/* Time-grid: клик по часу = вкл/выкл слот */}
        <View style={s.daySection}>
          <View style={s.dayTitleRow}>
            <Text style={s.dayTitle}>{format(selectedDay, 'd MMMM, EEEE', { locale: ruLocale })}</Text>
            <Text style={s.dayCount}>{daySlots.length}</Text>
          </View>

          <Text style={s.gridHint}>Тап по часу — включить или выключить слот 60 мин</Text>

          <View style={s.hourGrid}>
            {HOURS.map(h => {
              const slot = hourToSlot.get(h);
              const isActive = !!slot;
              const isBooked = !!slot?.booking_id;
              const isPast = selectedDay < startOfDay(new Date()) ||
                (format(selectedDay, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && h < new Date().getHours() + 1);
              const cellStyle = [
                s.hourCell,
                isPast && !isActive && s.hourCellPast,
                isActive && !isBooked && s.hourCellActive,
                isBooked && s.hourCellBooked,
              ];
              return (
                <Pressable
                  key={h}
                  onPress={() => toggleHour(h)}
                  disabled={isBooked || (isPast && !isActive)}
                  style={({ pressed }) => [
                    ...cellStyle,
                    pressed && !isBooked && { transform: [{ scale: 0.94 }] },
                  ]}
                >
                  <Text style={[
                    s.hourText,
                    isPast && !isActive && s.hourTextPast,
                    (isActive || isBooked) && { color: '#fff' },
                  ]}>{String(h).padStart(2, '0')}:00</Text>
                  {isBooked && <Check size={12} color="#fff" strokeWidth={3} />}
                </Pressable>
              );
            })}
          </View>

          {daySlots.length > 0 && (
            <Pressable
              onPress={copyDayToNextWeek}
              style={({ pressed }) => [s.copyBtn, pressed && { opacity: 0.7 }]}
            >
              <Copy size={15} color={COLORS.primary} />
              <Text style={s.copyBtnText}>Скопировать день на след. неделю</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Модал шаблона недели */}
      <Modal visible={templateOpen} animationType="slide" transparent onRequestClose={() => setTemplateOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setTemplateOpen(false)}>
          <Pressable style={s.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Шаблон недели</Text>
                <Text style={s.modalSub}>Открыть слоты 60 мин по расписанию</Text>
              </View>
              <Pressable onPress={() => setTemplateOpen(false)} hitSlop={10}>
                <X size={22} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <Text style={s.fieldLabel}>Дни недели</Text>
            <View style={s.chipRow}>
              {WEEK_DAYS.map(d => {
                const active = tplDays.includes(d.key);
                return (
                  <Pressable key={d.key} onPress={() => toggleTplDay(d.key)}
                    style={[s.dayChip, active && s.dayChipActive]}>
                    <Text style={[s.dayChipText, active && s.dayChipTextActive]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.fieldLabel}>Часы</Text>
            <View style={s.rangeRow}>
              <View style={s.rangeGroup}>
                <Text style={s.rangeLabel}>с</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {HOURS.map(h => (
                    <Pressable key={h} onPress={() => setTplHourFrom(h)}
                      style={[s.hourChip, tplHourFrom === h && s.hourChipActive]}>
                      <Text style={[s.hourChipText, tplHourFrom === h && s.hourChipTextActive]}>{String(h).padStart(2, '0')}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={s.rangeGroup}>
                <Text style={s.rangeLabel}>до</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {HOURS.concat([22]).map(h => (
                    <Pressable key={h} onPress={() => setTplHourTo(h)}
                      style={[s.hourChip, tplHourTo === h && s.hourChipActive]}>
                      <Text style={[s.hourChipText, tplHourTo === h && s.hourChipTextActive]}>{String(h).padStart(2, '0')}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <Text style={s.fieldLabel}>На сколько недель вперёд</Text>
            <View style={s.chipRow}>
              {[2, 4, 8].map(w => (
                <Pressable key={w} onPress={() => setTplWeeks(w as any)}
                  style={[s.weekChip, tplWeeks === w && s.weekChipActive]}>
                  <Text style={[s.weekChipText, tplWeeks === w && s.weekChipTextActive]}>{w} нед.</Text>
                </Pressable>
              ))}
            </View>

            <View style={s.previewBox}>
              <CalendarRange size={16} color={COLORS.primary} />
              <Text style={s.previewText}>
                Будет открыто ≈ {tplDays.length * (tplHourTo - tplHourFrom) * tplWeeks} слотов
              </Text>
            </View>

            <Pressable onPress={applyTemplate} disabled={busy}
              style={({ pressed }) => [s.applyBtn, busy && { opacity: 0.6 }, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
              <LinearGradient colors={[COLORS.primary, '#8B7FFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.applyBtnInner} pointerEvents="none">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.applyBtnText}>Применить шаблон</Text>}
              </LinearGradient>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Хелп */}
      <Modal visible={helpOpen} animationType="fade" transparent onRequestClose={() => setHelpOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setHelpOpen(false)}>
          <Pressable style={s.helpCard} onPress={e => e.stopPropagation()}>
            <Text style={s.modalTitle}>Как это работает</Text>
            <Text style={s.helpText}>
              • Тап по часу в сетке — открыть или удалить слот 60 мин.{'\n\n'}
              • Слот = 60 мин: 50 мин урок + 10 мин восстановление.{'\n'}
              • Ознакомительный (30 мин = 25+5) появляется автоматически у нового ученика.{'\n\n'}
              • «Шаблон недели» — быстро открывает слоты в выбранные дни на 2/4/8 недель вперёд.{'\n'}
              • «Скопировать день» — переносит выбранный день на след. неделю в такое же время.{'\n\n'}
              • Забронированный слот удалить нельзя — сначала отмените бронь ученика.
            </Text>
            <Pressable onPress={() => setHelpOpen(false)} style={s.helpClose}>
              <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Понятно</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 60 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  infoBtn: { padding: 6, borderRadius: 10, backgroundColor: COLORS.primary + '12' },

  templateBtn: { borderRadius: 16, marginBottom: 12, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4 },
  templateBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16 },
  templateBtnTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  templateBtnSub: { color: '#ffffffcc', fontSize: 12, marginTop: 2 },

  calCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 10, marginBottom: 12, shadowColor: '#0006', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },

  legend: { flexDirection: 'row', gap: 16, marginBottom: 12, paddingHorizontal: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: COLORS.textSecondary },

  daySection: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, shadowColor: '#0006', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  dayTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, textTransform: 'capitalize' },
  dayCount: { fontSize: 13, color: COLORS.primary, fontWeight: '800', backgroundColor: COLORS.primary + '15', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, minWidth: 30, textAlign: 'center' },
  gridHint: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 },

  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  hourCell: {
    width: '22%', paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', gap: 4,
  },
  hourCellPast: { opacity: 0.35 },
  hourCellActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  hourCellBooked: { backgroundColor: COLORS.warning, borderColor: COLORS.warning },
  hourText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  hourTextPast: { color: COLORS.textSecondary },

  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 8, backgroundColor: COLORS.primary + '10', borderRadius: 12 },
  copyBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '92%' },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  modalSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  fieldLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 8, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.4 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  dayChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayChipText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  dayChipTextActive: { color: '#fff' },

  weekChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  weekChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  weekChipText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  weekChipTextActive: { color: '#fff' },

  rangeRow: { gap: 12 },
  rangeGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '700', width: 18 },
  hourChip: { minWidth: 44, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  hourChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  hourChipText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  hourChipTextActive: { color: '#fff' },

  previewBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: COLORS.primary + '10', borderRadius: 10, marginTop: 14 },
  previewText: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '600' },

  applyBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 16, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  applyBtnInner: { height: 54, alignItems: 'center', justifyContent: 'center' },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  helpCard: { backgroundColor: COLORS.white, borderRadius: 18, padding: 22, marginHorizontal: 24, maxWidth: 480, alignSelf: 'center' as any, marginBottom: 'auto', marginTop: 'auto' },
  helpText: { fontSize: 14, color: COLORS.text, lineHeight: 22, marginTop: 12 },
  helpClose: { alignItems: 'center', paddingTop: 16, paddingBottom: 4 },
});

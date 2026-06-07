import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator,
  Pressable, Alert, Modal, RefreshControl,
} from 'react-native';
import { format, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { Plus, X, Clock, Check, Trash2, Info } from 'lucide-react-native';
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

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);
const QUARTERS = [0, 15, 30, 45];

const DURATIONS = [
  { value: 60, label: '60 мин', sub: '50 мин урок + 10 мин восстановление' },
  { value: 90, label: '90 мин', sub: '80 мин урок + 10 мин восстановление' },
  { value: 120, label: '120 мин', sub: '110 мин урок + 10 мин восстановление' },
] as const;

export default function TutorSchedule() {
  const { session } = useAuthStore();
  const { contentMaxWidth } = useResponsive();
  const [month, setMonth] = useState<Date>(startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addDuration, setAddDuration] = useState<60 | 90 | 120>(60);
  const [addHour, setAddHour] = useState(9);
  const [addMinute, setAddMinute] = useState(0);
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

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
    return (slotsByDay.get(key) || []).sort((a, b) => +new Date(a.slot_start) - +new Date(b.slot_start));
  }, [slotsByDay, selectedDay]);

  async function addSlot() {
    if (!session) return;
    setSaving(true);
    const slotDate = new Date(selectedDay);
    slotDate.setHours(addHour, addMinute, 0, 0);
    const { data, error } = await supabase.rpc('create_slots_bulk', {
      p_slot_starts: [slotDate.toISOString()],
      p_duration: addDuration,
    });
    setSaving(false);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    if (data === 0) { Alert.alert('Слот уже есть', 'На это время слот уже создан'); return; }
    setAddOpen(false);
    load();
  }

  async function quickFill() {
    if (!session) return;
    Alert.alert(
      'Заполнить день?',
      `Создадим слоты по 60 мин с 9:00 до 18:00 на ${format(selectedDay, 'd MMMM', { locale: ruLocale })}`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Да', onPress: async () => {
          const starts: string[] = [];
          for (let h = 9; h < 18; h++) {
            const d = new Date(selectedDay); d.setHours(h, 0, 0, 0);
            starts.push(d.toISOString());
          }
          setSaving(true);
          const { data, error } = await supabase.rpc('create_slots_bulk', {
            p_slot_starts: starts, p_duration: 60,
          });
          setSaving(false);
          if (error) Alert.alert('Ошибка', error.message);
          else { Alert.alert('Готово', `Создано слотов: ${data}`); load(); }
        }},
      ]
    );
  }

  async function removeSlot(slot: Slot) {
    if (slot.booking_id) {
      Alert.alert('Слот забронирован', 'Сначала отмените бронь со стороны ученика');
      return;
    }
    Alert.alert('Удалить слот?', format(new Date(slot.slot_start), 'd MMM HH:mm', { locale: ruLocale }), [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('delete_slot', { p_slot_id: slot.id });
        if (error) Alert.alert('Ошибка', error.message);
        else load();
      }},
    ]);
  }

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={[s.scroll, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <View style={s.headerRow}>
          <View>
            <Text style={s.title}>Расписание</Text>
            <Text style={s.subtitle}>Отмечайте время, когда вы готовы вести уроки</Text>
          </View>
          <Pressable onPress={() => setHelpOpen(true)} hitSlop={10} style={s.infoBtn}>
            <Info size={20} color={COLORS.primary} />
          </Pressable>
        </View>

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

        <View style={s.daySection}>
          <View style={s.dayTitleRow}>
            <Text style={s.dayTitle}>{format(selectedDay, 'd MMMM, EEEE', { locale: ruLocale })}</Text>
            <Text style={s.dayCount}>Слотов: {daySlots.length}</Text>
          </View>

          {daySlots.length === 0 ? (
            <View style={s.empty}>
              <Clock size={32} color={COLORS.textSecondary} />
              <Text style={s.emptyText}>На этот день слотов нет</Text>
            </View>
          ) : (
            <View style={s.slotsList}>
              {daySlots.map(slot => {
                const start = new Date(slot.slot_start);
                const lesson = slot.duration_minutes === 30 ? 25 : slot.duration_minutes - 10;
                const booked = !!slot.booking_id;
                return (
                  <Pressable key={slot.id} onPress={() => removeSlot(slot)}
                    style={({ pressed }) => [s.slot, booked && s.slotBooked, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                    <View style={s.slotLeft}>
                      <Text style={[s.slotTime, booked && { color: '#fff' }]}>{format(start, 'HH:mm')}</Text>
                      <Text style={[s.slotDur, booked && { color: '#ffffffd0' }]}>
                        слот {slot.duration_minutes} мин · урок {lesson} мин
                      </Text>
                    </View>
                    {booked ? (
                      <View style={s.bookedBadge}>
                        <Check size={14} color="#fff" />
                        <Text style={s.bookedText}>забронирован</Text>
                      </View>
                    ) : (
                      <Trash2 size={18} color={COLORS.textSecondary} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={s.btnRow}>
            <Pressable
              testID="add-slot-btn"
              onPress={() => setAddOpen(true)}
              style={({ pressed }) => [s.btnPrimary, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            >
              <LinearGradient colors={[COLORS.primary, '#8B7FFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnGradient} pointerEvents="none">
                <Plus size={18} color="#fff" />
                <Text style={s.btnText}>Добавить слот</Text>
              </LinearGradient>
            </Pressable>
            {daySlots.length === 0 && (
              <Pressable onPress={quickFill} style={({ pressed }) => [s.btnSecondary, pressed && { opacity: 0.7 }]}>
                <Text style={s.btnSecondaryText}>9:00 — 18:00</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={s.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Новый слот</Text>
              <Pressable onPress={() => setAddOpen(false)} hitSlop={10}>
                <X size={22} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <Text style={s.modalDate}>{format(selectedDay, 'd MMMM, EEEE', { locale: ruLocale })}</Text>

            <Text style={s.fieldLabel}>Час начала</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 6 }}>
              {HOURS.map(h => (
                <Pressable key={h} onPress={() => setAddHour(h)}
                  style={[s.timeChip, addHour === h && s.timeChipActive]}>
                  <Text style={[s.timeChipText, addHour === h && s.timeChipTextActive]}>{String(h).padStart(2, '0')}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={s.fieldLabel}>Минуты</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              {QUARTERS.map(q => (
                <Pressable key={q} onPress={() => setAddMinute(q)}
                  style={[s.timeChip, addMinute === q && s.timeChipActive]}>
                  <Text style={[s.timeChipText, addMinute === q && s.timeChipTextActive]}>{String(q).padStart(2, '0')}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.fieldLabel}>Длительность слота</Text>
            <View style={{ gap: 8 }}>
              {DURATIONS.map(d => (
                <Pressable key={d.value} onPress={() => setAddDuration(d.value)}
                  style={[s.durOption, addDuration === d.value && s.durOptionActive]}>
                  <View style={[s.radio, addDuration === d.value && s.radioActive]}>
                    {addDuration === d.value && <View style={s.radioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.durLabel}>{d.label}</Text>
                    <Text style={s.durSub}>{d.sub}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <Pressable onPress={addSlot} disabled={saving}
              style={({ pressed }) => [s.btnPrimary, { marginTop: 16, transform: [{ scale: pressed ? 0.98 : 1 }] }, saving && { opacity: 0.6 }]}>
              <LinearGradient colors={[COLORS.primary, '#8B7FFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnGradient} pointerEvents="none">
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Plus size={18} color="#fff" />
                    <Text style={s.btnText}>Добавить слот</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={helpOpen} animationType="fade" transparent onRequestClose={() => setHelpOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setHelpOpen(false)}>
          <Pressable style={s.helpCard} onPress={e => e.stopPropagation()}>
            <Text style={s.modalTitle}>Как это работает</Text>
            <Text style={s.helpText}>
              • Слот — окно времени, в которое вы готовы провести урок.{'\n\n'}
              • 60 мин слот = 50 мин урок + 10 мин на восстановление.{'\n'}
              • 90 мин = 80 мин урок + 10 мин восст.{'\n'}
              • 120 мин = 110 мин урок + 10 мин восст.{'\n'}
              • Ознакомительный (30 мин = 25 урок + 5 восст) появляется автоматически у нового ученика.{'\n\n'}
              • Свободный слот удаляется тапом. Забронированный — только через отмену брони учеником.{'\n'}
              • Ученики видят только ваши свободные слоты.
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  infoBtn: { padding: 6, borderRadius: 10, backgroundColor: COLORS.primary + '12' },

  calCard: { backgroundColor: COLORS.white, borderRadius: 18, padding: 12, marginBottom: 12, shadowColor: '#0006', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },

  legend: { flexDirection: 'row', gap: 16, marginBottom: 16, paddingHorizontal: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: COLORS.textSecondary },

  daySection: { backgroundColor: COLORS.white, borderRadius: 18, padding: 16, shadowColor: '#0006', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dayTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, textTransform: 'capitalize' },
  dayCount: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: 30, gap: 10 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },

  slotsList: { gap: 8, marginBottom: 12 },
  slot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, backgroundColor: COLORS.success + '15', borderWidth: 1, borderColor: COLORS.success + '40' },
  slotBooked: { backgroundColor: COLORS.warning, borderColor: COLORS.warning },
  slotLeft: { flex: 1 },
  slotTime: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  slotDur: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  bookedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ffffff44', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  bookedText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnPrimary: { flex: 1, borderRadius: 14, overflow: 'hidden', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  btnGradient: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary: { paddingHorizontal: 16, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary + '10' },
  btnSecondaryText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '90%' },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  modalDate: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 18, textTransform: 'capitalize' },

  fieldLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 8, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, minWidth: 48, alignItems: 'center' },
  timeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  timeChipText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  timeChipTextActive: { color: '#fff' },

  durOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  durOptionActive: { backgroundColor: COLORS.primary + '08', borderColor: COLORS.primary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  radioActive: { borderColor: COLORS.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  durLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  durSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  helpCard: { backgroundColor: COLORS.white, borderRadius: 18, padding: 22, marginHorizontal: 24, maxWidth: 480, alignSelf: 'center' as any, marginBottom: 'auto', marginTop: 'auto' },
  helpText: { fontSize: 14, color: COLORS.text, lineHeight: 22, marginTop: 12 },
  helpClose: { alignItems: 'center', paddingTop: 16, paddingBottom: 4 },
});

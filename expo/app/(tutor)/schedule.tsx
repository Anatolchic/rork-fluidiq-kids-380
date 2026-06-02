import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, Modal, Switch, Platform, TextInput } from 'react-native';
import { addDays, addMonths, format, parseISO, startOfMonth } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { Plus, Trash2, Repeat, CalendarDays, Settings } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS, DAY_NAMES } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';
import CalendarMonth from '../../components/CalendarMonth';
import { ru } from '../../lib/errors';

type AvailRow = {
  id: string;
  tutor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  specific_date: string | null;
  price_per_hour_override: number | null;
};
type Booking = { id: string; start_time: string; end_time: string; status: string; student_id: string };

const HOURS_30 = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2), m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

export default function TutorSchedule() {
  const { session } = useAuthStore();
  const [avails, setAvails] = useState<AvailRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [addRecurring, setAddRecurring] = useState(false);
  const [pickStart, setPickStart] = useState('09:00');
  const [pickEnd, setPickEnd] = useState('12:00');
  const [pickPrice, setPickPrice] = useState('');
  const [editSlot, setEditSlot] = useState<AvailRow | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => { if (session) load(); }, [session, month]);

  async function load() {
    setLoading(true);
    const monthStart = startOfMonth(month).toISOString();
    const monthEnd = addMonths(startOfMonth(month), 1).toISOString();
    const [a, b] = await Promise.all([
      supabase.from('tutor_availability').select('*').eq('tutor_id', session!.user.id),
      supabase.from('bookings').select('id, start_time, end_time, status, student_id')
        .eq('tutor_id', session!.user.id)
        .gte('start_time', monthStart).lt('start_time', monthEnd),
    ]);
    setAvails((a.data as any) || []);
    setBookings((b.data as any) || []);
    setLoading(false);
  }

  /** Маркеры дат: hasSlots / hasBookings / count */
  const markers = useMemo(() => {
    const map: Record<string, { hasSlots: boolean; hasBookings: boolean; bookingsCount: number }> = {};
    // Bookings
    bookings.forEach(b => {
      if (b.status === 'cancelled') return;
      const k = format(parseISO(b.start_time), 'yyyy-MM-dd');
      if (!map[k]) map[k] = { hasSlots: false, hasBookings: true, bookingsCount: 0 };
      map[k].hasBookings = true;
      map[k].bookingsCount = (map[k].bookingsCount || 0) + 1;
    });
    // Slots: 30 дней вперёд
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = addDays(today, i);
      const k = format(d, 'yyyy-MM-dd');
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const hasSpecific = avails.some(a => a.specific_date === k);
      const hasWeekly = avails.some(a => a.specific_date === null && a.day_of_week === dow);
      if (hasSpecific || hasWeekly) {
        if (!map[k]) map[k] = { hasSlots: false, hasBookings: false, bookingsCount: 0 };
        map[k].hasSlots = true;
      }
    }
    return Object.entries(map).map(([date, m]) => ({ date, ...m }));
  }, [avails, bookings]);

  /** Слоты выбранной даты */
  const dateSlots = useMemo(() => {
    if (!selectedDate) return [];
    const k = format(selectedDate, 'yyyy-MM-dd');
    const dow = selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1;
    return avails.filter(a => a.specific_date === k || (a.specific_date === null && a.day_of_week === dow));
  }, [selectedDate, avails]);

  const dateBookings = useMemo(() => {
    if (!selectedDate) return [];
    const k = format(selectedDate, 'yyyy-MM-dd');
    return bookings.filter(b => format(parseISO(b.start_time), 'yyyy-MM-dd') === k && b.status !== 'cancelled');
  }, [selectedDate, bookings]);

  async function saveSlot() {
    if (pickStart >= pickEnd) { Alert.alert('Время окончания должно быть позже начала'); return; }
    if (!selectedDate) return;
    const priceNum = pickPrice.trim() ? parseFloat(pickPrice.replace(',', '.')) : NaN;
    if (pickPrice.trim() && (!isFinite(priceNum) || priceNum < 0)) {
      Alert.alert('Цена должна быть положительным числом'); return;
    }
    const payload: any = {
      tutor_id: session!.user.id,
      start_time: pickStart,
      end_time: pickEnd,
      price_per_hour_override: pickPrice.trim() ? Math.round(priceNum * 100) : null,
    };
    if (addRecurring) {
      payload.day_of_week = selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1;
      payload.specific_date = null;
    } else {
      payload.day_of_week = selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1;
      payload.specific_date = format(selectedDate, 'yyyy-MM-dd');
    }
    const { error } = await supabase.from('tutor_availability').insert(payload);
    if (error) { Alert.alert('Ошибка', ru(error)); return; }
    setAddOpen(false); setPickPrice(''); load();
  }

  function openEditSlot(slot: AvailRow) {
    setEditSlot(slot);
    setEditPrice(slot.price_per_hour_override != null ? String(slot.price_per_hour_override / 100) : '');
  }

  async function saveEditSlot() {
    if (!editSlot) return;
    const trimmed = editPrice.trim();
    const priceNum = trimmed ? parseFloat(trimmed.replace(',', '.')) : NaN;
    if (trimmed && (!isFinite(priceNum) || priceNum < 0)) {
      Alert.alert('Цена должна быть положительным числом'); return;
    }
    setEditSaving(true);
    const { error } = await supabase
      .from('tutor_availability')
      .update({ price_per_hour_override: trimmed ? Math.round(priceNum * 100) : null } as any)
      .eq('id', editSlot.id);
    setEditSaving(false);
    if (error) { Alert.alert('Ошибка', ru(error)); return; }
    setEditSlot(null); setEditPrice(''); load();
  }

  async function removeSlot(id: string) {
    Alert.alert('Удалить слот?', '', [
      { text: 'Отмена' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        await supabase.from('tutor_availability').delete().eq('id', id);
        load();
      }},
    ]);
  }

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.title}>Расписание</Text>
        <Text style={s.sub}>Зелёным подсвечены даты со слотами, жёлтым — с бронированиями. Тапни дату, чтобы добавить или убрать слот.</Text>

        <View style={s.calendarCard}>
          <CalendarMonth
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            markers={markers}
          />
        </View>

        {selectedDate && (
          <View style={s.dateBlock}>
            <View style={s.dateHeader}>
              <Text style={s.dateTitle}>{format(selectedDate, 'd MMMM, EEEE', { locale: ruLocale })}</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)}>
                <Plus size={16} color="#fff" />
                <Text style={s.addBtnText}>Добавить</Text>
              </TouchableOpacity>
            </View>

            {dateSlots.length === 0 && dateBookings.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyText}>Нет слотов на этот день</Text>
              </View>
            ) : (
              <>
                {dateSlots.map(slot => (
                  <View key={slot.id} style={s.slotRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.slotTime}>
                        {slot.start_time} — {slot.end_time}
                        {slot.price_per_hour_override != null && (
                          <Text style={s.slotPrice}> · {(slot.price_per_hour_override / 100).toLocaleString('ru')} ₽/час</Text>
                        )}
                      </Text>
                      <View style={s.slotMeta}>
                        {slot.specific_date ? (
                          <View style={s.tag}><CalendarDays size={11} color={COLORS.warning} /><Text style={[s.tagText, { color: COLORS.warning }]}>Только эта дата</Text></View>
                        ) : (
                          <View style={s.tag}><Repeat size={11} color={COLORS.primary} /><Text style={[s.tagText, { color: COLORS.primary }]}>Каждый {DAY_NAMES[slot.day_of_week].toLowerCase()}</Text></View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity style={s.editBtn} onPress={() => openEditSlot(slot)}>
                      <Settings size={14} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.delBtn} onPress={() => removeSlot(slot.id)}>
                      <Trash2 size={14} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                {dateBookings.map(b => (
                  <View key={b.id} style={[s.slotRow, { backgroundColor: COLORS.warning + '15', borderColor: COLORS.warning + '40' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.slotTime}>{format(parseISO(b.start_time), 'HH:mm')} — {format(parseISO(b.end_time), 'HH:mm')}</Text>
                      <Text style={[s.slotMeta, { color: COLORS.warning }]}>Бронь · {b.status === 'pending' ? 'ожидает' : b.status === 'confirmed' ? 'подтверждена' : b.status}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <View style={s.modalRoot}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Новый слот на {selectedDate && format(selectedDate, 'd MMMM', { locale: ruLocale })}</Text>
            <Text style={s.modalLabel}>Начало</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hourScroll}>
              {HOURS_30.map(h => (
                <TouchableOpacity key={h} style={[s.hourChip, pickStart === h && s.hourChipActive]} onPress={() => setPickStart(h)}>
                  <Text style={[s.hourText, pickStart === h && s.hourTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={s.modalLabel}>Окончание</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hourScroll}>
              {HOURS_30.map(h => (
                <TouchableOpacity key={h} style={[s.hourChip, pickEnd === h && s.hourChipActive]} onPress={() => setPickEnd(h)}>
                  <Text style={[s.hourText, pickEnd === h && s.hourTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalLabel}>Повторять каждую неделю</Text>
                <Text style={s.hint}>На все {selectedDate ? DAY_NAMES[selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1].toLowerCase() : ''}</Text>
              </View>
              <Switch value={addRecurring} onValueChange={setAddRecurring} trackColor={{ true: COLORS.primary, false: COLORS.border }} />
            </View>
            <Text style={s.modalLabel}>Цена за час (необязательно)</Text>
            <TextInput
              style={s.priceInput}
              value={pickPrice}
              onChangeText={setPickPrice}
              placeholder="Если пусто — обычная цена из профиля"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numeric"
              maxLength={6}
            />
            <Text style={s.hint}>В рублях. Можно задавать особую цену для конкретного слота — например, выше для вечернего времени или ниже для утра.</Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setAddOpen(false); setPickPrice(''); }}>
                <Text style={s.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSave} onPress={saveSlot}>
                <Text style={s.modalSaveText}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editSlot} animationType="slide" transparent onRequestClose={() => setEditSlot(null)}>
        <View style={s.modalRoot}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Цена слота {editSlot?.start_time} — {editSlot?.end_time}</Text>
            <Text style={s.modalLabel}>Цена за час (₽)</Text>
            <TextInput
              style={s.priceInput}
              value={editPrice}
              onChangeText={setEditPrice}
              placeholder="Пусто — обычная цена из профиля"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numeric"
              maxLength={6}
              autoFocus
            />
            <Text style={s.hint}>Очистите поле, чтобы вернуть слот к обычной цене из профиля.</Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setEditSlot(null); setEditPrice(''); }} disabled={editSaving}>
                <Text style={s.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, editSaving && { opacity: 0.5 }]} onPress={saveEditSlot} disabled={editSaving}>
                {editSaving ? <ActivityIndicator color="#fff" /> : <Text style={s.modalSaveText}>Сохранить</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scroll: { padding: 16, gap: 12, maxWidth: 720, alignSelf: 'center' as any, width: '100%' },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  calendarCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 10 },
  dateBlock: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 10 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, textTransform: 'capitalize' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.primary },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { paddingVertical: 16, alignItems: 'center' },
  emptyText: { fontSize: 13, color: COLORS.textSecondary },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: COLORS.success + '10', borderRadius: 10, borderWidth: 1, borderColor: COLORS.success + '30' },
  slotTime: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  slotPrice: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  slotMeta: { fontSize: 11, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tagText: { fontSize: 11, fontWeight: '600' },
  editBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary + '15' },
  delBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.error + '15' },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.background, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },
  hint: { fontSize: 11, color: COLORS.textSecondary },
  hourScroll: { gap: 6, paddingVertical: 4 },
  hourChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, minWidth: 60, alignItems: 'center' },
  priceInput: { backgroundColor: COLORS.white, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.border, fontSize: 14, color: COLORS.text, marginTop: 4 },
  hourChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  hourText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  hourTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  modalCancelText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600' },
  modalSave: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 12 },
  modalSaveText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});

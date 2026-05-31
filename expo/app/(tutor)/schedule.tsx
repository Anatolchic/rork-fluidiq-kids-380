import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { Plus, Trash2, Clock } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS, DAY_NAMES, DAY_SHORT } from '../../lib/constants';
import { TutorAvailability } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

export default function TutorSchedule() {
  const { session } = useAuthStore();
  const [slots, setSlots] = useState<TutorAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDay, setPickerDay] = useState<number | null>(null);
  const [pickerStart, setPickerStart] = useState('09:00');
  const [pickerEnd, setPickerEnd] = useState('18:00');

  useEffect(() => { if (session) load(); }, [session]);

  async function load() {
    const { data } = await supabase.from('tutor_availability').select('*').eq('tutor_id', session!.user.id).order('day_of_week');
    setSlots(data || []);
    setLoading(false);
  }

  function openPicker(day: number) {
    setPickerDay(day);
    setPickerStart('09:00');
    setPickerEnd('18:00');
    setPickerOpen(true);
  }

  async function saveSlot() {
    if (pickerDay === null) return;
    if (pickerStart >= pickerEnd) {
      Alert.alert('Ошибка', 'Время окончания должно быть позже начала');
      return;
    }
    const { error } = await supabase.from('tutor_availability').upsert({
      tutor_id: session!.user.id,
      day_of_week: pickerDay,
      start_time: pickerStart,
      end_time: pickerEnd,
    }, { onConflict: 'tutor_id,day_of_week' });
    if (error) { Alert.alert('Ошибка', error.message); return; }
    setPickerOpen(false);
    load();
  }

  async function removeSlot(id: string) {
    Alert.alert('Удалить слот?', 'Ученики не смогут больше записаться на этот день', [
      { text: 'Отмена' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        await supabase.from('tutor_availability').delete().eq('id', id);
        load();
      }},
    ]);
  }

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Расписание</Text>
        <Text style={styles.subtitle}>Часы, в которые принимаете учеников. По одному окну на день — ученик выбирает слот внутри.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {DAY_NAMES.map((dayName, dayIdx) => {
          const slot = slots.find(s => s.day_of_week === dayIdx);
          return (
            <View key={dayIdx} style={[styles.dayCard, slot && styles.dayCardActive]}>
              <View style={styles.dayInfo}>
                <Text style={styles.dayName}>{dayName}</Text>
                {slot ? (
                  <View style={styles.timeRow}>
                    <Clock size={14} color={COLORS.primary} />
                    <Text style={styles.timeText}>{slot.start_time} — {slot.end_time}</Text>
                  </View>
                ) : (
                  <Text style={styles.dayOff}>Выходной</Text>
                )}
              </View>
              {slot ? (
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeSlot(slot.id)}>
                  <Trash2 size={16} color={COLORS.error} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.addBtn} onPress={() => openPicker(dayIdx)}>
                  <Plus size={16} color={COLORS.primary} />
                  <Text style={styles.addText}>Добавить</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{pickerDay !== null ? DAY_NAMES[pickerDay] : ''}</Text>
            <Text style={styles.modalLabel}>Начало</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourScroll}>
              {HOURS.map(h => (
                <TouchableOpacity key={h} style={[styles.hourChip, pickerStart === h && styles.hourChipActive]} onPress={() => setPickerStart(h)}>
                  <Text style={[styles.hourText, pickerStart === h && styles.hourTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.modalLabel}>Окончание</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourScroll}>
              {HOURS.map(h => (
                <TouchableOpacity key={h} style={[styles.hourChip, pickerEnd === h && styles.hourChipActive]} onPress={() => setPickerEnd(h)}>
                  <Text style={[styles.hourText, pickerEnd === h && styles.hourTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setPickerOpen(false)}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveSlot}>
                <Text style={styles.modalSaveText}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  scroll: { padding: 16, gap: 10 },
  dayCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  dayCardActive: { borderColor: COLORS.primary + '40' },
  dayInfo: { flex: 1, gap: 4 },
  dayName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },
  dayOff: { fontSize: 13, color: COLORS.textSecondary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.primaryLight },
  addText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  removeBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.error + '15' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.background, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  modalLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginTop: 4 },
  hourScroll: { gap: 6, paddingVertical: 4 },
  hourChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, minWidth: 60, alignItems: 'center' },
  hourChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  hourText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  hourTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalCancel: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  modalCancelText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600' },
  modalSave: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 12 },
  modalSaveText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});

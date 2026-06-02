import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { format, differenceInMinutes } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Calendar, Clock, BookOpen, Target, MessageSquare, Video, X, AlertTriangle } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS, BOOKING_STATUS_LABELS, MIN_BALANCE_KOPECKS } from '../../lib/constants';
import { Booking } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';

export default function BookingDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuthStore();

  const [booking, setBooking] = useState<any>(null);
  const [chatRoomId, setChatRoomId] = useState<string | null>(null);
  const [tutorBalance, setTutorBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    setLoading(true);
    const [b, c] = await Promise.all([
      supabase.from('bookings').select('*').eq('id', id).maybeSingle(),
      supabase.from('chat_rooms').select('id').eq('booking_id', id).maybeSingle(),
    ]);
    let bookingData: any = b.data;
    if (bookingData) {
      const [t, st] = await Promise.all([
        supabase.from('tutor_profiles').select('*').eq('user_id', bookingData.tutor_id).maybeSingle(),
        supabase.from('student_profiles').select('*').eq('user_id', bookingData.student_id).maybeSingle(),
      ]);
      bookingData = { ...bookingData, tutor: t.data, student: st.data };
    }
    setBooking(bookingData);
    setChatRoomId(c.data?.id || null);
    if (b.data?.tutor_id && profile?.role === 'tutor') {
      const { data: t } = await supabase.from('tutor_profiles').select('balance').eq('user_id', b.data.tutor_id).maybeSingle();
      setTutorBalance(t?.balance ?? null);
    }
    setLoading(false);
  }

  async function confirmAsTutor() {
    if (!booking) return;
    setWorking(true);
    const { error } = await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', booking.id);
    setWorking(false);
    if (error) Alert.alert('Ошибка', error.message);
    else load();
  }

  async function declineAsTutor() {
    if (!booking) return;
    Alert.alert('Отклонить заявку?', 'Ученик получит уведомление', [
      { text: 'Отмена' },
      { text: 'Отклонить', style: 'destructive', onPress: async () => {
        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
        load();
      }},
    ]);
  }

  async function cancelAsStudent() {
    if (!booking) return;
    Alert.alert('Отменить бронь?', 'Отмена бесплатная', [
      { text: 'Передумал' },
      { text: 'Отменить', style: 'destructive', onPress: async () => {
        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
        load();
      }},
    ]);
  }

  async function startLesson() {
    if (!booking) return;
    setWorking(true);
    const { data, error } = await supabase.rpc('start_lesson', { p_booking_id: booking.id });
    setWorking(false);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    if (data === false) {
      Alert.alert('Недостаточно баланса', `Нужно минимум ${MIN_BALANCE_KOPECKS / 100} ₽ на балансе репетитора. Пополните кошелёк в разделе «Кошелёк».`);
      return;
    }
    router.push(`/call/${booking.id}`);
  }

  async function joinLesson() {
    router.push(`/call/${booking.id}`);
  }

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!booking) return <View style={styles.loader}><Text style={styles.empty}>Бронь не найдена</Text></View>;

  const isStudent = session?.user.id === booking.student_id;
  const isTutor = session?.user.id === booking.tutor_id;
  const counterpart = isStudent ? booking.tutor : booking.student;
  const startDate = new Date(booking.start_time);
  const minutesToStart = differenceInMinutes(startDate, new Date());
  const canStart = booking.status === 'confirmed' && minutesToStart <= 15;
  const balanceLow = isTutor && tutorBalance !== null && tutorBalance < MIN_BALANCE_KOPECKS;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statusCard}>
          <View style={[styles.statusPill, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(booking.status) }]}>{BOOKING_STATUS_LABELS[booking.status]}</Text>
          </View>
          <Text style={styles.subject}>{booking.subject}</Text>
          <Text style={styles.price}>{(booking.price / 100).toLocaleString('ru')} ₽</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{isStudent ? 'Репетитор' : 'Ученик'}</Text>
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{counterpart?.name?.charAt(0)?.toUpperCase() || '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.counterpartName}>{counterpart?.name || (isStudent ? 'Репетитор' : 'Ученик')}</Text>
              {isStudent && booking.tutor?.rating > 0 && (
                <Text style={styles.counterpartMeta}>⭐ {booking.tutor.rating.toFixed(1)} · {booking.tutor.reviews_count} отзывов</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.line}><Calendar size={16} color={COLORS.primary} /><Text style={styles.lineText}>{format(startDate, 'd MMMM yyyy, EEEE', { locale: ru })}</Text></View>
          <View style={styles.line}><Clock size={16} color={COLORS.primary} /><Text style={styles.lineText}>{format(startDate, 'HH:mm')} · {booking.duration} мин</Text></View>
          <View style={styles.line}><BookOpen size={16} color={COLORS.primary} /><Text style={styles.lineText}>Уровень: {booking.level}</Text></View>
          {booking.topic && <View style={styles.line}><Target size={16} color={COLORS.primary} /><Text style={styles.lineText}>{booking.topic}</Text></View>}
        </View>

        {isStudent && booking.status === 'confirmed' && booking.tutor?.payment_details && (
          <View style={styles.payCard}>
            <Text style={styles.payTitle}>💳 Реквизиты репетитора</Text>
            <Text style={styles.payMethod}>{getPayLabel(booking.tutor.payment_method)}</Text>
            <Text style={styles.payDetails}>{booking.tutor.payment_details}</Text>
            <Text style={styles.payHint}>Оплата напрямую репетитору в удобный момент. Платформа не является посредником в расчётах.</Text>
          </View>
        )}

        {balanceLow && booking.status === 'confirmed' && (
          <TouchableOpacity style={styles.warnCard} onPress={() => router.push('/(tutor)/wallet')}>
            <AlertTriangle size={18} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>Низкий баланс</Text>
              <Text style={styles.warnSub}>На балансе {((tutorBalance || 0) / 100).toLocaleString('ru')} ₽, для старта нужно минимум {MIN_BALANCE_KOPECKS / 100} ₽</Text>
            </View>
          </TouchableOpacity>
        )}

        {chatRoomId && booking.status !== 'cancelled' && (
          <TouchableOpacity style={styles.chatBtn} onPress={() => router.push(`/chat/${chatRoomId}`)}>
            <MessageSquare size={18} color={COLORS.primary} />
            <Text style={styles.chatBtnText}>Перейти в чат</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.actions}>
        {isTutor && booking.status === 'pending' && (
          <>
            <TouchableOpacity style={[styles.declineBtn, working && { opacity: 0.5 }]} disabled={working} onPress={declineAsTutor}>
              <X size={16} color={COLORS.error} />
              <Text style={styles.declineText}>Отклонить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, working && { opacity: 0.5 }]} disabled={working} onPress={confirmAsTutor}>
              {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Подтвердить</Text>}
            </TouchableOpacity>
          </>
        )}

        {isStudent && (booking.status === 'pending' || booking.status === 'confirmed') && (
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelAsStudent}>
            <Text style={styles.cancelText}>Отменить бронь</Text>
          </TouchableOpacity>
        )}

        {isTutor && booking.status === 'confirmed' && (
          <TouchableOpacity style={[styles.startBtn, (!canStart || working) && { opacity: 0.5 }]} disabled={!canStart || working} onPress={startLesson}>
            <Video size={18} color="#fff" />
            <Text style={styles.startText}>{canStart ? 'Начать урок' : `Начать через ${minutesToStart} мин`}</Text>
          </TouchableOpacity>
        )}

        {isStudent && booking.status === 'confirmed' && (
          <TouchableOpacity style={[styles.startBtn, !canStart && { opacity: 0.5 }]} disabled={!canStart} onPress={joinLesson}>
            <Video size={18} color="#fff" />
            <Text style={styles.startText}>{canStart ? 'Войти в урок' : `Старт через ${minutesToStart} мин`}</Text>
          </TouchableOpacity>
        )}

        {booking.status === 'active' && (
          <TouchableOpacity style={styles.startBtn} onPress={joinLesson}>
            <Video size={18} color="#fff" />
            <Text style={styles.startText}>📹 Войти в урок</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function getStatusColor(s: string): string {
  const m: Record<string, string> = { pending: COLORS.warning, confirmed: COLORS.success, active: COLORS.primary, completed: COLORS.textSecondary, cancelled: COLORS.error };
  return m[s] || COLORS.textSecondary;
}
function getPayLabel(m: string): string {
  const map: Record<string, string> = { card: 'Перевод на карту', phone: 'По номеру телефона', bank: 'По реквизитам банка', phone_top: 'Пополнение телефона', other: 'Другой способ' };
  return map[m] || 'Способ оплаты';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  empty: { fontSize: 16, color: COLORS.textSecondary },
  scroll: { padding: 16, gap: 12, paddingBottom: 24, maxWidth: 720, alignSelf: 'center' as any, width: '100%' },
  statusCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 20, alignItems: 'center', gap: 8 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 13, fontWeight: '700' },
  subject: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  price: { fontSize: 26, fontWeight: '800', color: COLORS.primary },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 10 },
  cardTitle: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  counterpartName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  counterpartMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineText: { fontSize: 14, color: COLORS.text, flex: 1 },
  payCard: { backgroundColor: COLORS.success + '10', borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: COLORS.success + '30' },
  payTitle: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  payMethod: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  payDetails: { fontSize: 15, fontWeight: '700', color: COLORS.text, paddingVertical: 4 },
  payHint: { fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 },
  warnCard: { flexDirection: 'row', gap: 10, backgroundColor: COLORS.warning + '15', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.warning + '40', alignItems: 'center' },
  warnTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  warnSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.primary + '30' },
  chatBtnText: { fontSize: 15, color: COLORS.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background },
  declineBtn: { flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.error + '15', borderRadius: 12 },
  declineText: { color: COLORS.error, fontSize: 14, fontWeight: '700' },
  confirmBtn: { flex: 1.5, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 12 },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.error + '40' },
  cancelText: { color: COLORS.error, fontSize: 14, fontWeight: '700' },
  startBtn: { flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12 },
  startText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

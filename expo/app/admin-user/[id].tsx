import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { KeyRound, ShieldCheck, ShieldOff, Trash2, DollarSign, Eye, EyeOff } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';

export default function AdminUserDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.rpc('admin_get_user', { p_user_id: id });
    setData(u);
    setLoading(false);
  }

  async function resetPassword() {
    Alert.alert('Сбросить пароль?', 'Будет сгенерирован новый случайный пароль', [
      { text: 'Отмена' },
      { text: 'Сбросить', style: 'destructive', onPress: async () => {
        setWorking(true);
        const { data: r, error } = await supabase.functions.invoke('admin-actions', { body: { action: 'reset_password', user_id: id } });
        setWorking(false);
        if (error) { Alert.alert('Ошибка', error.message); return; }
        Alert.alert('Новый пароль', `Передайте пользователю:\n\n${r?.new_password}`, [{ text: 'OK' }]);
      }},
    ]);
  }

  async function toggleAdmin() {
    const currentRole = data?.role;
    setWorking(true);
    if (currentRole === 'admin') {
      const { data: r, error } = await supabase.rpc('admin_revoke_admin', { p_user_id: id });
      setWorking(false);
      if (error || (r as any)?.success === false) { Alert.alert('Ошибка', error?.message || (r as any)?.error); return; }
      load();
    } else {
      const { data: r, error } = await supabase.rpc('admin_grant_admin', { p_email: data?.email });
      setWorking(false);
      if (error || (r as any)?.success === false) { Alert.alert('Ошибка', error?.message || (r as any)?.error); return; }
      load();
    }
  }

  async function deleteUser() {
    Alert.alert('Удалить пользователя?', 'Это действие необратимо. Все данные пользователя будут удалены.', [
      { text: 'Отмена' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        setWorking(true);
        const { error } = await supabase.functions.invoke('admin-actions', { body: { action: 'delete_user', user_id: id } });
        setWorking(false);
        if (error) { Alert.alert('Ошибка', error.message); return; }
        router.back();
      }},
    ]);
  }

  async function togglePublished() {
    if (!data?.tutor_profile) return;
    setWorking(true);
    const { error } = await supabase.rpc('admin_set_tutor_published', { p_user_id: id, p_published: !data.tutor_profile.is_published });
    setWorking(false);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    load();
  }

  async function adjustBalance(delta: number) {
    Alert.alert('Корректировка баланса', `${delta > 0 ? 'Начислить' : 'Списать'} ${Math.abs(delta) / 100} ₽?`, [
      { text: 'Отмена' },
      { text: 'OK', onPress: async () => {
        setWorking(true);
        const { error } = await supabase.rpc('admin_adjust_balance', { p_user_id: id, p_delta_kopecks: delta, p_reason: 'Ручная корректировка' });
        setWorking(false);
        if (error) { Alert.alert('Ошибка', error.message); return; }
        load();
      }},
    ]);
  }

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!data) return <View style={s.loader}><Text style={s.dim}>Пользователь не найден</Text></View>;

  const t = data.tutor_profile;
  const st = data.student_profile;
  const totalBookings = (data.bookings_as_student?.length || 0) + (data.bookings_as_tutor?.length || 0);

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.head}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(t?.name || st?.name || data.email)?.charAt(0)?.toUpperCase()}</Text>
          </View>
          <Text style={s.name}>{t?.name || st?.name || '—'}</Text>
          <Text style={s.email}>{data.email}</Text>
          <View style={[s.pill, { backgroundColor: roleColor(data.role) + '20' }]}>
            <Text style={[s.pillText, { color: roleColor(data.role) }]}>{roleLabel(data.role)}</Text>
          </View>
          <Text style={s.meta}>Регистрация: {format(new Date(data.created_at), 'd MMMM yyyy', { locale: ru })}</Text>
          {data.last_sign_in_at && <Text style={s.meta}>Последний вход: {format(new Date(data.last_sign_in_at), 'd MMMM, HH:mm', { locale: ru })}</Text>}
        </View>

        {t && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Профиль репетитора</Text>
            <Row label="Опыт" value={`${t.experience_years} лет`} />
            <Row label="Цена" value={`${(t.price_per_hour / 100).toLocaleString('ru')} ₽/час`} />
            <Row label="Рейтинг" value={t.rating > 0 ? `${Number(t.rating).toFixed(1)} (${t.reviews_count})` : '—'} />
            <Row label="Баланс" value={`${(t.balance / 100).toLocaleString('ru')} ₽`} />
            <Row label="Опубликован" value={t.is_published ? '✅ Да' : '❌ Нет'} />
            <View style={s.actionRow}>
              <TouchableOpacity style={s.actionBtn} onPress={togglePublished} disabled={working}>
                {t.is_published ? <EyeOff size={16} color={COLORS.warning} /> : <Eye size={16} color={COLORS.success} />}
                <Text style={s.actionText}>{t.is_published ? 'Скрыть' : 'Опубликовать'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={() => adjustBalance(50000)} disabled={working}>
                <DollarSign size={16} color={COLORS.success} />
                <Text style={s.actionText}>+500 ₽</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={() => adjustBalance(-50000)} disabled={working}>
                <DollarSign size={16} color={COLORS.error} />
                <Text style={s.actionText}>-500 ₽</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.cardTitle}>Управление аккаунтом</Text>
          <TouchableOpacity style={s.dangerBtn} onPress={resetPassword} disabled={working}>
            <KeyRound size={18} color={COLORS.primary} />
            <Text style={[s.dangerText, { color: COLORS.primary }]}>Сбросить пароль</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dangerBtn} onPress={toggleAdmin} disabled={working}>
            {data.role === 'admin' ? <ShieldOff size={18} color={COLORS.warning} /> : <ShieldCheck size={18} color={COLORS.success} />}
            <Text style={[s.dangerText, { color: data.role === 'admin' ? COLORS.warning : COLORS.success }]}>
              {data.role === 'admin' ? 'Снять права админа' : 'Назначить админом'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dangerBtn} onPress={deleteUser} disabled={working}>
            <Trash2 size={18} color={COLORS.error} />
            <Text style={[s.dangerText, { color: COLORS.error }]}>Удалить пользователя</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Активность · {totalBookings} бронирований</Text>
          {[...(data.bookings_as_tutor || []), ...(data.bookings_as_student || [])]
            .sort((a: any, b: any) => +new Date(b.start_time) - +new Date(a.start_time))
            .slice(0, 10)
            .map((b: any) => (
              <View key={b.id} style={s.row}>
                <Text style={s.rowLeft}>{b.subject} · {format(new Date(b.start_time), 'd MMM HH:mm', { locale: ru })}</Text>
                <Text style={[s.rowRight, { color: statusColor(b.status) }]}>{b.status}</Text>
              </View>
            ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={s.row}><Text style={s.rowLeft}>{label}</Text><Text style={s.rowRight}>{value}</Text></View>;
}
function roleLabel(r?: string) { return r === 'admin' ? 'Админ' : r === 'tutor' ? 'Репетитор' : r === 'student' ? 'Ученик' : 'Гость'; }
function roleColor(r?: string) { return r === 'admin' ? '#FF9800' : r === 'tutor' ? '#6C63FF' : r === 'student' ? '#4CAF50' : '#999'; }
function statusColor(s: string) { return s === 'pending' ? COLORS.warning : s === 'confirmed' ? COLORS.success : s === 'cancelled' ? COLORS.error : COLORS.textSecondary; }

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dim: { color: COLORS.textSecondary },
  scroll: { padding: 16, gap: 12 },
  head: { alignItems: 'center', padding: 16, gap: 6 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 32, fontWeight: '800', color: COLORS.primary },
  name: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginTop: 6 },
  email: { fontSize: 13, color: COLORS.textSecondary },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginTop: 4 },
  pillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  meta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border + '50' },
  rowLeft: { fontSize: 13, color: COLORS.textSecondary },
  rowRight: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  actionText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: COLORS.background, borderRadius: 10 },
  dangerText: { fontSize: 14, fontWeight: '600' },
});

import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, TextInput, Modal, Alert, Linking, Platform } from 'react-native';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { TrendingUp, TrendingDown, Plus } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { initTopupPayment } from '../../lib/tbank';
import { COLORS, MIN_BALANCE_KOPECKS, COMMISSION_KOPECKS } from '../../lib/constants';
import { Payment, TutorProfile } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

export default function TutorWallet() {
  const { session } = useAuthStore();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [history, setHistory] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [amount, setAmount] = useState('1000');
  const [paying, setPaying] = useState(false);

  useEffect(() => { if (session) load(); }, [session]);

  async function load() {
    setLoading(true);
    const [p, h] = await Promise.all([
      supabase.from('tutor_profiles').select('*').eq('user_id', session!.user.id).single(),
      supabase.from('payments').select('*').eq('tutor_id', session!.user.id).order('created_at', { ascending: false }).limit(30),
    ]);
    if (p.data) setProfile(p.data);
    setHistory(h.data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [session]);

  async function handleTopup() {
    const rub = Number(amount);
    if (!rub || rub < 100) { Alert.alert('Минимум 100 ₽'); return; }
    setPaying(true);
    try {
      const res = await initTopupPayment({ tutorId: session!.user.id, amountKopecks: rub * 100, email: session?.user.email });
      if (!res.success || !res.paymentUrl) {
        Alert.alert('Не удалось начать оплату', res.error || 'Попробуйте позже');
        return;
      }
      setTopupOpen(false);
      await Linking.openURL(res.paymentUrl);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось');
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  const balance = profile?.balance ?? 0;
  const balanceRub = (balance / 100).toLocaleString('ru');
  const low = balance < MIN_BALANCE_KOPECKS;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
        <View style={styles.header}>
          <Text style={styles.title}>Кошелёк</Text>
        </View>

        <View style={[styles.balanceCard, low && styles.balanceCardLow]}>
          <Text style={styles.balanceLabel}>Баланс</Text>
          <Text style={styles.balanceValue}>{balanceRub} ₽</Text>
          <Text style={styles.balanceHint}>
            Комиссия за урок: {(COMMISSION_KOPECKS / 100).toLocaleString('ru')} ₽ · Мин. баланс для старта урока: {(MIN_BALANCE_KOPECKS / 100).toLocaleString('ru')} ₽
          </Text>
          <TouchableOpacity style={styles.topupBtn} onPress={() => setTopupOpen(true)}>
            <Plus size={18} color="#fff" />
            <Text style={styles.topupText}>Пополнить</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>История</Text>
          {history.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>💸</Text>
              <Text style={styles.emptyText}>Операций пока нет</Text>
            </View>
          ) : (
            history.map(p => (
              <View key={p.id} style={styles.historyItem}>
                <View style={[styles.icon, p.type === 'topup' ? styles.iconUp : styles.iconDown]}>
                  {p.type === 'topup' ? <TrendingUp size={16} color={COLORS.success} /> : <TrendingDown size={16} color={COLORS.error} />}
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyTitle}>
                    {p.type === 'topup' ? 'Пополнение' : p.type === 'commission' ? 'Комиссия за урок' : 'Возврат'}
                  </Text>
                  <Text style={styles.historyDate}>{format(new Date(p.created_at), 'd MMMM, HH:mm', { locale: ru })}</Text>
                </View>
                <Text style={[styles.historyAmount, { color: p.type === 'topup' ? COLORS.success : COLORS.error }]}>
                  {p.type === 'topup' ? '+' : '−'}{(p.amount / 100).toLocaleString('ru')} ₽
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={topupOpen} animationType="slide" transparent onRequestClose={() => setTopupOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Пополнить баланс</Text>
            <Text style={styles.modalSub}>Оплата через Т-Банк, любая карта</Text>
            <View style={styles.amountRow}>
              <TextInput style={styles.amountInput} value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholderTextColor={COLORS.textSecondary} />
              <Text style={styles.amountCurrency}>₽</Text>
            </View>
            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map(q => (
                <TouchableOpacity key={q} style={styles.quickChip} onPress={() => setAmount(String(q))}>
                  <Text style={styles.quickText}>{q} ₽</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setTopupOpen(false)}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalPay, paying && styles.modalPayDisabled]} disabled={paying} onPress={handleTopup}>
                {paying ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPayText}>Оплатить</Text>}
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
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 16 },
  header: { paddingHorizontal: 4, paddingTop: 8 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text },
  balanceCard: { backgroundColor: COLORS.primary, borderRadius: 18, padding: 20, gap: 6 },
  balanceCardLow: { backgroundColor: COLORS.warning },
  balanceLabel: { fontSize: 13, color: '#ffffffcc', fontWeight: '600' },
  balanceValue: { fontSize: 38, fontWeight: '800', color: '#fff' },
  balanceHint: { fontSize: 11, color: '#ffffffcc', lineHeight: 16, marginTop: 4 },
  topupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, height: 48, backgroundColor: '#ffffff25', borderRadius: 12, borderWidth: 1, borderColor: '#ffffff40' },
  topupText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, paddingHorizontal: 4 },
  emptyCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 24, alignItems: 'center', gap: 6 },
  emptyEmoji: { fontSize: 36 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.white, borderRadius: 12, padding: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  iconUp: { backgroundColor: COLORS.success + '15' },
  iconDown: { backgroundColor: COLORS.error + '15' },
  historyInfo: { flex: 1, gap: 2 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  historyDate: { fontSize: 12, color: COLORS.textSecondary },
  historyAmount: { fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.background, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  modalSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: COLORS.text, paddingVertical: 12 },
  amountCurrency: { fontSize: 18, color: COLORS.textSecondary, fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickChip: { flex: 1, height: 42, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  quickText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  modalCancelText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600' },
  modalPay: { flex: 1.5, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 12 },
  modalPayDisabled: { opacity: 0.5 },
  modalPayText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});

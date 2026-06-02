import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TextInput, Modal, Alert, Linking, Platform, Pressable, Animated } from 'react-native';
import { format } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { TrendingUp, TrendingDown, Plus, Star, Check, Crown, Wallet, RotateCcw } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import supabase from '../../lib/supabase';
import { initTopupPayment } from '../../lib/tbank';
import { COLORS, MIN_BALANCE_KOPECKS, COMMISSION_KOPECKS } from '../../lib/constants';
import { ru } from '../../lib/errors';
import { Payment, TutorProfile } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';
import { useResponsive } from '../../lib/responsive';

const DEFAULT_PRO_PRICE_KOPECKS = 99000;
const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

export default function TutorWallet() {
  const { session } = useAuthStore();
  const { contentMaxWidth } = useResponsive();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [history, setHistory] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [amount, setAmount] = useState('1000');
  const [paying, setPaying] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [proUntil, setProUntil] = useState<string | null>(null);
  const [proPrice, setProPrice] = useState<number>(DEFAULT_PRO_PRICE_KOPECKS);
  const [buyingPro, setBuyingPro] = useState(false);

  useEffect(() => { if (session) load(); }, [session]);

  async function load() {
    setLoading(true);
    const [p, h, s, pro, sub] = await Promise.all([
      supabase.from('tutor_profiles').select('*').eq('user_id', session!.user.id).single(),
      supabase.from('payments').select('*').eq('tutor_id', session!.user.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('app_settings').select('test_mode, pro_subscription_price_kopecks').limit(1).maybeSingle(),
      supabase.rpc('is_pro_tutor', { p_user_id: session!.user.id }),
      supabase.from('tutor_subscriptions').select('expires_at').eq('tutor_id', session!.user.id).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (p.data) setProfile(p.data);
    setHistory(h.data || []);
    setTestMode(!!s.data?.test_mode);
    const priceFromSettings = (s.data as any)?.pro_subscription_price_kopecks;
    setProPrice(priceFromSettings && priceFromSettings > 0 ? priceFromSettings : DEFAULT_PRO_PRICE_KOPECKS);
    setIsPro(!!pro.data);
    setProUntil((sub.data as any)?.expires_at ?? null);
    setLoading(false);
  }

  async function handleBuyPro() {
    setBuyingPro(true);
    const { data, error } = await supabase.rpc('buy_pro_subscription', { p_months: 1 });
    setBuyingPro(false);
    if (error) { Alert.alert('Не удалось', ru(error)); return; }
    const result = data as any;
    if (result && result.ok === false) {
      Alert.alert('Не удалось', result.error || 'Недостаточно средств на балансе');
      return;
    }
    Alert.alert('Готово', isPro ? 'PRO-подписка продлена на месяц' : 'PRO-подписка активирована на месяц');
    load();
  }

  async function handleDevTopup() {
    const rub = Number(amount);
    if (!rub || rub < 100) { Alert.alert('Минимум 100 ₽'); return; }
    setPaying(true);
    const { data, error } = await supabase.rpc('dev_topup', { p_amount_kopecks: rub * 100 });
    setPaying(false);
    if (error) { Alert.alert('Не удалось', error.message); return; }
    setTopupOpen(false);
    Alert.alert('Тестовая оплата', `Зачислено ${rub.toLocaleString('ru')} ₽`);
    load();
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
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: contentMaxWidth }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
        <View style={styles.header}>
          <Text style={styles.title}>Кошелёк</Text>
        </View>

        {/* Balance — большой градиентный hero */}
        <LinearGradient
          colors={low ? [COLORS.warning, '#E65100'] : [COLORS.primary, '#3F3FBF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceTopRow}>
            <View style={styles.balanceIconWrap}>
              <Wallet size={20} color="#fff" />
            </View>
            <Text style={styles.balanceLabel}>Баланс</Text>
          </View>
          <Text style={styles.balanceValue}>{balanceRub} ₽</Text>
          <Text style={styles.balanceHint}>
            Комиссия за урок: {(COMMISSION_KOPECKS / 100).toLocaleString('ru')} ₽ · Мин. баланс для старта: {(MIN_BALANCE_KOPECKS / 100).toLocaleString('ru')} ₽
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.topupBtn,
              { transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
            onPress={() => setTopupOpen(true)}
          >
            <Plus size={18} color="#fff" />
            <Text style={styles.topupText}>Пополнить</Text>
          </Pressable>
          {/* Декоративная иконка фоном */}
          <View style={styles.balanceBgIcon} pointerEvents="none">
            <Wallet size={140} color="#ffffff10" strokeWidth={1.5} />
          </View>
        </LinearGradient>

        {/* PRO-карточка с золотым градиентом */}
        <LinearGradient
          colors={['#FFD700', '#FFA000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.proCard}
        >
          <View style={styles.proHeaderRow}>
            <View style={styles.proBadge}>
              <Crown size={14} color="#FFA000" fill="#FFA000" />
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
            {isPro && proUntil && (
              <View style={styles.proUntilBadge}>
                <Text style={styles.proStatus}>до {format(new Date(proUntil), 'd MMMM yyyy', { locale: ruLocale })}</Text>
              </View>
            )}
          </View>
          <Text style={styles.proTitle}>{isPro ? 'PRO-подписка активна' : 'PRO-подписка'}</Text>
          <Text style={styles.proPrice}>{(proPrice / 100).toLocaleString('ru')} ₽ / месяц</Text>
          <View style={styles.perks}>
            <Perk text="Приоритетное место в каталоге" />
            <Perk text="Без комиссии за урок" />
            <Perk text="Бейдж PRO рядом с именем" />
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.proBtn,
              buyingPro && styles.proBtnDisabled,
              { transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
            disabled={buyingPro}
            onPress={handleBuyPro}
          >
            {buyingPro ? <ActivityIndicator color="#FFA000" /> : (
              <Text style={styles.proBtnText}>{isPro ? 'Продлить на месяц' : 'Купить PRO на месяц'}</Text>
            )}
          </Pressable>
          <Text style={styles.proHint}>Списание с баланса. Убедись, что на счёте есть {(proPrice / 100).toLocaleString('ru')} ₽.</Text>
          <View style={styles.proBgIcon} pointerEvents="none">
            <Crown size={130} color="#ffffff22" strokeWidth={1.5} />
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>История</Text>
          {history.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Wallet size={28} color={COLORS.primary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyText}>Операций пока нет</Text>
            </View>
          ) : (
            history.map((p, i) => <HistoryRow key={p.id} item={p} index={i} />)
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
                <Pressable
                  key={q}
                  style={({ pressed }) => [styles.quickChip, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                  onPress={() => setAmount(String(q))}
                >
                  <Text style={styles.quickText}>{q} ₽</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalCancel, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                onPress={() => setTopupOpen(false)}
              >
                <Text style={styles.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalPay, paying && styles.modalPayDisabled, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                disabled={paying}
                onPress={handleTopup}
              >
                {paying ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPayText}>Оплатить</Text>}
              </Pressable>
            </View>
            {testMode && (
              <Pressable
                onPress={handleDevTopup}
                disabled={paying}
                style={({ pressed }) => [styles.devLink, { opacity: pressed ? 0.4 : 0.7 }]}
              >
                <Text style={styles.devLinkText}>тестовая оплата (dev)</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Perk({ text }: { text: string }) {
  return (
    <View style={styles.perkRow}>
      <View style={styles.perkCheck}>
        <Check size={11} color="#FFA000" strokeWidth={3} />
      </View>
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
}

function HistoryRow({ item, index }: { item: Payment; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, delay: index * 50, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 280, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  const isTopup = item.type === 'topup';
  const isRefund = item.type === 'refund';
  const Icon = isTopup ? TrendingUp : isRefund ? RotateCcw : TrendingDown;
  const color = isTopup ? COLORS.success : isRefund ? COLORS.warning : COLORS.error;
  const title = isTopup ? 'Пополнение' : item.type === 'commission' ? 'Комиссия за урок' : 'Возврат';

  return (
    <Animated.View style={[styles.historyItem, { opacity, transform: [{ translateY: ty }] }]}>
      <View style={[styles.icon, { backgroundColor: color + '15' }]}>
        <Icon size={16} color={color} />
      </View>
      <View style={styles.historyInfo}>
        <Text style={styles.historyTitle}>{title}</Text>
        <Text style={styles.historyDate}>{format(new Date(item.created_at), 'd MMMM, HH:mm', { locale: ruLocale })}</Text>
      </View>
      <Text style={[styles.historyAmount, { color }]}>
        {isTopup ? '+' : '−'}{(item.amount / 100).toLocaleString('ru')} ₽
      </Text>
    </Animated.View>
  );
}

const cardShadow = {
  shadowColor: '#0006',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 18, maxWidth: 720, alignSelf: 'center' as any, width: '100%' },
  header: { paddingHorizontal: 4, paddingTop: 8 },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },

  // Balance card
  balanceCard: {
    borderRadius: 22, padding: 22, gap: 6,
    overflow: 'hidden', position: 'relative',
    ...cardShadow,
  },
  balanceTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#ffffff22',
    justifyContent: 'center', alignItems: 'center',
  },
  balanceLabel: { fontSize: 14, color: '#ffffffdd', fontWeight: '700', letterSpacing: 0.3 },
  balanceValue: { fontSize: 42, fontWeight: '800', color: '#fff', letterSpacing: -1, marginTop: 6 },
  balanceHint: { fontSize: 12, color: '#ffffffcc', lineHeight: 17, marginTop: 6 },
  topupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 16, height: 50,
    backgroundColor: '#ffffff25', borderRadius: 14,
    borderWidth: 1, borderColor: '#ffffff40',
  },
  topupText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  balanceBgIcon: { position: 'absolute', right: -10, bottom: -20 },

  // PRO card (golden)
  proCard: {
    borderRadius: 22, padding: 22, gap: 8,
    overflow: 'hidden', position: 'relative',
    ...cardShadow,
  },
  proHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  proBadgeText: { color: '#FFA000', fontWeight: '900', fontSize: 12, letterSpacing: 0.8 },
  proUntilBadge: { backgroundColor: '#ffffff33', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  proStatus: { fontSize: 11, color: '#fff', fontWeight: '700' },
  proTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 6, letterSpacing: -0.3 },
  proPrice: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  perks: { gap: 8, marginTop: 10 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkCheck: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  perkText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  proBtn: {
    marginTop: 16, height: 50, borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  proBtnDisabled: { opacity: 0.6 },
  proBtnText: { color: '#FFA000', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  proHint: { fontSize: 11, color: '#ffffffcc', marginTop: 8, lineHeight: 16 },
  proBgIcon: { position: 'absolute', right: -20, top: -20 },

  section: { gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, paddingHorizontal: 4, letterSpacing: -0.4 },
  emptyCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 28, alignItems: 'center', gap: 10,
    ...cardShadow,
  },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },

  historyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    ...cardShadow,
  },
  icon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  historyInfo: { flex: 1, gap: 2 },
  historyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  historyDate: { fontSize: 12, color: COLORS.textSecondary },
  historyAmount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: COLORS.background, padding: 22, paddingBottom: Platform.OS === 'ios' ? 36 : 22,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 14,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  modalSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14, paddingHorizontal: 16 },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '800', color: COLORS.text, paddingVertical: 14, letterSpacing: -0.5 },
  amountCurrency: { fontSize: 20, color: COLORS.textSecondary, fontWeight: '700' },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickChip: { flex: 1, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12 },
  quickText: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: { flex: 1, height: 52, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14 },
  modalCancelText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '700' },
  modalPay: { flex: 1.5, height: 52, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 14, ...cardShadow },
  modalPayDisabled: { opacity: 0.5 },
  modalPayText: { fontSize: 15, color: '#fff', fontWeight: '800' },
  devLink: { alignSelf: 'center', paddingVertical: 8, marginTop: 4 },
  devLinkText: { fontSize: 11, color: COLORS.textSecondary, textDecorationLine: 'underline' },
});

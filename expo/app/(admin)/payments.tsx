import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';

export default function AdminPayments() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    let q = supabase.from('payments').select('*, tutor:tutor_profiles!tutor_id(name)').order('created_at', { ascending: false });
    if (filter) q = q.eq('type', filter);
    const { data } = await q.limit(200);
    setList(data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [filter]);

  const sum = list.reduce((acc, p) => p.type === 'commission' ? acc + p.amount : acc, 0);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Платежи и комиссии</Text>
        <Text style={s.sub}>Сумма комиссий: <Text style={{ fontWeight: '800', color: COLORS.text }}>{(sum / 100).toLocaleString('ru')} ₽</Text></Text>
        <View style={s.filters}>
          {[
            { k: null, l: 'Все' },
            { k: 'topup', l: 'Пополнения' },
            { k: 'commission', l: 'Комиссии' },
            { k: 'refund', l: 'Возвраты' },
          ].map(f => (
            <TouchableOpacity key={String(f.k)} style={[s.chip, filter === f.k && s.chipActive]} onPress={() => setFilter(f.k)}>
              <Text style={[s.chipText, filter === f.k && s.chipTextActive]}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/admin-user/${item.tutor_id}`)}>
              <View style={[s.icon, item.type === 'topup' ? s.iconUp : s.iconDown]}>
                {item.type === 'topup' ? <TrendingUp size={16} color={COLORS.success} /> : <TrendingDown size={16} color={COLORS.error} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{typeLabel(item.type)}</Text>
                <Text style={s.cardSub}>👨‍🏫 {item.tutor?.name || '—'}</Text>
                <Text style={s.cardDate}>{format(new Date(item.created_at), 'd MMMM, HH:mm', { locale: ru })}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.amount, { color: item.type === 'topup' ? COLORS.success : COLORS.error }]}>
                  {item.type === 'topup' ? '+' : '−'}{(item.amount / 100).toLocaleString('ru')} ₽
                </Text>
                <Text style={[s.cardStatus, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.dim}>Платежей нет</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

function typeLabel(t: string) { return t === 'topup' ? 'Пополнение' : t === 'commission' ? 'Комиссия за урок' : 'Возврат'; }
function statusLabel(s: string) { return s === 'completed' ? 'Зачислено' : s === 'pending' ? 'В обработке' : 'Не прошло'; }
function statusColor(s: string) { return s === 'completed' ? COLORS.success : s === 'pending' ? COLORS.warning : COLORS.error; }

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dim: { color: COLORS.textSecondary },
  header: { padding: 16, gap: 8 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary },
  filters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.white, borderRadius: 12, padding: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  iconUp: { backgroundColor: COLORS.success + '15' },
  iconDown: { backgroundColor: COLORS.error + '15' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cardDate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800' },
  cardStatus: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
});

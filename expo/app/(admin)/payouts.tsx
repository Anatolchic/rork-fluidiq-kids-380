import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator, RefreshControl, Pressable, Alert, Modal, TextInput, Platform } from 'react-native';
import { format } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { Clock, CheckCircle2, XCircle, Ban, X, Copy } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useResponsive } from '../../lib/responsive';

type Payout = {
  id: string;
  tutor_id: string;
  amount_kopecks: number;
  method: string;
  details: string;
  status: string;
  comment: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type Tab = 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';

export default function AdminPayouts() {
  const { contentMaxWidth } = useResponsive();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [tutorNames, setTutorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('pending');
  const [rejectOpen, setRejectOpen] = useState<Payout | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  useEffect(() => { load(); }, [tab]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('payouts').select('*').eq('status', tab).order('created_at', { ascending: false }).limit(100);
    const list = (data || []) as Payout[];
    setPayouts(list);
    const ids = Array.from(new Set(list.map(p => p.tutor_id)));
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('tutor_profiles').select('user_id, name').in('user_id', ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.user_id] = p.name; });
      setTutorNames(map);
    }
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [tab]);

  async function action(payoutId: string, act: 'approve' | 'pay', comment?: string) {
    const { data, error } = await supabase.rpc('admin_review_payout', { p_payout_id: payoutId, p_action: act, p_comment: comment ?? null });
    if (error) { Alert.alert('Ошибка', error.message); return; }
    if ((data as any)?.ok === false) { Alert.alert('Не удалось', (data as any).error); return; }
    load();
  }

  async function reject() {
    if (!rejectOpen) return;
    const { data, error } = await supabase.rpc('admin_review_payout', { p_payout_id: rejectOpen.id, p_action: 'reject', p_comment: rejectComment.trim() || null });
    if (error) { Alert.alert('Ошибка', error.message); return; }
    if ((data as any)?.ok === false) { Alert.alert('Не удалось', (data as any).error); return; }
    setRejectOpen(null);
    setRejectComment('');
    load();
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'pending', label: 'В обработке' },
    { key: 'approved', label: 'Одобрены' },
    { key: 'paid', label: 'Выплачены' },
    { key: 'rejected', label: 'Отклонены' },
    { key: 'cancelled', label: 'Отменены' },
  ];

  return (
    <SafeAreaView style={s.container}>
      <View style={[s.header, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}>
        <Text style={s.title}>Заявки на вывод</Text>
        <View style={s.tabsRow}>
          {tabs.map(t => (
            <Pressable key={t.key} onPress={() => setTab(t.key)}
              style={[s.tabChip, tab === t.key && s.tabChipActive]}>
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={payouts}
          keyExtractor={p => p.id}
          contentContainerStyle={[s.list, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<View style={s.empty}><Text style={s.dim}>Нет заявок в этой категории</Text></View>}
          renderItem={({ item }) => {
            const rub = (item.amount_kopecks / 100).toLocaleString('ru');
            const methodLabel = item.method === 'card' ? 'Карта' : item.method === 'sbp' ? 'СБП' : 'Реквизиты';
            const StatusIcon = item.status === 'pending' ? Clock : item.status === 'paid' ? CheckCircle2 : item.status === 'rejected' ? XCircle : item.status === 'cancelled' ? Ban : CheckCircle2;
            const statusColor = item.status === 'pending' ? COLORS.warning : item.status === 'paid' ? COLORS.success : item.status === 'rejected' ? COLORS.error : COLORS.textSecondary;
            return (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <View style={[s.statusIcon, { backgroundColor: statusColor + '20' }]}>
                    <StatusIcon size={18} color={statusColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.amount}>{rub} ₽</Text>
                    <Text style={s.tutorName}>{tutorNames[item.tutor_id] || '—'}</Text>
                  </View>
                  <Text style={s.date}>{format(new Date(item.created_at), 'd MMM, HH:mm', { locale: ruLocale })}</Text>
                </View>

                <View style={s.methodBox}>
                  <Text style={s.methodLabel}>{methodLabel}</Text>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.detailsText} numberOfLines={2} selectable>{item.details}</Text>
                    <Pressable
                      onPress={() => {
                        if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
                          (navigator as any).clipboard.writeText(item.details);
                          Alert.alert('Скопировано');
                        }
                      }}
                      hitSlop={6}
                    >
                      <Copy size={14} color={COLORS.textSecondary} />
                    </Pressable>
                  </View>
                </View>

                {item.comment && (
                  <Text style={s.comment}>Комментарий: {item.comment}</Text>
                )}

                {(item.status === 'pending' || item.status === 'approved') && (
                  <View style={s.actionsRow}>
                    {item.status === 'pending' && (
                      <Pressable onPress={() => action(item.id, 'approve')} style={[s.actionBtn, s.approveBtn]}>
                        <Text style={s.approveBtnText}>Одобрить</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => action(item.id, 'pay')} style={[s.actionBtn, s.payBtn]}>
                      <Text style={s.payBtnText}>Выплачено</Text>
                    </Pressable>
                    <Pressable onPress={() => setRejectOpen(item)} style={[s.actionBtn, s.rejectBtn]}>
                      <Text style={s.rejectBtnText}>Отклонить</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!rejectOpen} transparent animationType="slide" onRequestClose={() => setRejectOpen(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modal}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={s.modalTitle}>Отклонить заявку</Text>
              <Pressable onPress={() => setRejectOpen(null)} hitSlop={10}>
                <X size={22} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <Text style={s.modalSub}>Средства вернутся на баланс репетитора. Причину увидит только он.</Text>
            <TextInput
              style={s.commentInput}
              value={rejectComment}
              onChangeText={setRejectComment}
              placeholder="Например: неверные реквизиты"
              placeholderTextColor={COLORS.textSecondary}
              multiline
              maxLength={200}
            />
            <View style={s.modalActions}>
              <Pressable onPress={() => setRejectOpen(null)} style={s.modalCancel}>
                <Text style={s.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable onPress={reject} style={[s.modalConfirm, { backgroundColor: COLORS.error }]}>
                <Text style={s.modalConfirmText}>Отклонить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },

  tabsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tabChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  tabChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  tabTextActive: { color: '#fff', fontWeight: '700' },

  list: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  dim: { color: COLORS.textSecondary, fontSize: 14 },

  card: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  amount: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  tutorName: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  date: { fontSize: 11, color: COLORS.textSecondary },

  methodBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.background, borderRadius: 10, padding: 10 },
  methodLabel: { fontSize: 11, fontWeight: '700', color: COLORS.primary, backgroundColor: COLORS.primary + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  detailsText: { flex: 1, fontSize: 13, color: COLORS.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  comment: { fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' },

  actionsRow: { flexDirection: 'row', gap: 6 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  approveBtn: { backgroundColor: COLORS.warning + '20' },
  approveBtnText: { color: COLORS.warning, fontWeight: '700', fontSize: 13 },
  payBtn: { backgroundColor: COLORS.success + '20' },
  payBtnText: { color: COLORS.success, fontWeight: '700', fontSize: 13 },
  rejectBtn: { backgroundColor: COLORS.error + '20' },
  rejectBtnText: { color: COLORS.error, fontWeight: '700', fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  modalSub: { fontSize: 13, color: COLORS.textSecondary },
  commentInput: { backgroundColor: COLORS.background, borderRadius: 12, padding: 12, minHeight: 80, borderWidth: 1, borderColor: COLORS.border, fontSize: 14, color: COLORS.text, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
  modalConfirm: { flex: 1.3, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

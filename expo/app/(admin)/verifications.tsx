// Админ-экран модерации документов на верификацию.
// Показывает все cert со status='pending', даёт одобрить/отклонить.
// Имена репетиторов подгружаются отдельным запросом (FK на auth.users, embed невозможен).

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView,
  ActivityIndicator, RefreshControl, Image, Modal, TextInput, Alert, Dimensions, Platform,
} from 'react-native';
import { format } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { X, Check, AlertCircle } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { ru } from '../../lib/errors';
import { useResponsive } from '../../lib/responsive';

type Cert = {
  id: string;
  tutor_id: string;
  kind: 'passport' | 'diploma' | 'certificate' | 'other';
  title: string | null;
  file_url: string;
  status: string;
  created_at: string;
  tutor_name?: string | null;
  tutor_photo?: string | null;
};

const KIND_LABELS: Record<string, string> = {
  passport: 'Паспорт',
  diploma: 'Диплом',
  certificate: 'Сертификат',
  other: 'Другое',
};

export default function AdminVerifications() {
  const { contentMaxWidth } = useResponsive();
  const [list, setList] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Reject modal
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    try {
      let q = supabase.from('tutor_certifications').select('*').order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      const certs = (data as Cert[]) || [];
      // Подгрузим имена репетиторов отдельно (FK на auth.users — embed не работает)
      if (certs.length > 0) {
        const tutorIds = [...new Set(certs.map(c => c.tutor_id))];
        const { data: profs } = await supabase.from('tutor_profiles').select('user_id, name, photo_url').in('user_id', tutorIds);
        const map: Record<string, { name: string | null; photo_url: string | null }> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = { name: p.name, photo_url: p.photo_url }; });
        certs.forEach(c => { c.tutor_name = map[c.tutor_id]?.name || null; c.tutor_photo = map[c.tutor_id]?.photo_url || null; });
      }
      setList(certs);
    } catch (e: any) {
      console.warn('[verifications load]', e);
      Alert.alert('Ошибка', ru(e));
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [filter]);

  async function approve(id: string) {
    setBusy(id);
    try {
      const { error } = await supabase.rpc('admin_review_certification', { p_cert_id: id, p_approve: true, p_reason: null });
      if (error) throw error;
      await load();
    } catch (e: any) {
      Alert.alert('Ошибка', ru(e));
    } finally {
      setBusy(null);
    }
  }

  function openReject(id: string) {
    setRejectId(id);
    setRejectReason('');
  }

  async function confirmReject() {
    if (!rejectId) return;
    if (!rejectReason.trim()) { Alert.alert('Укажите причину отклонения'); return; }
    setBusy(rejectId);
    try {
      const { error } = await supabase.rpc('admin_review_certification', { p_cert_id: rejectId, p_approve: false, p_reason: rejectReason.trim() });
      if (error) throw error;
      setRejectId(null);
      setRejectReason('');
      await load();
    } catch (e: any) {
      Alert.alert('Ошибка', ru(e));
    } finally {
      setBusy(null);
    }
  }

  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;
  const viewerSize = Math.min(screenW - 32, screenH - 200);

  return (
    <SafeAreaView style={s.container}>
      <View style={[s.header, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
        <Text style={s.title}>Документы на проверку</Text>
        <View style={s.filters}>
          {[
            { k: 'pending' as const, l: 'На проверке' },
            { k: 'approved' as const, l: 'Одобренные' },
            { k: 'rejected' as const, l: 'Отклонённые' },
            { k: 'all' as const, l: 'Все' },
          ].map(f => (
            <TouchableOpacity key={f.k} style={[s.chip, filter === f.k && s.chipActive]} onPress={() => setFilter(f.k)}>
              <Text style={[s.chipText, filter === f.k && s.chipTextActive]}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={[s.list, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <TouchableOpacity onPress={() => setViewerUrl(item.file_url)}>
                <Image source={{ uri: item.file_url }} style={s.docImage} />
              </TouchableOpacity>
              <View style={s.cardBody}>
                <View style={s.cardTop}>
                  <Text style={s.kindBadge}>{KIND_LABELS[item.kind] || item.kind}</Text>
                  <Text style={s.dateText}>{format(new Date(item.created_at), 'd MMM HH:mm', { locale: ruLocale })}</Text>
                </View>
                <Text style={s.docTitle}>{item.title || KIND_LABELS[item.kind]}</Text>
                <Text style={s.tutorName}>{item.tutor_name || '(без имени)'}</Text>

                {item.status === 'pending' ? (
                  <View style={s.actions}>
                    <TouchableOpacity
                      style={[s.actionBtn, s.approveBtn, busy === item.id && s.btnDisabled]}
                      disabled={busy === item.id}
                      onPress={() => approve(item.id)}
                    >
                      {busy === item.id ? <ActivityIndicator color="#fff" size="small" /> : <Check size={16} color="#fff" />}
                      <Text style={s.actionText}>Одобрить</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, s.rejectBtn, busy === item.id && s.btnDisabled]}
                      disabled={busy === item.id}
                      onPress={() => openReject(item.id)}
                    >
                      <X size={16} color="#fff" />
                      <Text style={s.actionText}>Отклонить</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[s.statusPill, { backgroundColor: (item.status === 'approved' ? COLORS.success : COLORS.error) + '20' }]}>
                    {item.status === 'approved' ? (
                      <Check size={12} color={COLORS.success} />
                    ) : (
                      <AlertCircle size={12} color={COLORS.error} />
                    )}
                    <Text style={[s.statusText, { color: item.status === 'approved' ? COLORS.success : COLORS.error }]}>
                      {item.status === 'approved' ? 'Одобрен' : 'Отклонён'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.dim}>{filter === 'pending' ? 'Нет документов на проверке' : 'Пусто'}</Text>
            </View>
          }
        />
      )}

      {/* Image viewer */}
      <Modal visible={!!viewerUrl} animationType="fade" transparent onRequestClose={() => setViewerUrl(null)}>
        <TouchableOpacity style={s.viewerBg} activeOpacity={1} onPress={() => setViewerUrl(null)}>
          {viewerUrl && (
            <Image source={{ uri: viewerUrl }} style={{ width: viewerSize, height: viewerSize, borderRadius: 16 }} resizeMode="contain" />
          )}
          <TouchableOpacity style={s.viewerClose} onPress={() => setViewerUrl(null)}>
            <X size={28} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Reject modal */}
      <Modal visible={!!rejectId} animationType="slide" transparent onRequestClose={() => setRejectId(null)}>
        <View style={s.rejectBg}>
          <View style={s.rejectCard}>
            <View style={s.rejectHeader}>
              <Text style={s.rejectTitle}>Причина отклонения</Text>
              <TouchableOpacity onPress={() => setRejectId(null)}>
                <X size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Опишите что не так с документом"
              placeholderTextColor={COLORS.textSecondary}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[s.actionBtn, s.rejectBtn, { marginTop: 12 }, busy && s.btnDisabled]}
              disabled={!!busy}
              onPress={confirmReject}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <X size={16} color="#fff" />}
              <Text style={s.actionText}>Отклонить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dim: { color: COLORS.textSecondary },
  header: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  filters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, gap: 10 },
  card: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 12, padding: 12, gap: 12 },
  docImage: { width: 96, height: 96, borderRadius: 8, backgroundColor: COLORS.primaryLight },
  cardBody: { flex: 1, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kindBadge: { fontSize: 11, color: COLORS.primary, fontWeight: '700', textTransform: 'uppercase' },
  dateText: { fontSize: 11, color: COLORS.textSecondary },
  docTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  tutorName: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8 },
  approveBtn: { backgroundColor: COLORS.success },
  rejectBtn: { backgroundColor: COLORS.error },
  btnDisabled: { opacity: 0.5 },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  empty: { padding: 40, alignItems: 'center' },
  viewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  viewerClose: { position: 'absolute', top: 50, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff20', justifyContent: 'center', alignItems: 'center' },
  rejectBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  rejectCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16 },
  rejectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  rejectTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  rejectInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.text, minHeight: 80, textAlignVertical: 'top', backgroundColor: COLORS.background },
});

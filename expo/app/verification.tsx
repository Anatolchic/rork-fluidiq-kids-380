// Экран верификации репетитора:
// - Список своих документов (tutor_certifications)
// - Загрузка новых документов (image picker + upload в bucket 'avatars' под путь verification/)
// - Отправка драфтов на проверку (RPC request_verification списывает с баланса)
//
// Статусы:
//   draft     — черновик, можно удалить, можно отправить на проверку
//   pending   — на проверке у модератора
//   approved  — одобрен (✓)
//   rejected  — отклонён, видно причину

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  ActivityIndicator, TextInput, Alert, Modal, Image, Platform, Dimensions, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { ArrowLeft, Plus, Camera, X, Check, Clock, AlertCircle, Trash2, ShieldCheck } from 'lucide-react-native';
import supabase from '../lib/supabase';
import { COLORS } from '../lib/constants';
import { ru } from '../lib/errors';
import { useAuthStore } from '../stores/auth';
import { useResponsive } from '../lib/responsive';

type Cert = {
  id: string;
  tutor_id: string;
  kind: 'passport' | 'diploma' | 'certificate' | 'other';
  title: string | null;
  file_url: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  reviewed_at: string | null;
  paid: boolean;
  created_at: string;
};

const KIND_LABELS: Record<Cert['kind'], string> = {
  passport: 'Паспорт',
  diploma: 'Диплом',
  certificate: 'Сертификат',
  other: 'Другое',
};

const STATUS_LABELS: Record<Cert['status'], string> = {
  draft: 'Черновик',
  pending: 'На проверке',
  approved: 'Одобрен',
  rejected: 'Отклонён',
};

function statusColor(s: Cert['status']) {
  switch (s) {
    case 'approved': return COLORS.success;
    case 'rejected': return COLORS.error;
    case 'pending':  return COLORS.warning;
    default:         return COLORS.textSecondary;
  }
}

export default function VerificationScreen() {
  const { session, profile } = useAuthStore();
  const { contentMaxWidth } = useResponsive();

  const [certs, setCerts] = useState<Cert[]>([]);
  const [isVerified, setIsVerified] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [priceKopecks, setPriceKopecks] = useState<number>(50000);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modal: добавление документа
  const [addOpen, setAddOpen] = useState(false);
  const [newKind, setNewKind] = useState<Cert['kind']>('passport');
  const [newTitle, setNewTitle] = useState('');
  const [newFileUrl, setNewFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Viewer
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!session) { router.replace('/(auth)/login'); return; }
    load();
  }, [session]);

  async function load() {
    if (!session) return;
    setLoading(true);
    try {
      const [certsRes, profRes, settingsRes] = await Promise.all([
        supabase.from('tutor_certifications').select('*').eq('tutor_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('tutor_profiles').select('is_verified, verified_at, balance').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('app_settings').select('verification_price_kopecks').limit(1).maybeSingle(),
      ]);
      setCerts((certsRes.data as Cert[]) || []);
      setIsVerified(!!profRes.data?.is_verified);
      setVerifiedAt(profRes.data?.verified_at || null);
      setBalance(profRes.data?.balance ?? 0);
      setPriceKopecks(settingsRes.data?.verification_price_kopecks ?? 50000);
    } catch (e: any) {
      console.warn('[verification load]', e);
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [session]);

  function openAdd() {
    setNewKind('passport');
    setNewTitle('');
    setNewFileUrl(null);
    setAddOpen(true);
  }

  async function pickImage() {
    if (!session) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Нет доступа к фото'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) return;

    setUploading(true);
    try {
      const asset = res.assets[0];
      const uri = asset.uri;
      const extGuess = (uri.split('.').pop() || asset.fileName?.split('.').pop() || 'jpg').toLowerCase().replace(/^jpeg$/, 'jpg');
      const ext = ['jpg', 'png', 'webp'].includes(extGuess) ? extGuess : 'jpg';
      const filename = `verification/${session.user.id}/${Date.now()}.${ext}`;
      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      let body: any;
      if (Platform.OS === 'web') {
        body = await (await fetch(uri)).blob();
      } else {
        const fd = new FormData();
        fd.append('file', { uri, name: `doc.${ext}`, type: contentType } as any);
        body = fd;
      }
      const { error } = await supabase.storage.from('avatars').upload(filename, body, { contentType, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(filename);
      setNewFileUrl(data.publicUrl);
    } catch (e: any) {
      Alert.alert('Не удалось загрузить', ru(e));
    } finally {
      setUploading(false);
    }
  }

  async function saveDoc() {
    if (!session) return;
    if (!newFileUrl) { Alert.alert('Добавьте фото документа'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('tutor_certifications').insert({
        tutor_id: session.user.id,
        kind: newKind,
        title: newTitle.trim() || KIND_LABELS[newKind],
        file_url: newFileUrl,
        status: 'draft',
      });
      if (error) throw error;
      setAddOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert('Ошибка', ru(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft(id: string) {
    Alert.alert('Удалить документ?', '', [
      { text: 'Отмена' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('tutor_certifications').delete().eq('id', id);
          if (error) { Alert.alert('Ошибка', ru(error)); return; }
          await load();
        },
      },
    ]);
  }

  async function submitForReview() {
    const drafts = certs.filter(c => c.status === 'draft');
    if (drafts.length === 0) { Alert.alert('Нет черновиков'); return; }
    const priceR = priceKopecks / 100;
    Alert.alert(
      'Отправить на проверку?',
      `С баланса будет списано ${priceR.toLocaleString('ru')} ₽. Документов: ${drafts.length}.`,
      [
        { text: 'Отмена' },
        {
          text: 'Отправить', onPress: async () => {
            setSubmitting(true);
            try {
              const { data, error } = await supabase.rpc('request_verification', { p_cert_ids: drafts.map(d => d.id) });
              if (error) throw error;
              if (data && data.ok === false) { Alert.alert('Не удалось', data.error || 'Ошибка'); return; }
              Alert.alert('Готово', 'Документы отправлены модератору, ожидайте.');
              await load();
            } catch (e: any) {
              Alert.alert('Ошибка', ru(e));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  const drafts = certs.filter(c => c.status === 'draft');
  const priceR = priceKopecks / 100;
  const balanceR = balance / 100;
  const enoughBalance = balance >= priceKopecks;

  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;
  const viewerSize = Math.min(screenW - 32, screenH - 200);

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Верификация</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Главный бейдж */}
        {isVerified ? (
          <View style={[s.card, s.verifiedCard]}>
            <ShieldCheck size={32} color={COLORS.success} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.verifiedTitle}>Профиль верифицирован</Text>
              {verifiedAt && (
                <Text style={s.verifiedDate}>с {format(new Date(verifiedAt), 'd MMMM yyyy', { locale: ruLocale })}</Text>
              )}
            </View>
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.title}>Как это работает</Text>
            <Text style={s.par}>1. Загрузите фото паспорта, диплома и других документов.</Text>
            <Text style={s.par}>2. Нажмите «Отправить на проверку» — с баланса спишется {priceR.toLocaleString('ru')} ₽.</Text>
            <Text style={s.par}>3. Модератор проверит документы в течение 1–2 рабочих дней.</Text>
            <Text style={s.par}>4. После одобрения вы получите бейдж «Верифицирован» в каталоге.</Text>

            <View style={s.balanceRow}>
              <Text style={s.balanceLabel}>Баланс кошелька:</Text>
              <Text style={[s.balanceVal, !enoughBalance && { color: COLORS.error }]}>{balanceR.toLocaleString('ru')} ₽</Text>
            </View>
            {!enoughBalance && (
              <Text style={s.warning}>Недостаточно средств для подачи на верификацию.</Text>
            )}
          </View>
        )}

        {/* Список документов */}
        <View style={s.cardHeader}>
          <Text style={s.sectionTitle}>Документы</Text>
          <TouchableOpacity style={s.addBtn} onPress={openAdd}>
            <Plus size={16} color="#fff" />
            <Text style={s.addBtnText}>Добавить</Text>
          </TouchableOpacity>
        </View>

        {certs.length === 0 ? (
          <View style={[s.card, { alignItems: 'center', paddingVertical: 32 }]}>
            <Text style={s.dim}>Документов пока нет</Text>
          </View>
        ) : (
          certs.map(c => (
            <View key={c.id} style={s.docCard}>
              <TouchableOpacity onPress={() => setViewerUrl(c.file_url)}>
                <Image source={{ uri: c.file_url }} style={s.docImage} />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.docTitle}>{c.title || KIND_LABELS[c.kind]}</Text>
                <Text style={s.docKind}>{KIND_LABELS[c.kind]}</Text>
                <View style={[s.statusPill, { backgroundColor: statusColor(c.status) + '20' }]}>
                  {c.status === 'approved' && <Check size={12} color={statusColor(c.status)} />}
                  {c.status === 'pending' && <Clock size={12} color={statusColor(c.status)} />}
                  {c.status === 'rejected' && <AlertCircle size={12} color={statusColor(c.status)} />}
                  <Text style={[s.statusText, { color: statusColor(c.status) }]}>{STATUS_LABELS[c.status]}</Text>
                </View>
                {c.status === 'rejected' && c.rejection_reason && (
                  <Text style={s.rejection}>Причина: {c.rejection_reason}</Text>
                )}
                <Text style={s.docDate}>{format(new Date(c.created_at), 'd MMM yyyy', { locale: ruLocale })}</Text>
              </View>
              {c.status === 'draft' && (
                <TouchableOpacity onPress={() => deleteDraft(c.id)} style={s.deleteBtn}>
                  <Trash2 size={18} color={COLORS.error} />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        {drafts.length > 0 && (
          <TouchableOpacity
            style={[s.submitBtn, (submitting || !enoughBalance) && s.submitBtnDisabled]}
            disabled={submitting || !enoughBalance}
            onPress={submitForReview}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.submitBtnText}>
                Отправить на проверку ({drafts.length}) · {priceR.toLocaleString('ru')} ₽
              </Text>
            )}
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal: добавить документ */}
      <Modal visible={addOpen} animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <SafeAreaView style={s.container}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Новый документ</Text>
            <TouchableOpacity onPress={() => setAddOpen(false)}>
              <X size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalScroll}>
            <Text style={s.label}>Тип документа</Text>
            <View style={s.kindRow}>
              {(['passport', 'diploma', 'certificate', 'other'] as Cert['kind'][]).map(k => (
                <TouchableOpacity
                  key={k}
                  style={[s.kindBtn, newKind === k && s.kindBtnActive]}
                  onPress={() => setNewKind(k)}
                >
                  <Text style={[s.kindText, newKind === k && s.kindTextActive]}>{KIND_LABELS[k]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Название (необязательно)</Text>
            <TextInput
              style={s.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={KIND_LABELS[newKind]}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={s.label}>Фото документа</Text>
            {newFileUrl ? (
              <TouchableOpacity onPress={pickImage} style={s.previewWrap}>
                <Image source={{ uri: newFileUrl }} style={s.preview} resizeMode="cover" />
                <View style={s.previewOverlay}>
                  <Camera size={18} color="#fff" />
                  <Text style={s.previewText}>Заменить</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.uploadBox} onPress={pickImage} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <>
                    <Camera size={28} color={COLORS.primary} />
                    <Text style={s.uploadText}>Выбрать фото</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.saveBtn, (saving || !newFileUrl) && s.submitBtnDisabled]}
              disabled={saving || !newFileUrl}
              onPress={saveDoc}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Сохранить</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.white },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 6 },
  verifiedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.success + '15', borderWidth: 1, borderColor: COLORS.success + '40' },
  verifiedTitle: { fontSize: 16, fontWeight: '700', color: COLORS.success },
  verifiedDate: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  par: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  balanceLabel: { fontSize: 13, color: COLORS.textSecondary },
  balanceVal: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  warning: { fontSize: 12, color: COLORS.error, marginTop: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.primary },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  docCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, padding: 12 },
  docImage: { width: 72, height: 72, borderRadius: 8, backgroundColor: COLORS.primaryLight },
  docTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  docKind: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  rejection: { fontSize: 11, color: COLORS.error, marginTop: 4 },
  docDate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
  deleteBtn: { padding: 8 },
  dim: { color: COLORS.textSecondary, fontSize: 13 },
  submitBtn: { height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalScroll: { padding: 16, gap: 10, paddingBottom: 32 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 8 },
  kindRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  kindBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  kindBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  kindText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  kindTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white },
  uploadBox: { height: 180, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center', gap: 8 },
  uploadText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  previewWrap: { position: 'relative', height: 220, borderRadius: 12, overflow: 'hidden' },
  preview: { width: '100%', height: '100%', backgroundColor: COLORS.primaryLight },
  previewOverlay: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)' },
  previewText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  saveBtn: { height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Viewer
  viewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  viewerClose: { position: 'absolute', top: 50, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff20', justifyContent: 'center', alignItems: 'center' },
});

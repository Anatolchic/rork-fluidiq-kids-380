import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, SafeAreaView, ActivityIndicator, Alert, Modal, ScrollView, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Plus, MessageCircle, X } from 'lucide-react-native';
import supabase from '../lib/supabase';
import { COLORS } from '../lib/constants';
import { useAuthStore } from '../stores/auth';
import { useResponsive } from '../lib/responsive';

export default function SupportScreen() {
  const { session } = useAuthStore();
  const { contentMaxWidth } = useResponsive();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [openTicket, setOpenTicket] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [reply, setReply] = useState('');

  useEffect(() => { if (session) load(); }, [session]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('support_tickets').select('*').eq('user_id', session!.user.id).order('updated_at', { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [session]);

  async function create() {
    if (!subject.trim() || !body.trim()) { Alert.alert('Заполните тему и текст'); return; }
    setSaving(true);
    const { error } = await supabase.from('support_tickets').insert({
      user_id: session!.user.id, subject: subject.trim(), body: body.trim(), status: 'open',
    });
    setSaving(false);
    if (error) { Alert.alert('Не отправлено', error.message); return; }
    setSubject(''); setBody(''); setCreateOpen(false); load();
  }

  async function openDetails(t: any) {
    setOpenTicket(t);
    const { data } = await supabase.from('ticket_replies').select('*').eq('ticket_id', t.id).order('created_at');
    setReplies(data || []);
  }

  async function sendReply() {
    if (!reply.trim() || !openTicket) return;
    const { error } = await supabase.from('ticket_replies').insert({
      ticket_id: openTicket.id, sender_id: session!.user.id, body: reply.trim(), is_admin_reply: false,
    });
    if (error) { Alert.alert('Ошибка', error.message); return; }
    setReply('');
    openDetails(openTicket);
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={[s.header, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}>
        <Text style={s.title}>Поддержка</Text>
        <Text style={s.sub}>Напишите если что-то не работает или есть вопрос</Text>
      </View>

      {loading ? (
        <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={i => i.id}
          contentContainerStyle={[s.list, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>💬</Text>
              <Text style={s.emptyText}>Обращений пока нет</Text>
              <Text style={s.emptySub}>Создайте новое — мы ответим в течение суток</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => openDetails(item)}>
              <View style={s.cardTop}>
                <Text style={s.cardSubject}>{item.subject}</Text>
                <View style={[s.pill, { backgroundColor: statusColor(item.status) + '20' }]}>
                  <Text style={[s.pillText, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
                </View>
              </View>
              <Text style={s.cardBody} numberOfLines={2}>{item.body}</Text>
              <Text style={s.cardDate}>{format(new Date(item.updated_at), 'd MMMM, HH:mm', { locale: ru })}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={s.fab} onPress={() => setCreateOpen(true)}>
        <Plus size={22} color="#fff" />
      </TouchableOpacity>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Новое обращение</Text>
              <TouchableOpacity onPress={() => setCreateOpen(false)}><X size={20} color={COLORS.text} /></TouchableOpacity>
            </View>
            <TextInput style={s.input} value={subject} onChangeText={setSubject} placeholder="Тема" placeholderTextColor={COLORS.textSecondary} />
            <TextInput style={[s.input, s.textarea]} value={body} onChangeText={setBody} placeholder="Опишите ситуацию подробно" placeholderTextColor={COLORS.textSecondary} multiline maxLength={2000} />
            <TouchableOpacity style={[s.btn, (!subject.trim() || !body.trim() || saving) && { opacity: 0.4 }]} disabled={!subject.trim() || !body.trim() || saving} onPress={create}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Отправить</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!openTicket} animationType="slide" onRequestClose={() => setOpenTicket(null)}>
        <SafeAreaView style={s.container}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{openTicket?.subject}</Text>
            <TouchableOpacity onPress={() => setOpenTicket(null)}><X size={22} color={COLORS.text} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 10 }}>
            <View style={s.msgUser}><Text style={s.msgText}>{openTicket?.body}</Text></View>
            {replies.map(r => (
              <View key={r.id} style={r.is_admin_reply ? s.msgAdmin : s.msgUser}>
                <Text style={s.msgAuthor}>{r.is_admin_reply ? 'Поддержка' : 'Вы'}</Text>
                <Text style={s.msgText}>{r.body}</Text>
                <Text style={s.msgTime}>{format(new Date(r.created_at), 'd MMMM, HH:mm', { locale: ru })}</Text>
              </View>
            ))}
          </ScrollView>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.replyBar}>
              <TextInput style={s.replyInput} value={reply} onChangeText={setReply} placeholder="Ответ" placeholderTextColor={COLORS.textSecondary} multiline />
              <TouchableOpacity style={s.replySend} onPress={sendReply}>
                <MessageCircle size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function statusLabel(s: string) { return s === 'open' ? 'Открыто' : s === 'in_progress' ? 'В работе' : 'Закрыто'; }
function statusColor(s: string) { return s === 'open' ? COLORS.warning : s === 'in_progress' ? COLORS.primary : COLORS.textSecondary; }

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 14, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSubject: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '600' },
  cardBody: { fontSize: 13, color: COLORS.textSecondary },
  cardDate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
  empty: { alignItems: 'center', padding: 60, gap: 6 },
  emptyEmoji: { fontSize: 48 }, emptyText: { fontSize: 16, fontWeight: '600', color: COLORS.text }, emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 30, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' },
  modal: { backgroundColor: COLORS.background, padding: 20, paddingBottom: 32, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1 },
  input: { backgroundColor: COLORS.white, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  textarea: { minHeight: 120, textAlignVertical: 'top' },
  btn: { height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  msgUser: { backgroundColor: COLORS.white, padding: 12, borderRadius: 12, alignSelf: 'flex-end', maxWidth: '85%' },
  msgAdmin: { backgroundColor: COLORS.primaryLight, padding: 12, borderRadius: 12, alignSelf: 'flex-start', maxWidth: '85%' },
  msgAuthor: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  msgText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  msgTime: { fontSize: 10, color: COLORS.textSecondary, marginTop: 4 },
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  replyInput: { flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: COLORS.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 },
  replySend: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
});

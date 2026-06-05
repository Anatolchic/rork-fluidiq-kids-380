import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { X, Send } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';
import { useResponsive } from '../../lib/responsive';

export default function AdminTickets() {
  const { session } = useAuthStore();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>('open');
  const [open, setOpen] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [reply, setReply] = useState('');
  const { contentMaxWidth } = useResponsive();

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_tickets', { p_status: filter, p_limit: 200, p_offset: 0 });
    setList(data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [filter]);

  async function openTicket(t: any) {
    setOpen(t);
    const { data } = await supabase.from('ticket_replies').select('*').eq('ticket_id', t.id).order('created_at');
    setReplies(data || []);
  }

  async function sendReply() {
    if (!reply.trim() || !open) return;
    const { error } = await supabase.from('ticket_replies').insert({
      ticket_id: open.id, sender_id: session!.user.id, body: reply.trim(), is_admin_reply: true,
    });
    if (error) { Alert.alert('Ошибка', error.message); return; }
    setReply('');
    openTicket(open);
    load();
  }

  async function setStatus(status: string) {
    if (!open) return;
    await supabase.from('support_tickets').update({ status }).eq('id', open.id);
    setOpen({ ...open, status });
    load();
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={[s.header, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}>
        <Text style={s.title}>Обращения</Text>
        <View style={s.filters}>
          {[
            { k: 'open', l: 'Открытые' },
            { k: 'in_progress', l: 'В работе' },
            { k: 'closed', l: 'Закрытые' },
            { k: null, l: 'Все' },
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
          contentContainerStyle={[s.list, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => openTicket(item)}>
              <View style={s.cardTop}>
                <Text style={s.cardSubject}>{item.subject}</Text>
                <View style={[s.pill, { backgroundColor: statusColor(item.status) + '20' }]}>
                  <Text style={[s.pillText, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => router.push(`/admin-user/${item.user_id}`)}>
                <Text style={s.link}>👤 {item.user_name || item.user_email}</Text>
              </TouchableOpacity>
              <Text style={s.body} numberOfLines={2}>{item.body}</Text>
              <View style={s.metaRow}>
                <Text style={s.meta}>{format(new Date(item.updated_at), 'd MMM HH:mm', { locale: ru })}</Text>
                {item.replies_count > 0 && <Text style={s.meta}>· {item.replies_count} отв.</Text>}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.dim}>Нет обращений</Text></View>}
        />
      )}

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        <SafeAreaView style={s.container}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle} numberOfLines={1}>{open?.subject}</Text>
            <TouchableOpacity onPress={() => setOpen(null)}><X size={22} color={COLORS.text} /></TouchableOpacity>
          </View>
          <View style={s.modalSub}>
            <TouchableOpacity onPress={() => { setOpen(null); router.push(`/admin-user/${open?.user_id}`); }}>
              <Text style={s.link}>👤 {open?.user_name || open?.user_email}</Text>
            </TouchableOpacity>
            <View style={s.statusActions}>
              {['open', 'in_progress', 'closed'].map(st => (
                <TouchableOpacity key={st} style={[s.statusBtn, open?.status === st && { backgroundColor: statusColor(st) }]} onPress={() => setStatus(st)}>
                  <Text style={[s.statusBtnText, open?.status === st && { color: '#fff' }]}>{statusLabel(st)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 10 }}>
            <View style={s.msgUser}><Text style={s.msgText}>{open?.body}</Text></View>
            {replies.map(r => (
              <View key={r.id} style={r.is_admin_reply ? s.msgAdmin : s.msgUser}>
                <Text style={s.msgAuthor}>{r.is_admin_reply ? 'Поддержка' : 'Пользователь'}</Text>
                <Text style={s.msgText}>{r.body}</Text>
                <Text style={s.msgTime}>{format(new Date(r.created_at), 'd MMM HH:mm', { locale: ru })}</Text>
              </View>
            ))}
          </ScrollView>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.replyBar}>
              <TextInput style={s.replyInput} value={reply} onChangeText={setReply} placeholder="Ответ" placeholderTextColor={COLORS.textSecondary} multiline />
              <TouchableOpacity style={s.replySend} onPress={sendReply}>
                <Send size={18} color="#fff" />
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
  dim: { color: COLORS.textSecondary },
  header: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  filters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 12, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSubject: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '700' },
  link: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  body: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  meta: { fontSize: 11, color: COLORS.textSecondary },
  empty: { padding: 40, alignItems: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1 },
  modalSub: { padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  statusActions: { flexDirection: 'row', gap: 6 },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  statusBtnText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  msgUser: { backgroundColor: COLORS.white, padding: 12, borderRadius: 12, alignSelf: 'flex-end', maxWidth: '85%' },
  msgAdmin: { backgroundColor: COLORS.primaryLight, padding: 12, borderRadius: 12, alignSelf: 'flex-start', maxWidth: '85%' },
  msgAuthor: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  msgText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  msgTime: { fontSize: 10, color: COLORS.textSecondary, marginTop: 4 },
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  replyInput: { flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: COLORS.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 },
  replySend: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
});

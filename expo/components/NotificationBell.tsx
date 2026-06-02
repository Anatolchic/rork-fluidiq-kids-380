import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, SafeAreaView, Platform } from 'react-native';
import { router } from 'expo-router';
import { format, formatDistanceToNow } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { Bell, CheckCheck, X } from 'lucide-react-native';
import supabase from '../lib/supabase';
import { COLORS } from '../lib/constants';
import { useAuthStore } from '../stores/auth';

type N = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationBell() {
  const { session } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!session) return;
    load();
    const ch = supabase.channel(`notif:${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` },
        payload => { setItems(prev => [payload.new as N, ...prev]); setUnread(u => u + 1); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session?.user.id]);

  async function load() {
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
    setItems((data || []) as N[]);
    setUnread(((data || []) as N[]).filter(x => !x.read_at).length);
  }

  async function markAll() {
    await supabase.rpc('mark_all_notifications_read');
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
    setUnread(0);
  }

  async function openItem(n: N) {
    if (!n.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      setUnread(u => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link as any);
  }

  return (
    <>
      <TouchableOpacity style={s.btn} onPress={() => setOpen(true)}>
        <Bell size={22} color={COLORS.text} />
        {unread > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} transparent={false}>
        <SafeAreaView style={s.modal}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setOpen(false)} style={s.closeBtn}>
              <X size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={s.title}>Уведомления</Text>
            {unread > 0 && (
              <TouchableOpacity onPress={markAll} style={s.readAllBtn}>
                <CheckCheck size={16} color={COLORS.primary} />
                <Text style={s.readAllText}>Прочитать всё</Text>
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={items}
            keyExtractor={n => n.id}
            contentContainerStyle={s.list}
            renderItem={({ item }) => (
              <TouchableOpacity style={[s.item, !item.read_at && s.itemUnread]} onPress={() => openItem(item)}>
                {!item.read_at && <View style={s.dot} />}
                <View style={{ flex: 1 }}>
                  <Text style={s.itemTitle}>{item.title}</Text>
                  {item.body && <Text style={s.itemBody} numberOfLines={2}>{item.body}</Text>}
                  <Text style={s.itemTime}>{formatDistanceToNow(new Date(item.created_at), { locale: ruLocale, addSuffix: true })}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>🔔</Text>
                <Text style={s.emptyText}>Пока нет уведомлений</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  btn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: COLORS.error, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  modal: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  closeBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1 },
  readAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  readAllText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  list: { padding: 12, gap: 8 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, backgroundColor: COLORS.white, borderRadius: 12 },
  itemUnread: { backgroundColor: COLORS.primaryLight },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginTop: 6 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  itemBody: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  itemTime: { fontSize: 10, color: COLORS.textSecondary, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
});

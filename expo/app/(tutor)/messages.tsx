import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Image,
  RefreshControl,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { MessageCircle, User } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';
import { useResponsive } from '../../lib/responsive';
import { loadDirectChatsForTutor, DirectChatRow } from '../../lib/direct-chats';

type ChatItem = DirectChatRow & {
  partner_name: string;
  partner_photo: string | null;
};

export default function TutorMessagesScreen() {
  const { session } = useAuthStore();
  const { contentMaxWidth } = useResponsive();

  const [items, setItems] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!session) return;
    load();

    const channel = supabase
      .channel(`tutor_direct_chats:${session.user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_chats', filter: `tutor_id=eq.${session.user.id}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user.id]);

  async function load() {
    if (!session) return;
    const { data, error } = await loadDirectChatsForTutor(session.user.id);
    if (error || !data) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const rows = data as DirectChatRow[];
    if (rows.length === 0) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const studentIds = [...new Set(rows.map((r) => r.student_id))];
    const { data: students } = await supabase
      .from('student_profiles')
      .select('user_id, name, photo_url')
      .in('user_id', studentIds);
    const sMap: Record<string, { name: string; photo_url: string | null }> = {};
    (students || []).forEach((s: any) => {
      sMap[s.user_id] = { name: s.name, photo_url: s.photo_url };
    });
    const enriched: ChatItem[] = rows.map((r) => ({
      ...r,
      partner_name: sMap[r.student_id]?.name || 'Ученик',
      partner_photo: sMap[r.student_id]?.photo_url || null,
    }));
    setItems(enriched);
    setLoading(false);
    setRefreshing(false);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [session?.user.id]);

  const renderItem = useCallback(
    ({ item }: { item: ChatItem }) => {
      const unread = item.tutor_unread > 0;
      return (
        <Pressable
          onPress={() => router.push(`/chat/direct/${item.id}`)}
          style={({ pressed }) => [styles.row, pressed && { transform: [{ scale: 0.97 }] }]}
        >
          <View style={styles.avatar}>
            {item.partner_photo ? (
              <Image source={{ uri: item.partner_photo }} style={styles.avatarImg} />
            ) : (
              <User size={22} color={COLORS.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.topRow}>
              <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
                {item.partner_name}
              </Text>
              <Text style={styles.time}>
                {formatDistanceToNow(new Date(item.last_message_at), {
                  addSuffix: true,
                  locale: ruLocale,
                })}
              </Text>
            </View>
            <View style={styles.bottomRow}>
              <Text
                style={[styles.preview, unread && styles.previewUnread]}
                numberOfLines={1}
              >
                {item.last_message_preview || 'Новый диалог'}
              </Text>
              {unread && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {item.tutor_unread > 99 ? '99+' : item.tutor_unread}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      );
    },
    [],
  );

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Сообщения</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MessageCircle size={48} color={COLORS.textSecondary} />
            <Text style={styles.emptyTitle}>Нет диалогов</Text>
            <Text style={styles.emptyText}>
              Ученики смогут написать вам сами из вашего профиля.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
  },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },

  list: { paddingVertical: 4, paddingHorizontal: 12, flexGrow: 1 },
  sep: { height: 1, backgroundColor: COLORS.border, marginLeft: 64 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginVertical: 4,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  nameUnread: { fontWeight: '700' },
  time: { fontSize: 11, color: COLORS.textSecondary },

  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preview: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  previewUnread: { color: COLORS.text, fontWeight: '600' },

  badge: {
    minWidth: 22, height: 22, paddingHorizontal: 6,
    borderRadius: 11, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
});

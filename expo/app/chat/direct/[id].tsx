import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { format, isSameDay } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { Send, User, ChevronRight } from 'lucide-react-native';
import supabase from '../../../lib/supabase';
import { COLORS } from '../../../lib/constants';
import { Message } from '../../../lib/types';
import { ru } from '../../../lib/errors';
import { useAuthStore } from '../../../stores/auth';
import { useResponsive } from '../../../lib/responsive';
import { markRead as markDirectRead } from '../../../lib/direct-chats';

type Partner = {
  user_id: string;
  name: string;
  photo_url: string | null;
  role: 'student' | 'tutor';
};

export default function DirectChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuthStore();
  const { isDesktop, isLandscape } = useResponsive();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [chatMeta, setChatMeta] = useState<{ student_id: string; tutor_id: string } | null>(null);

  const listRef = useRef<FlatList<Message>>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!chatId || !session) return;
    load();

    const channel = supabase
      .channel(`direct_messages:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `direct_chat_id=eq.${chatId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          markDirectRead(chatId).catch(() => {});
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, session?.user.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  async function load() {
    setLoading(true);
    try {
      // 1. Chat row
      const { data: chat, error: chatErr } = await supabase
        .from('direct_chats')
        .select('id, student_id, tutor_id')
        .eq('id', chatId)
        .maybeSingle();
      if (chatErr || !chat) {
        Alert.alert('Чат не найден', chatErr ? ru(chatErr) : 'Возможно, диалог был удалён.');
        setLoading(false);
        return;
      }
      setChatMeta({ student_id: chat.student_id, tutor_id: chat.tutor_id });

      // 2. Determine partner
      const myId = session?.user.id;
      const myRole = profile?.role;
      const partnerId = myRole === 'student' ? chat.tutor_id : chat.student_id;
      const partnerRole: 'student' | 'tutor' = myRole === 'student' ? 'tutor' : 'student';
      // fallback if profile is unset — infer from chat
      const inferredPartnerId =
        myId && chat.student_id === myId ? chat.tutor_id : chat.student_id;
      const inferredRole: 'student' | 'tutor' =
        myId && chat.student_id === myId ? 'tutor' : 'student';
      const targetId = partnerId ?? inferredPartnerId;
      const targetRole = myRole ? partnerRole : inferredRole;

      if (targetRole === 'tutor') {
        const { data: tp } = await supabase
          .from('tutor_profiles')
          .select('user_id, name, photo_url')
          .eq('user_id', targetId)
          .maybeSingle();
        if (tp) setPartner({ user_id: tp.user_id, name: tp.name, photo_url: tp.photo_url, role: 'tutor' });
      } else {
        const { data: sp } = await supabase
          .from('student_profiles')
          .select('user_id, name, photo_url')
          .eq('user_id', targetId)
          .maybeSingle();
        if (sp) setPartner({ user_id: sp.user_id, name: sp.name, photo_url: sp.photo_url, role: 'student' });
      }

      // 3. Messages
      const { data: mdata } = await supabase
        .from('messages')
        .select('*')
        .eq('direct_chat_id', chatId)
        .order('created_at', { ascending: true })
        .limit(200);
      setMessages((mdata || []) as Message[]);

      // 4. Mark read
      markDirectRead(chatId).catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!text.trim() || !session) return;
    const content = text.trim();
    setText('');
    setSending(true);
    const { error } = await supabase.from('messages').insert({
      direct_chat_id: chatId,
      sender_id: session.user.id,
      content,
      type: 'text',
    });
    setSending(false);
    if (error) {
      Alert.alert('Не отправлено', ru(error));
      setText(content);
    }
  }

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isOwn = item.sender_id === session?.user.id;
      const prev = index > 0 ? messages[index - 1] : null;
      const showDate = !prev || !isSameDay(new Date(item.created_at), new Date(prev.created_at));

      return (
        <View>
          {showDate && (
            <View style={styles.dateChip}>
              <Text style={styles.dateText}>
                {format(new Date(item.created_at), 'd MMMM', { locale: ruLocale })}
              </Text>
            </View>
          )}
          <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
            {!isOwn && (
              <View style={styles.otherAvatar}>
                {partner?.photo_url ? (
                  <Image source={{ uri: partner.photo_url }} style={styles.otherAvatarImg} />
                ) : (
                  <User size={14} color={COLORS.primary} />
                )}
              </View>
            )}
            <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
              <Text style={[styles.msgText, isOwn && styles.msgTextOwn]}>{item.content}</Text>
              <Text style={[styles.time, isOwn && styles.timeOwn]}>
                {format(new Date(item.created_at), 'HH:mm')}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    [messages, session?.user.id, partner],
  );

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const canOpenTutor =
    profile?.role === 'student' && partner?.role === 'tutor' && partner?.user_id;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: partner?.name || 'Чат' }} />

      <Pressable
        style={({ pressed }) => [styles.header, pressed && canOpenTutor && { opacity: 0.85 }]}
        onPress={() => {
          if (canOpenTutor && partner) router.push(`/tutor/${partner.user_id}`);
        }}
      >
        <View style={styles.headerAvatar}>
          {partner?.photo_url ? (
            <Image source={{ uri: partner.photo_url }} style={styles.headerAvatarImg} />
          ) : (
            <Text style={styles.headerAvatarTxt}>
              {(partner?.name || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>
            {partner?.name || 'Собеседник'}
          </Text>
          {canOpenTutor && (
            <Text style={styles.headerSub}>Перейти к профилю репетитора</Text>
          )}
        </View>
        {canOpenTutor && <ChevronRight size={20} color={COLORS.textSecondary} />}
      </Pressable>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? (isLandscape ? 40 : 90) : 0}
        style={[
          { flex: 1 },
          isDesktop && { maxWidth: 880, alignSelf: 'center', width: '100%' },
        ]}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyText}>Напишите первое сообщение</Text>
            </View>
          }
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Сообщение"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={2000}
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              (!text.trim() || sending) && styles.sendBtnDisabled,
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
            disabled={!text.trim() || sending}
            onPress={send}
          >
            <Send size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  headerAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarTxt: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  headerName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.primary, marginTop: 2 },

  list: { padding: 12, gap: 4, flexGrow: 1 },

  bubbleWrap: { flexDirection: 'row', marginVertical: 3, alignItems: 'flex-end', gap: 6 },
  bubbleWrapOwn: { justifyContent: 'flex-end' },
  otherAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  otherAvatarImg: { width: 28, height: 28, borderRadius: 14 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  bubbleOwn: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  msgText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  msgTextOwn: { color: '#fff' },
  time: { fontSize: 10, color: COLORS.textSecondary, alignSelf: 'flex-end', marginTop: 2 },
  timeOwn: { color: '#ffffffaa' },

  dateChip: {
    alignSelf: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 100,
    backgroundColor: COLORS.white, borderRadius: 20,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    fontSize: 15, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
});

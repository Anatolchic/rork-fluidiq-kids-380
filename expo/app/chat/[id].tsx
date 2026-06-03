import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert, Modal, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { format, isSameDay } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { Send, Paperclip, Reply, X, Search, Pencil, Trash2, Smile, User } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { Message } from '../../lib/types';
import { ru } from '../../lib/errors';
import { useAuthStore } from '../../stores/auth';
import { useResponsive } from '../../lib/responsive';

const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

type MessageExt = Message & {
  reply_to_id?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
};

type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export default function ChatScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();
  const { isDesktop, isLandscape } = useResponsive();

  const [messages, setMessages] = useState<MessageExt[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);

  const [replyTo, setReplyTo] = useState<MessageExt | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<MessageExt | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<MessageExt | null>(null);

  const [showSearch, setShowSearch] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const listRef = useRef<FlatList<MessageExt>>(null);
  const channelRef = useRef<any>(null);
  const reactionsChannelRef = useRef<any>(null);
  const typingTimerRef = useRef<any>(null);
  const peerTypingTimerRef = useRef<any>(null);
  const messagesRef = useRef<MessageExt[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    if (!roomId) return;
    load();
    const channel = supabase
      .channel(`messages:${roomId}`, { config: { broadcast: { ack: false } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, payload => {
        setMessages(prev => prev.some(m => m.id === (payload.new as MessageExt).id) ? prev : [...prev, payload.new as MessageExt]);
        markRead();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, payload => {
        const upd = payload.new as MessageExt;
        setMessages(prev => prev.map(m => m.id === upd.id ? upd : m));
      })
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload?.from && payload.from !== session?.user.id) {
          setPeerTyping(true);
          if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
          peerTypingTimerRef.current = setTimeout(() => setPeerTyping(false), 3000);
        }
      })
      .subscribe();
    channelRef.current = channel;

    const rChannel = supabase
      .channel(`reactions:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, payload => {
        const r = payload.new as Reaction;
        if (!messagesRef.current.some(m => m.id === r.message_id)) return;
        setReactions(prev => prev.some(x => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji) ? prev : [...prev, r]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, payload => {
        const r = payload.old as Reaction;
        setReactions(prev => prev.filter(x => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)));
      })
      .subscribe();
    reactionsChannelRef.current = rChannel;

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(rChannel);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
    };
  }, [roomId, session?.user.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(200);
    const list = (data || []) as MessageExt[];
    setMessages(list);
    if (list.length > 0) {
      const ids = list.map(m => m.id);
      const { data: rdata } = await supabase.from('message_reactions').select('*').in('message_id', ids);
      setReactions((rdata || []) as Reaction[]);
    } else {
      setReactions([]);
    }
    setLoading(false);
    markRead();
  }

  async function markRead() {
    if (!roomId) return;
    supabase.rpc('mark_messages_read', { p_room_id: roomId }).then(() => {});
  }

  function emitTyping() {
    if (!channelRef.current || !session) return;
    if (typingTimerRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { from: session.user.id } });
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 2000);
  }

  useEffect(() => {
    if (messages.length > 0 && !showSearch) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length, showSearch]);

  async function send() {
    if (!text.trim() || !session) return;
    const content = text.trim();
    setText('');

    if (editingId) {
      setSending(true);
      const { error } = await supabase.from('messages')
        .update({ content, edited_at: new Date().toISOString() })
        .eq('id', editingId)
        .eq('sender_id', session.user.id);
      setSending(false);
      setEditingId(null);
      if (error) Alert.alert('Не сохранено', ru(error));
      return;
    }

    setSending(true);
    const payload: any = {
      room_id: roomId,
      sender_id: session.user.id,
      content,
      type: 'text',
    };
    if (replyTo) payload.reply_to_id = replyTo.id;
    const { error } = await supabase.from('messages').insert(payload);
    setSending(false);
    setReplyTo(null);
    if (error) Alert.alert('Не отправлено', ru(error));
  }

  function cancelEditOrReply() {
    setReplyTo(null);
    setEditingId(null);
    setText('');
  }

  function openActions(msg: MessageExt) {
    if (msg.deleted_at) return;
    setActionMsg(msg);
  }

  function actionReply() {
    if (!actionMsg) return;
    setReplyTo(actionMsg);
    setEditingId(null);
    setActionMsg(null);
  }

  function actionReact() {
    if (!actionMsg) return;
    setReactionPickerFor(actionMsg);
    setActionMsg(null);
  }

  function actionEdit() {
    if (!actionMsg) return;
    setEditingId(actionMsg.id);
    setReplyTo(null);
    setText(actionMsg.content || '');
    setActionMsg(null);
  }

  function actionDelete() {
    if (!actionMsg || !session) return;
    const id = actionMsg.id;
    setActionMsg(null);
    Alert.alert('Удалить сообщение?', 'Сообщение будет скрыто у обоих участников.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('messages')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('sender_id', session.user.id);
          if (error) Alert.alert('Не удалено', ru(error));
        },
      },
    ]);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!session) return;
    const mine = reactions.find(r => r.message_id === messageId && r.user_id === session.user.id && r.emoji === emoji);
    if (mine) {
      setReactions(prev => prev.filter(r => !(r.message_id === messageId && r.user_id === session.user.id && r.emoji === emoji)));
      const { error } = await supabase.from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', session.user.id)
        .eq('emoji', emoji);
      if (error) {
        setReactions(prev => prev.concat([{ message_id: messageId, user_id: session.user.id, emoji, created_at: new Date().toISOString() }]));
        Alert.alert('Ошибка', ru(error));
      }
    } else {
      const optimistic: Reaction = { message_id: messageId, user_id: session.user.id, emoji, created_at: new Date().toISOString() };
      setReactions(prev => prev.concat([optimistic]));
      const { error } = await supabase.from('message_reactions').insert({
        message_id: messageId, user_id: session.user.id, emoji,
      });
      if (error) {
        setReactions(prev => prev.filter(r => !(r.message_id === messageId && r.user_id === session.user.id && r.emoji === emoji)));
        Alert.alert('Ошибка', ru(error));
      }
    }
  }

  async function attachImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: false });
    if (res.canceled || !res.assets[0] || !session) return;

    setUploading(true);
    try {
      const uri = res.assets[0].uri;
      const ext = (uri.split('.').pop() || 'jpg').toLowerCase();
      const filename = `${session.user.id}/${Date.now()}.${ext}`;
      const blob = await (await fetch(uri)).blob();
      const { error: upErr } = await supabase.storage.from('chat-attachments').upload(filename, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('chat-attachments').getPublicUrl(filename);
      const payload: any = {
        room_id: roomId, sender_id: session.user.id, content: '📷 Фото', type: 'image',
        file_url: pub.publicUrl, file_name: filename.split('/').pop(),
      };
      if (replyTo) payload.reply_to_id = replyTo.id;
      const { error: msgErr } = await supabase.from('messages').insert(payload);
      if (msgErr) throw msgErr;
      setReplyTo(null);
    } catch (e: any) {
      Alert.alert('Не удалось загрузить', ru(e));
    } finally {
      setUploading(false);
    }
  }

  const messagesById = useMemo(() => {
    const map = new Map<string, MessageExt>();
    messages.forEach(m => map.set(m.id, m));
    return map;
  }, [messages]);

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    reactions.forEach(r => {
      const arr = map.get(r.message_id) || [];
      arr.push(r);
      map.set(r.message_id, arr);
    });
    return map;
  }, [reactions]);

  const visibleMessages = useMemo(() => {
    if (!showSearch || !searchValue.trim()) return messages;
    const q = searchValue.trim().toLowerCase();
    return messages.filter(m => !m.deleted_at && (m.content || '').toLowerCase().includes(q));
  }, [messages, showSearch, searchValue]);

  const renderItem = useCallback(({ item, index }: { item: MessageExt; index: number }) => {
    const isOwn = item.sender_id === session?.user.id;
    const prev = index > 0 ? visibleMessages[index - 1] : null;
    const showDate = !prev || !isSameDay(new Date(item.created_at), new Date(prev.created_at));
    const isRead = !!(item as any).read_at;
    const isDeleted = !!item.deleted_at;
    const isEdited = !!item.edited_at && !isDeleted;
    const repliedTo = item.reply_to_id ? messagesById.get(item.reply_to_id) : null;
    const myReactions = reactionsByMessage.get(item.id) || [];

    // group reactions by emoji
    const emojiAgg = new Map<string, { count: number; mine: boolean }>();
    myReactions.forEach(r => {
      const cur = emojiAgg.get(r.emoji) || { count: 0, mine: false };
      cur.count += 1;
      if (r.user_id === session?.user.id) cur.mine = true;
      emojiAgg.set(r.emoji, cur);
    });

    const bubbleInner = (
      <>
        {repliedTo && (
          <View style={[styles.replyPreview, isOwn ? styles.replyPreviewOwn : styles.replyPreviewOther]}>
            <View style={[styles.replyBar, { backgroundColor: isOwn ? '#ffffffcc' : COLORS.primary }]} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.replyAuthor, isOwn && { color: '#ffffffdd' }]}>
                {repliedTo.sender_id === session?.user.id ? 'Вы' : 'Собеседник'}
              </Text>
              <Text numberOfLines={1} style={[styles.replyText, isOwn && { color: '#ffffffcc' }]}>
                {repliedTo.deleted_at ? 'сообщение удалено' : (repliedTo.type === 'image' ? 'Фото' : (repliedTo.content || ''))}
              </Text>
            </View>
          </View>
        )}

        {isDeleted ? (
          <Text style={[styles.deletedText, isOwn && styles.deletedTextOwn]}>Сообщение удалено</Text>
        ) : item.type === 'image' && item.file_url ? (
          <Image source={{ uri: item.file_url }} style={styles.attachImg} resizeMode="cover" />
        ) : (
          <Text style={[styles.msgText, isOwn && styles.msgTextOwn]}>{item.content}</Text>
        )}

        <View style={styles.metaRow}>
          {isEdited && <Text style={[styles.editedTag, isOwn && styles.editedTagOwn]}>изменено</Text>}
          <Text style={[styles.time, isOwn && styles.timeOwn]}>{format(new Date(item.created_at), 'HH:mm')}</Text>
          {isOwn && !isDeleted && <Text style={[styles.readMark, { color: isRead ? '#3ddc84' : '#ffffff80' }]}>{isRead ? '✓✓' : '✓'}</Text>}
        </View>

        {!isDeleted && emojiAgg.size > 0 && (
          <View style={styles.reactionsRow}>
            {Array.from(emojiAgg.entries()).map(([emoji, agg]) => (
              <TouchableOpacity
                key={emoji}
                onPress={() => toggleReaction(item.id, emoji)}
                style={[styles.reactionChip, agg.mine && styles.reactionChipMine]}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                <Text style={[styles.reactionCount, agg.mine && styles.reactionCountMine]}>{agg.count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </>
    );

    return (
      <View>
        {showDate && (
          <View style={styles.dateChip}><Text style={styles.dateText}>{format(new Date(item.created_at), 'd MMMM', { locale: ruLocale })}</Text></View>
        )}
        <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
          {!isOwn && (
            <View style={styles.otherAvatar}>
              <User size={14} color={COLORS.primary} />
            </View>
          )}
          {isOwn ? (
            <Pressable
              onLongPress={() => openActions(item)}
              delayLongPress={250}
              style={({ pressed }) => [{ maxWidth: '80%', opacity: pressed ? 0.92 : 1 }]}
            >
              <LinearGradient
                colors={[COLORS.primary, '#8B7FFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bubble, styles.bubbleOwn]}
              >
                {bubbleInner}
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable
              onLongPress={() => openActions(item)}
              delayLongPress={250}
              style={({ pressed }) => [styles.bubble, styles.bubbleOther, { opacity: pressed ? 0.92 : 1 }]}
            >
              {bubbleInner}
            </Pressable>
          )}
        </View>
      </View>
    );
  }, [visibleMessages, session, messagesById, reactionsByMessage]);

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  const isOwnAction = actionMsg && session && actionMsg.sender_id === session.user.id;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {showSearch ? (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Поиск по сообщениям"
              placeholderTextColor={COLORS.textSecondary}
              value={searchValue}
              onChangeText={setSearchValue}
              autoFocus
            />
            <TouchableOpacity onPress={() => { setShowSearch(false); setSearchValue(''); }} style={styles.headerBtn}>
              <X size={20} color={COLORS.text} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => setShowSearch(true)} style={styles.headerBtn}>
              <Search size={20} color={COLORS.text} />
            </TouchableOpacity>
          </>
        )}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? (isLandscape ? 40 : 90) : 0} style={[{ flex: 1 }, isDesktop && { maxWidth: 880, alignSelf: 'center', width: '100%' }]}>
        <FlatList
          ref={listRef}
          data={visibleMessages}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, isDesktop && { maxWidth: 880, alignSelf: 'center' as any, width: '100%' }]}
          onContentSizeChange={() => { if (!showSearch) listRef.current?.scrollToEnd({ animated: false }); }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{showSearch ? '🔎' : '💬'}</Text>
              <Text style={styles.emptyText}>{showSearch ? 'Ничего не найдено' : 'Напишите первое сообщение'}</Text>
            </View>
          }
        />
        {peerTyping && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>печатает…</Text>
          </View>
        )}

        {(replyTo || editingId) && (
          <View style={styles.composerBanner}>
            <View style={styles.replyBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.composerBannerTitle}>
                {editingId ? 'Редактирование' : `Ответ — ${replyTo?.sender_id === session?.user.id ? 'себе' : 'собеседнику'}`}
              </Text>
              <Text numberOfLines={1} style={styles.composerBannerText}>
                {editingId
                  ? (messages.find(m => m.id === editingId)?.content || '')
                  : (replyTo?.type === 'image' ? '📷 Фото' : (replyTo?.content || ''))}
              </Text>
            </View>
            <TouchableOpacity onPress={cancelEditOrReply} style={styles.composerCancel}>
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} onPress={attachImage} disabled={uploading || !!editingId}>
            {uploading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Paperclip size={20} color={editingId ? COLORS.textSecondary : COLORS.primary} />}
          </TouchableOpacity>
          <TextInput
            testID="chat-input"
            style={styles.input}
            value={text}
            onChangeText={t => { setText(t); if (t) emitTyping(); }}
            placeholder={editingId ? 'Редактирование сообщения' : 'Сообщение'}
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity testID="chat-send" style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]} disabled={!text.trim() || sending} onPress={send}>
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Actions modal */}
      <Modal visible={!!actionMsg} transparent animationType="fade" onRequestClose={() => setActionMsg(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setActionMsg(null)}>
          <Pressable style={styles.actionSheet} onPress={e => e.stopPropagation()}>
            <TouchableOpacity style={styles.actionItem} onPress={actionReply}>
              <Reply size={20} color={COLORS.primary} />
              <Text style={styles.actionLabel}>Ответить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={actionReact}>
              <Smile size={20} color={COLORS.primary} />
              <Text style={styles.actionLabel}>Реакция</Text>
            </TouchableOpacity>
            {isOwnAction && actionMsg?.type === 'text' && (
              <TouchableOpacity style={styles.actionItem} onPress={actionEdit}>
                <Pencil size={20} color={COLORS.primary} />
                <Text style={styles.actionLabel}>Редактировать</Text>
              </TouchableOpacity>
            )}
            {isOwnAction && (
              <TouchableOpacity style={styles.actionItem} onPress={actionDelete}>
                <Trash2 size={20} color="#e74c3c" />
                <Text style={[styles.actionLabel, { color: '#e74c3c' }]}>Удалить</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.actionItem, styles.actionCancel]} onPress={() => setActionMsg(null)}>
              <Text style={styles.actionCancelLabel}>Отмена</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reaction picker */}
      <Modal visible={!!reactionPickerFor} transparent animationType="fade" onRequestClose={() => setReactionPickerFor(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReactionPickerFor(null)}>
          <Pressable style={styles.reactionSheet} onPress={e => e.stopPropagation()}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactionPickerRow}>
              {REACTION_EMOJIS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionPickerBtn}
                  onPress={() => {
                    if (reactionPickerFor) toggleReaction(reactionPickerFor.id, emoji);
                    setReactionPickerFor(null);
                  }}
                >
                  <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12, gap: 4 },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background, gap: 8,
  },
  headerBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18 },
  searchInput: {
    flex: 1, height: 36, backgroundColor: COLORS.white, borderRadius: 18, paddingHorizontal: 14,
    fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },

  bubbleWrap: { flexDirection: 'row', marginVertical: 3, alignItems: 'flex-end', gap: 6 },
  bubbleWrapOwn: { justifyContent: 'flex-end' },
  otherAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  bubble: {
    maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 2,
    shadowColor: '#0006', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  bubbleOwn: { borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: COLORS.white, borderBottomLeftRadius: 6 },
  msgText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  msgTextOwn: { color: '#fff' },
  deletedText: { fontSize: 14, color: COLORS.textSecondary, fontStyle: 'italic' },
  deletedTextOwn: { color: '#ffffffcc', fontStyle: 'italic' },
  attachImg: { width: 220, height: 220, borderRadius: 10, marginVertical: 2 },

  metaRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, marginTop: 2 },
  time: { fontSize: 10, color: COLORS.textSecondary },
  timeOwn: { color: '#ffffffaa' },
  readMark: { fontSize: 11, fontWeight: '700' },
  editedTag: { fontSize: 10, color: COLORS.textSecondary, fontStyle: 'italic' },
  editedTagOwn: { color: '#ffffffaa' },

  replyPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6, marginBottom: 4,
  },
  replyPreviewOwn: { backgroundColor: '#ffffff22' },
  replyPreviewOther: { backgroundColor: COLORS.background },
  replyBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: COLORS.primary },
  replyAuthor: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  replyText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: COLORS.border,
  },
  reactionChipMine: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  reactionCountMine: { color: COLORS.primary },

  typingRow: { paddingHorizontal: 16, paddingVertical: 4 },
  typingText: { fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' },
  dateChip: { alignSelf: 'center', backgroundColor: COLORS.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginVertical: 6 },
  dateText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },

  composerBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  composerBannerTitle: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  composerBannerText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  composerCancel: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center', borderRadius: 14 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background },
  attachBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.primaryLight },
  input: { flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: COLORS.white, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  sendBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.primary },
  sendBtnDisabled: { opacity: 0.3 },

  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  actionSheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingVertical: 8, paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 14 },
  actionLabel: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
  actionCancel: { justifyContent: 'center', borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4 },
  actionCancelLabel: { fontSize: 16, color: COLORS.textSecondary, fontWeight: '600' },

  reactionSheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingVertical: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  reactionPickerRow: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  reactionPickerBtn: {
    width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.primaryLight, marginHorizontal: 4,
  },
  reactionPickerEmoji: { fontSize: 28 },
});

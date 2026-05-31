import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { format, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Send, Paperclip } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { Message } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';

export default function ChatScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const channelRef = useRef<any>(null);
  const typingTimerRef = useRef<any>(null);
  const peerTypingTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!roomId) return;
    load();
    const channel = supabase
      .channel(`messages:${roomId}`, { config: { broadcast: { ack: false } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, payload => {
        setMessages(prev => prev.some(m => m.id === (payload.new as Message).id) ? prev : [...prev, payload.new as Message]);
        markRead();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, payload => {
        const upd = payload.new as Message;
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
    return () => {
      supabase.removeChannel(channel);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
    };
  }, [roomId, session?.user.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(200);
    setMessages(data || []);
    setLoading(false);
    markRead();
  }

  async function markRead() {
    if (!roomId) return;
    supabase.rpc('mark_messages_read', { p_room_id: roomId }).then(() => {});
  }

  function emitTyping() {
    if (!channelRef.current || !session) return;
    if (typingTimerRef.current) return; // throttle 2 сек
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { from: session.user.id } });
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 2000);
  }

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  async function send() {
    if (!text.trim() || !session) return;
    const content = text.trim();
    setText('');
    setSending(true);
    const { error } = await supabase.from('messages').insert({
      room_id: roomId, sender_id: session.user.id, content, type: 'text',
    });
    setSending(false);
    if (error) Alert.alert('Не отправлено', error.message);
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
      const { error: msgErr } = await supabase.from('messages').insert({
        room_id: roomId, sender_id: session.user.id, content: '📷 Фото', type: 'image', file_url: pub.publicUrl, file_name: filename.split('/').pop(),
      });
      if (msgErr) throw msgErr;
    } catch (e: any) {
      Alert.alert('Не удалось загрузить', e.message);
    } finally {
      setUploading(false);
    }
  }

  const renderItem = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.sender_id === session?.user.id;
    const prev = index > 0 ? messages[index - 1] : null;
    const showDate = !prev || !isSameDay(new Date(item.created_at), new Date(prev.created_at));
    const isRead = !!(item as any).read_at;
    return (
      <View>
        {showDate && (
          <View style={styles.dateChip}><Text style={styles.dateText}>{format(new Date(item.created_at), 'd MMMM', { locale: ru })}</Text></View>
        )}
        <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
          <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
            {item.type === 'image' && item.file_url ? (
              <Image source={{ uri: item.file_url }} style={styles.attachImg} resizeMode="cover" />
            ) : (
              <Text style={[styles.msgText, isOwn && styles.msgTextOwn]}>{item.content}</Text>
            )}
            <View style={styles.metaRow}>
              <Text style={[styles.time, isOwn && styles.timeOwn]}>{format(new Date(item.created_at), 'HH:mm')}</Text>
              {isOwn && <Text style={[styles.readMark, { color: isRead ? '#3ddc84' : '#ffffff80' }]}>{isRead ? '✓✓' : '✓'}</Text>}
            </View>
          </View>
        </View>
      </View>
    );
  }, [messages, session]);

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={i => i.id}
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
        {peerTyping && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>печатает…</Text>
          </View>
        )}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} onPress={attachImage} disabled={uploading}>
            {uploading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Paperclip size={20} color={COLORS.primary} />}
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={t => { setText(t); if (t) emitTyping(); }}
            placeholder="Сообщение"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]} disabled={!text.trim() || sending} onPress={send}>
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12, gap: 4 },
  bubbleWrap: { flexDirection: 'row', marginVertical: 2 },
  bubbleWrapOwn: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  bubbleOwn: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: COLORS.white, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 15, color: COLORS.text, lineHeight: 20 },
  msgTextOwn: { color: '#fff' },
  attachImg: { width: 220, height: 220, borderRadius: 10, marginVertical: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, marginTop: 2 },
  time: { fontSize: 10, color: COLORS.textSecondary },
  timeOwn: { color: '#ffffffaa' },
  readMark: { fontSize: 11, fontWeight: '700' },
  typingRow: { paddingHorizontal: 16, paddingVertical: 4 },
  typingText: { fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' },
  dateChip: { alignSelf: 'center', backgroundColor: COLORS.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginVertical: 6 },
  dateText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background },
  attachBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.primaryLight },
  input: { flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: COLORS.white, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  sendBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.primary },
  sendBtnDisabled: { opacity: 0.3 },
});

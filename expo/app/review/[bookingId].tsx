import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, SafeAreaView, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Star } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';

export default function ReviewScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { session } = useAuthStore();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [booking, setBooking] = useState<any>(null);
  const [existing, setExisting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (bookingId) load(); }, [bookingId]);

  async function load() {
    const [b, r] = await Promise.all([
      supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle(),
      supabase.from('reviews').select('*').eq('booking_id', bookingId).maybeSingle(),
    ]);
    let bookingData: any = b.data;
    if (bookingData) {
      const { data: t } = await supabase.from('tutor_profiles').select('name').eq('user_id', bookingData.tutor_id).maybeSingle();
      bookingData = { ...bookingData, tutor: t };
    }
    setBooking(bookingData);
    if (r.data) {
      setExisting(r.data);
      setRating(r.data.rating);
      setComment(r.data.comment || '');
    }
    setLoading(false);
  }

  async function save() {
    if (!rating || !session || !booking) { Alert.alert('Выберите оценку'); return; }
    setSaving(true);
    const { error } = await supabase.from('reviews').insert({
      booking_id: booking.id,
      tutor_id: booking.tutor_id,
      student_id: session.user.id,
      rating, comment: comment.trim().slice(0, 300),
    });
    setSaving(false);
    if (error) { Alert.alert('Не удалось', error.message); return; }
    Alert.alert('Спасибо!', 'Отзыв опубликован', [{ text: 'OK', onPress: () => router.back() }]);
  }

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!booking) return <View style={s.loader}><Text style={s.dim}>Бронь не найдена</Text></View>;

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
          <Text style={s.title}>Оцените урок</Text>
          <Text style={s.sub}>{booking.subject} с {booking.tutor?.name || 'репетитор'}</Text>

          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map(i => (
              <TouchableOpacity key={i} onPress={() => !existing && setRating(i)} disabled={!!existing}>
                <Star size={48} color={i <= rating ? COLORS.star : COLORS.border} fill={i <= rating ? COLORS.star : 'transparent'} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>Комментарий (до 300 символов)</Text>
          <TextInput
            style={s.textarea}
            value={comment}
            onChangeText={existing ? undefined : setComment}
            editable={!existing}
            multiline maxLength={300}
            placeholder="Расскажите как прошёл урок"
            placeholderTextColor={COLORS.textSecondary}
          />
          <Text style={s.helper}>{comment.length}/300</Text>

          {!existing && (
            <TouchableOpacity style={[s.btn, (!rating || saving) && { opacity: 0.4 }]} disabled={!rating || saving} onPress={save}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Опубликовать отзыв</Text>}
            </TouchableOpacity>
          )}
          {existing && (
            <View style={s.notice}>
              <Text style={s.noticeText}>Отзыв уже оставлен. Спасибо!</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 24, gap: 16, alignItems: 'center', maxWidth: 480, alignSelf: 'center' as any, width: '100%' },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 14, color: COLORS.textSecondary },
  starsRow: { flexDirection: 'row', gap: 6, marginVertical: 24 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, alignSelf: 'stretch' },
  textarea: { width: '100%', backgroundColor: COLORS.white, borderRadius: 12, padding: 14, minHeight: 100, textAlignVertical: 'top', fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  helper: { fontSize: 11, color: COLORS.textSecondary, alignSelf: 'flex-end' },
  btn: { height: 54, width: '100%', backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  notice: { padding: 14, backgroundColor: COLORS.success + '15', borderRadius: 12, borderWidth: 1, borderColor: COLORS.success + '40' },
  noticeText: { color: COLORS.success, fontSize: 14, fontWeight: '600' },
  dim: { color: COLORS.textSecondary },
});

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Star } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { TutorProfile } from '../../lib/types';

export default function PublicTutorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    const { data } = await supabase.from('tutor_profiles').select('*').eq('user_id', id).maybeSingle();
    setTutor(data);
    setLoading(false);
  }

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!tutor) return <View style={styles.loader}><Text style={styles.empty}>Репетитор не найден</Text></View>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{tutor.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{tutor.name}</Text>
          <View style={styles.ratingRow}>
            <Star size={16} color={COLORS.star} fill={COLORS.star} />
            <Text style={styles.rating}>{tutor.rating > 0 ? `${tutor.rating.toFixed(1)} (${tutor.reviews_count} отзывов)` : 'Новый профиль'}</Text>
          </View>
          <Text style={styles.price}>{(tutor.price_per_hour / 100).toLocaleString('ru')} ₽/час</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>О репетиторе</Text>
          <Text style={styles.bio}>{tutor.bio}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Предметы</Text>
          <View style={styles.chips}>
            {tutor.subjects.map(s => <View key={s} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Уровни учеников</Text>
          <View style={styles.chips}>
            {tutor.levels.map(l => <View key={l} style={styles.chip}><Text style={styles.chipText}>{l}</Text></View>)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Образование</Text>
          <Text style={styles.bio}>{tutor.education}</Text>
          <Text style={styles.meta}>Опыт работы: {tutor.experience_years} лет</Text>
        </View>

        <TouchableOpacity style={styles.bookBtn} onPress={() => router.push(`/booking/new?tutor=${tutor.user_id}`)}>
          <Text style={styles.bookBtnText}>Записаться на урок</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  empty: { fontSize: 16, color: COLORS.textSecondary },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  avatarBlock: { alignItems: 'center', gap: 6, paddingVertical: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarText: { fontSize: 40, fontWeight: '700', color: COLORS.primary },
  name: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rating: { fontSize: 14, color: COLORS.textSecondary },
  price: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginTop: 8 },
  section: { gap: 10, backgroundColor: COLORS.white, borderRadius: 14, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  bio: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  meta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.primaryLight },
  chipText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  bookBtn: { height: 56, backgroundColor: COLORS.primary, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, SafeAreaView, ActivityIndicator,
  ScrollView, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS, SUBJECTS, LEVELS } from '../../lib/constants';
import { TutorProfile } from '../../lib/types';

export default function StudentCatalog() {
  const [tutors, setTutors] = useState<TutorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'rating' | 'price_asc' | 'price_desc' | 'newest'>('rating');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { fetchTutors(); }, [selectedSubject, selectedLevel, sortBy]);

  async function fetchTutors() {
    setLoading(true);
    let query = supabase
      .from('tutor_profiles')
      .select('*')
      .eq('is_published', true);

    if (selectedSubject) query = query.contains('subjects', [selectedSubject]);
    if (selectedLevel) query = query.contains('levels', [selectedLevel]);
    if (sortBy === 'rating') query = query.order('rating', { ascending: false });
    else if (sortBy === 'price_asc') query = query.order('price_per_hour', { ascending: true });
    else if (sortBy === 'price_desc') query = query.order('price_per_hour', { ascending: false });
    else query = query.order('created_at', { ascending: false });

    const { data } = await query.limit(50);
    let result = data || [];
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(t => t.name.toLowerCase().includes(s));
    }
    setTutors(result);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTutors();
    setRefreshing(false);
  }, [selectedSubject, selectedLevel, sortBy, search]);

  const filteredTutors = search.trim()
    ? tutors.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : tutors;

  return (
    <SafeAreaView style={styles.container}>
      {/* Шапка */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Найти репетитора</Text>
      </View>

      {/* Поиск */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Имя репетитора..."
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={fetchTutors}
            placeholderTextColor={COLORS.textSecondary}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, (selectedSubject || selectedLevel) && styles.filterBtnActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Text style={styles.filterBtnText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Предметы (горизонтальный скролл) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll} contentContainerStyle={styles.subjectScrollContent}>
        <TouchableOpacity
          style={[styles.subjectChip, !selectedSubject && styles.subjectChipActive]}
          onPress={() => setSelectedSubject(null)}
        >
          <Text style={[styles.subjectChipText, !selectedSubject && styles.subjectChipTextActive]}>Все</Text>
        </TouchableOpacity>
        {SUBJECTS.slice(0, 10).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.subjectChip, selectedSubject === s && styles.subjectChipActive]}
            onPress={() => setSelectedSubject(selectedSubject === s ? null : s)}
          >
            <Text style={[styles.subjectChipText, selectedSubject === s && styles.subjectChipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Сортировка */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {[
          { key: 'rating', label: '⭐ Рейтинг' },
          { key: 'price_asc', label: '💰 Дешевле' },
          { key: 'price_desc', label: '💎 Дороже' },
          { key: 'newest', label: '🆕 Новые' },
        ].map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sortChip, sortBy === s.key && styles.sortChipActive]}
            onPress={() => setSortBy(s.key as any)}
          >
            <Text style={[styles.sortChipText, sortBy === s.key && styles.sortChipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Список */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredTutors}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <TutorCard tutor={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>😔</Text>
              <Text style={styles.emptyText}>Репетиторы не найдены</Text>
              <Text style={styles.emptySubtext}>Попробуйте изменить фильтры</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function TutorCard({ tutor }: { tutor: TutorProfile }) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/tutor/${tutor.user_id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardAvatar}>
        {tutor.photo_url ? (
          require('expo-image').Image ? null : null
        ) : (
          <Text style={styles.cardAvatarText}>{tutor.name.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName} numberOfLines={1}>{tutor.name}</Text>
          <View style={styles.cardRating}>
            <Text style={styles.cardRatingText}>⭐ {tutor.rating > 0 ? tutor.rating.toFixed(1) : 'Новый'}</Text>
          </View>
        </View>
        <Text style={styles.cardSubjects} numberOfLines={1}>
          {tutor.subjects.slice(0, 3).join(' · ')}
        </Text>
        <Text style={styles.cardLevels} numberOfLines={1}>
          {tutor.levels.slice(0, 2).join(', ')}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardPrice}>{(tutor.price_per_hour / 100).toLocaleString('ru')} ₽/час</Text>
          {tutor.experience_years > 0 && (
            <Text style={styles.cardExp}>Опыт: {tutor.experience_years} лет</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border },
  searchIcon: { fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: COLORS.text },
  clearBtn: { fontSize: 16, color: COLORS.textSecondary, padding: 4 },
  filterBtn: { width: 44, height: 44, backgroundColor: COLORS.white, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  filterBtnActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  filterBtnText: { fontSize: 20 },
  subjectScroll: { maxHeight: 44 },
  subjectScrollContent: { paddingHorizontal: 16, gap: 8 },
  subjectChip: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: COLORS.white, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  subjectChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  subjectChipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  subjectChipTextActive: { color: COLORS.white },
  sortScroll: { maxHeight: 40, marginTop: 6 },
  sortChip: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: COLORS.white, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  sortChipActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  sortChipText: { fontSize: 12, color: COLORS.textSecondary },
  sortChipTextActive: { color: COLORS.primary, fontWeight: '600' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  emptySubtext: { fontSize: 14, color: COLORS.textSecondary },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  cardAvatarText: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  cardBody: { flex: 1, gap: 3 },
  cardNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 },
  cardRating: { backgroundColor: '#FFF8E1', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  cardRatingText: { fontSize: 12, fontWeight: '600', color: '#F57F17' },
  cardSubjects: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },
  cardLevels: { fontSize: 12, color: COLORS.textSecondary },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardExp: { fontSize: 12, color: COLORS.textSecondary },
});

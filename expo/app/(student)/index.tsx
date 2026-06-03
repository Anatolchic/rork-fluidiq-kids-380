import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, SafeAreaView, ScrollView, RefreshControl, Image,
  Pressable, Animated, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search, X, SlidersHorizontal, Star, Crown, BadgeCheck,
  TrendingUp, Coins, Gem, Sparkles, GraduationCap, BookOpen, ChevronDown, Heart,
} from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS, SUBJECTS, SUBJECT_CATEGORIES, POPULAR_SUBJECTS, subjectCategoryOf } from '../../lib/constants';
import { TutorProfile } from '../../lib/types';
import { useResponsive } from '../../lib/responsive';
import { TutorCardSkeleton } from '../../lib/Skeleton';
import NotificationBell from '../../components/NotificationBell';

export default function StudentCatalog() {
  const { gridCols, contentMaxWidth } = useResponsive();
  const [tutors, setTutors] = useState<TutorProfile[]>([]);
  const [proTutorIds, setProTutorIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'pro_first' | 'rating' | 'price_asc' | 'price_desc' | 'newest'>('pro_first');
  const [showFilters, setShowFilters] = useState(false);
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [modalSearch, setModalSearch] = useState('');

  const subjectChips = useMemo(() => {
    if (selectedCategory) {
      const cat = SUBJECT_CATEGORIES.find(c => c.key === selectedCategory);
      return cat ? cat.subjects : POPULAR_SUBJECTS.slice(0, 16);
    }
    return POPULAR_SUBJECTS.slice(0, 16);
  }, [selectedCategory]);

  const modalGroups = useMemo(() => {
    const s = modalSearch.trim().toLowerCase();
    if (!s) return SUBJECT_CATEGORIES;
    return SUBJECT_CATEGORIES
      .map(c => ({ ...c, subjects: c.subjects.filter(x => x.toLowerCase().includes(s)) }))
      .filter(c => c.subjects.length > 0);
  }, [modalSearch]);

  function pickCategory(key: string) {
    if (selectedCategory === key) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(key);
      if (selectedSubject && subjectCategoryOf(selectedSubject) !== key) {
        setSelectedSubject(null);
      }
    }
  }

  function pickSubjectFromModal(subj: string) {
    setSelectedSubject(subj);
    setSelectedCategory(subjectCategoryOf(subj));
    setShowAllSubjects(false);
    setModalSearch('');
  }

  useEffect(() => { fetchTutors(); }, [selectedSubject, selectedLevel, sortBy]);

  async function fetchTutors() {
    setLoading(true);
    let query = supabase
      .from('tutor_profiles')
      .select('*')
      .eq('is_published', true);

    if (selectedSubject) query = query.contains('subjects', [selectedSubject]);
    if (selectedLevel) query = query.contains('levels', [selectedLevel]);
    if (sortBy === 'price_asc') query = query.order('price_per_hour', { ascending: true });
    else if (sortBy === 'price_desc') query = query.order('price_per_hour', { ascending: false });
    else if (sortBy === 'newest') query = query.order('created_at', { ascending: false });
    else query = query.order('rating', { ascending: false });

    const { data } = await query.limit(50);
    let result = data || [];
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(t => t.name.toLowerCase().includes(s));
    }

    const ids = result.map(t => t.user_id);
    let proIds = new Set<string>();
    if (ids.length > 0) {
      const { data: subs } = await supabase
        .from('tutor_subscriptions')
        .select('tutor_id, expires_at')
        .in('tutor_id', ids)
        .gt('expires_at', new Date().toISOString());
      proIds = new Set((subs || []).map((s: any) => s.tutor_id));
    }
    setProTutorIds(proIds);

    if (sortBy === 'pro_first' || sortBy === 'rating') {
      result = [...result].sort((a, b) => {
        const aPro = proIds.has(a.user_id) ? 1 : 0;
        const bPro = proIds.has(b.user_id) ? 1 : 0;
        if (sortBy === 'pro_first' && aPro !== bPro) return bPro - aPro;
        if (sortBy === 'rating' && aPro !== bPro) return bPro - aPro;
        return (b.rating ?? 0) - (a.rating ?? 0);
      });
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

  const sortOptions: { key: typeof sortBy; label: string; Icon: any }[] = [
    { key: 'pro_first', label: 'PRO сначала', Icon: Crown },
    { key: 'rating', label: 'Рейтинг', Icon: Star },
    { key: 'price_asc', label: 'Дешевле', Icon: Coins },
    { key: 'price_desc', label: 'Дороже', Icon: Gem },
    { key: 'newest', label: 'Новые', Icon: Sparkles },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={loading ? [] : filteredTutors}
        key={`grid-${gridCols}`}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <TutorCard
            tutor={item}
            compact={gridCols > 1}
            isPro={proTutorIds.has(item.user_id)}
            index={index}
          />
        )}
        numColumns={gridCols}
        columnWrapperStyle={gridCols > 1 ? { gap: 14, justifyContent: 'flex-start' } : undefined}
        contentContainerStyle={[styles.list, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%', paddingHorizontal: gridCols > 1 ? 16 : 0 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <View>
            {/* Hero-секция с градиентом */}
            <LinearGradient
              colors={[COLORS.primary, '#8B7FFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View pointerEvents="none" style={styles.heroIconWrap}>
                <GraduationCap size={120} color="#ffffff14" strokeWidth={1.5} />
              </View>
              <View style={styles.heroTopRow}>
                <View style={{ flex: 1 }} pointerEvents="none">
                  <Text style={styles.heroEyebrow}>Найди своего</Text>
                  <Text style={styles.heroTitle}>репетитора</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.heroBell}
                    onPress={() => router.push('/(student)/favorites')}
                    accessibilityLabel="Избранное"
                  >
                    <Heart size={22} color="#fff" fill="#ffffff44" />
                  </TouchableOpacity>
                  <View style={styles.heroBell}>
                    <NotificationBell />
                  </View>
                </View>
              </View>
            </LinearGradient>

            {/* Поиск с тенью — приподнят над hero */}
            <View style={styles.searchSection}>
              <View style={styles.searchBox}>
                <Search size={18} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Имя репетитора..."
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={fetchTutors}
                  placeholderTextColor={COLORS.textSecondary}
                />
                {search.length > 0 && (
                  <Pressable
                    onPress={() => setSearch('')}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
                  >
                    <X size={18} color={COLORS.textSecondary} />
                  </Pressable>
                )}
                <Pressable
                  style={({ pressed }) => [
                    styles.filterBtn,
                    (selectedSubject || selectedLevel) && styles.filterBtnActive,
                    { transform: [{ scale: pressed ? 0.94 : 1 }] },
                  ]}
                  onPress={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal size={18} color={(selectedSubject || selectedLevel) ? COLORS.primary : COLORS.textSecondary} />
                </Pressable>
              </View>
            </View>

            {/* Категории */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryScrollContent}
            >
              <Pressable
                onPress={() => { setSelectedCategory(null); setSelectedSubject(null); }}
                style={({ pressed }) => [
                  styles.categoryChip,
                  !selectedCategory && styles.categoryChipActive,
                  { transform: [{ scale: pressed ? 0.96 : 1 }] },
                ]}
              >
                <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>
                  ✨ Все
                </Text>
              </Pressable>
              {SUBJECT_CATEGORIES.map(c => {
                const active = selectedCategory === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => pickCategory(c.key)}
                    style={({ pressed }) => [
                      styles.categoryChip,
                      active && styles.categoryChipActive,
                      { transform: [{ scale: pressed ? 0.96 : 1 }] },
                    ]}
                  >
                    <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                      {c.emoji} {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Предметы выбранной категории + кнопка «Ещё» */}
            <View style={styles.subjectRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.subjectScroll}
                contentContainerStyle={styles.subjectScrollContent}
              >
                <Chip
                  active={!selectedSubject}
                  label="Все"
                  onPress={() => setSelectedSubject(null)}
                />
                {subjectChips.map(s => (
                  <Chip
                    key={s}
                    active={selectedSubject === s}
                    label={s}
                    onPress={() => setSelectedSubject(selectedSubject === s ? null : s)}
                  />
                ))}
              </ScrollView>
              <Pressable
                onPress={() => setShowAllSubjects(true)}
                style={({ pressed }) => [styles.moreBtn, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
              >
                <Text style={styles.moreBtnText}>Ещё</Text>
                <ChevronDown size={14} color={COLORS.primary} />
              </Pressable>
            </View>

            {selectedSubject && (
              <View style={styles.activeRow}>
                <View style={styles.activePill}>
                  <Text style={styles.activePillText}>{selectedSubject}</Text>
                  <Pressable hitSlop={8} onPress={() => setSelectedSubject(null)}>
                    <X size={14} color={COLORS.white} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* Сортировка */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {sortOptions.map(opt => {
                const active = sortBy === opt.key;
                const Icon = opt.Icon;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setSortBy(opt.key)}
                    style={({ pressed }) => [
                      styles.sortChip,
                      active && styles.sortChipActive,
                      { transform: [{ scale: pressed ? 0.96 : 1 }] },
                    ]}
                  >
                    <Icon size={13} color={active ? COLORS.primary : COLORS.textSecondary} />
                    <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {loading && (
              <View style={{ gap: 14, marginTop: 12 }}>
                {Array.from({ length: 4 }).map((_, i) => <TutorCardSkeleton key={i} />)}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <BookOpen size={48} color={COLORS.primary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyText}>Репетиторы не найдены</Text>
              <Text style={styles.emptySubtext}>Попробуйте изменить фильтры или предмет</Text>
            </View>
          ) : null
        }
      />

      {/* Модал «Все предметы» */}
      <Modal
        visible={showAllSubjects}
        animationType="slide"
        onRequestClose={() => setShowAllSubjects(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Все предметы</Text>
            <Pressable
              hitSlop={10}
              style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.6 }]}
              onPress={() => { setShowAllSubjects(false); setModalSearch(''); }}
            >
              <X size={22} color={COLORS.text} />
            </Pressable>
          </View>
          <View style={styles.modalSearchBox}>
            <Search size={16} color={COLORS.textSecondary} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Поиск предмета..."
              value={modalSearch}
              onChangeText={setModalSearch}
              placeholderTextColor={COLORS.textSecondary}
            />
            {modalSearch.length > 0 && (
              <Pressable hitSlop={8} onPress={() => setModalSearch('')}>
                <X size={16} color={COLORS.textSecondary} />
              </Pressable>
            )}
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.modalScroll, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
          >
            {modalGroups.length === 0 && (
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}>
                  <Search size={40} color={COLORS.primary} strokeWidth={1.5} />
                </View>
                <Text style={styles.emptyText}>Ничего не найдено</Text>
              </View>
            )}
            {modalGroups.map(cat => (
              <View key={cat.key} style={styles.modalGroup}>
                <Text style={styles.modalGroupTitle}>{cat.emoji}  {cat.label}</Text>
                <View style={styles.modalChipsWrap}>
                  {cat.subjects.map(s => {
                    const active = selectedSubject === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => pickSubjectFromModal(s)}
                        style={({ pressed }) => [
                          styles.modalChip,
                          active && styles.modalChipActive,
                          { transform: [{ scale: pressed ? 0.97 : 1 }] },
                        ]}
                      >
                        <Text style={[styles.modalChipText, active && styles.modalChipTextActive]}>{s}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.subjectChip,
        active && styles.subjectChipActive,
        { transform: [{ scale: pressed ? 0.96 : 1 }] },
      ]}
    >
      <Text style={[styles.subjectChipText, active && styles.subjectChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StarRow({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, rating));
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={11}
          color={COLORS.star}
          fill={i <= Math.round(r) ? COLORS.star : 'transparent'}
        />
      ))}
    </View>
  );
}

function TutorCard({ tutor, compact, isPro, index }: { tutor: TutorProfile; compact?: boolean; isPro?: boolean; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: index * 60, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 320, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const priceRub = (tutor.price_per_hour / 100).toLocaleString('ru');

  return (
    <Animated.View
      style={[
        compact ? { flex: 1, minWidth: 240, marginBottom: 14 } : { marginBottom: 14 },
        { opacity, transform: [{ translateY: ty }] },
      ]}
    >
      <Pressable
        testID={`tutor-card-${index}`}
        onPress={() => router.push(`/tutor/${tutor.user_id}`)}
        style={({ pressed }) => [
          styles.card,
          isPro && styles.cardPro,
          compact && { marginHorizontal: 0 },
          { transform: [{ scale: pressed ? 0.985 : 1 }] },
        ]}
      >
        {/* Цена pill в правом-верхнем углу */}
        <View style={styles.pricePill}>
          <Text style={styles.pricePillText}>{priceRub} ₽</Text>
          <Text style={styles.pricePillUnit}>/час</Text>
        </View>

        <View style={styles.cardRow}>
          {/* Аватар 72×72 */}
          <View style={styles.avatarWrap}>
            {tutor.photo_url ? (
              <Image source={{ uri: tutor.photo_url }} style={styles.cardAvatarImg} />
            ) : (
              <LinearGradient
                colors={[COLORS.primary, '#8B7FFF']}
                style={styles.cardAvatar}
              >
                <Text style={styles.cardAvatarText}>{tutor.name.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
            {isPro && (
              <View style={styles.proRing} pointerEvents="none" />
            )}
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardName} numberOfLines={1}>{tutor.name}</Text>

            {/* Бейджи: PRO + верифицирован */}
            <View style={styles.badgesRow}>
              {isPro && (
                <LinearGradient
                  colors={['#FFD700', '#FFA000']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.proBadge}
                >
                  <Crown size={10} color="#fff" fill="#fff" />
                  <Text style={styles.proBadgeText}>PRO</Text>
                </LinearGradient>
              )}
              {(tutor as any).is_verified && (
                <View style={styles.verifiedBadge}>
                  <BadgeCheck size={10} color={COLORS.success} fill={COLORS.success + '20'} />
                  <Text style={styles.verifiedBadgeText}>Проверен</Text>
                </View>
              )}
            </View>

            {/* Рейтинг звёздами */}
            <View style={styles.ratingRow}>
              <StarRow rating={tutor.rating ?? 0} />
              <Text style={styles.ratingText}>
                {tutor.rating > 0 ? tutor.rating.toFixed(1) : 'Новый'}
              </Text>
              {(tutor as any).reviews_count > 0 && (
                <Text style={styles.reviewsText}>· {(tutor as any).reviews_count} отзыв.</Text>
              )}
            </View>

            <Text style={styles.cardSubjects} numberOfLines={1}>
              {tutor.subjects.slice(0, 3).join(' · ')}
            </Text>
            <Text style={styles.cardLevels} numberOfLines={1}>
              {tutor.levels.slice(0, 2).join(', ')}
            </Text>

            {tutor.experience_years > 0 && (
              <View style={styles.expRow}>
                <TrendingUp size={11} color={COLORS.textSecondary} />
                <Text style={styles.cardExp}>Опыт: {tutor.experience_years} {plural(tutor.experience_years, 'год', 'года', 'лет')}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const cardShadow = {
  shadowColor: '#0006',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingBottom: 24, gap: 0 },

  // Hero
  hero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 56,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center' },
  heroBell: { backgroundColor: '#ffffff22', borderRadius: 14, padding: 6 },
  heroEyebrow: { color: '#ffffffcc', fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  heroTitle: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  heroIconWrap: { position: 'absolute', right: -10, bottom: -20 },

  // Поиск (поверх hero)
  searchSection: { paddingHorizontal: 16, marginTop: -28, marginBottom: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 8,
    ...cardShadow,
  },
  searchInput: { flex: 1, height: 48, fontSize: 15, color: COLORS.text },
  filterBtn: {
    width: 36, height: 36,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: COLORS.primaryLight },

  // Категории
  categoryScroll: { maxHeight: 48, marginTop: 8 },
  categoryScrollContent: { paddingHorizontal: 16, gap: 8 },
  categoryChip: {
    height: 38, paddingHorizontal: 16, borderRadius: 19,
    backgroundColor: COLORS.white, justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  categoryChipActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  categoryChipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '700' },
  categoryChipTextActive: { color: COLORS.primary },

  // Subject chips
  subjectRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingRight: 12 },
  subjectScroll: { maxHeight: 44, flex: 1 },
  subjectScrollContent: { paddingHorizontal: 16, gap: 8 },
  subjectChip: {
    height: 32, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: COLORS.white, justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  subjectChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  subjectChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  subjectChipTextActive: { color: COLORS.white },
  moreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 32, paddingHorizontal: 10, borderRadius: 16,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1, borderColor: COLORS.primary,
  },
  moreBtnText: { fontSize: 12, color: COLORS.primary, fontWeight: '800' },

  activeRow: { paddingHorizontal: 16, marginTop: 8 },
  activePill: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12,
  },
  activePillText: { fontSize: 12, color: COLORS.white, fontWeight: '700' },

  // Modal "Все предметы"
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  modalClose: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  modalSearchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12,
    height: 44, backgroundColor: COLORS.white,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  modalSearchInput: { flex: 1, fontSize: 15, color: COLORS.text },
  modalScroll: { padding: 16, paddingBottom: 32 },
  modalGroup: { marginBottom: 18 },
  modalGroupTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  modalChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modalChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modalChipText: { fontSize: 12, color: COLORS.text },
  modalChipTextActive: { color: COLORS.white, fontWeight: '700' },

  // Sort
  sortScroll: { maxHeight: 40, marginTop: 8, marginBottom: 12 },
  sortChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 32, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sortChipActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  sortChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  sortChipTextActive: { color: COLORS.primary, fontWeight: '700' },

  // Empty
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptySubtext: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },

  // Карточка
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    ...cardShadow,
    position: 'relative',
  },
  cardPro: { borderWidth: 1.5, borderColor: '#FFD700' + '60' },
  cardRow: { flexDirection: 'row', gap: 14 },

  // Avatar 72×72
  avatarWrap: { position: 'relative' },
  cardAvatar: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center',
  },
  cardAvatarImg: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight },
  cardAvatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  proRing: {
    position: 'absolute', top: -3, left: -3, right: -3, bottom: -3,
    borderRadius: 40, borderWidth: 2, borderColor: '#FFD700',
  },

  // Price pill
  pricePill: {
    position: 'absolute', top: 14, right: 14,
    flexDirection: 'row', alignItems: 'baseline', gap: 2,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10,
  },
  pricePillText: { fontSize: 14, fontWeight: '800', color: COLORS.primary, letterSpacing: -0.3 },
  pricePillUnit: { fontSize: 10, color: COLORS.primary, fontWeight: '600' },

  cardBody: { flex: 1, gap: 4, paddingRight: 70 },
  cardName: { fontSize: 17, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },

  badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  proBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.success + '15',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  verifiedBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.success },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  ratingText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  reviewsText: { fontSize: 11, color: COLORS.textSecondary },

  cardSubjects: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  cardLevels: { fontSize: 12, color: COLORS.textSecondary },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardExp: { fontSize: 12, color: COLORS.textSecondary },
});

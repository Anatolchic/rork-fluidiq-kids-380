import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Eye, EyeOff, Star } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';

export default function AdminTutors() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'published' | 'unpublished'>('all');

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    let q = supabase.from('tutor_profiles').select('*').order('created_at', { ascending: false });
    if (filter === 'published') q = q.eq('is_published', true);
    else if (filter === 'unpublished') q = q.eq('is_published', false);
    const { data } = await q.limit(200);
    setList(data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [filter]);

  async function togglePublished(item: any) {
    await supabase.rpc('admin_set_tutor_published', { p_user_id: item.user_id, p_published: !item.is_published });
    load();
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Репетиторы</Text>
        <View style={s.filters}>
          {[
            { k: 'all', l: `Все · ${list.length}` },
            { k: 'published', l: 'Опубликованы' },
            { k: 'unpublished', l: 'Не опубликованы' },
          ].map(f => (
            <TouchableOpacity key={f.k} style={[s.chip, filter === f.k && s.chipActive]} onPress={() => setFilter(f.k as any)}>
              <Text style={[s.chipText, filter === f.k && s.chipTextActive]}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <TouchableOpacity style={s.cardMain} onPress={() => router.push(`/admin-user/${item.user_id}`)}>
                <View style={s.avatar}><Text style={s.avatarText}>{item.name?.charAt(0)?.toUpperCase() || '?'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.name || '—'}</Text>
                  <Text style={s.subj} numberOfLines={1}>{(item.subjects || []).slice(0, 3).join(' · ')}</Text>
                  <View style={s.metaRow}>
                    <Star size={11} color={COLORS.star} fill={COLORS.star} />
                    <Text style={s.meta}>{item.rating > 0 ? `${Number(item.rating).toFixed(1)} (${item.reviews_count})` : 'Без отзывов'}</Text>
                    <Text style={s.meta}>· {(item.price_per_hour / 100).toLocaleString('ru')} ₽/ч</Text>
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[s.pubBtn, item.is_published ? s.pubBtnOn : s.pubBtnOff]} onPress={() => togglePublished(item)}>
                {item.is_published ? <Eye size={16} color={COLORS.success} /> : <EyeOff size={16} color={COLORS.textSecondary} />}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.dim}>Нет репетиторов</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}
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
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, padding: 12 },
  cardMain: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  subj: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  meta: { fontSize: 11, color: COLORS.textSecondary },
  pubBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  pubBtnOn: { backgroundColor: COLORS.success + '15' },
  pubBtnOff: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  empty: { padding: 40, alignItems: 'center' },
});

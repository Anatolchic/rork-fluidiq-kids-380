import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Search } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';

export default function AdminUsers() {
  const params = useLocalSearchParams<{ role?: string }>();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string | null>(params.role || null);

  useEffect(() => { load(); }, [role]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_users', { p_search: search || null, p_role: role || null, p_limit: 200, p_offset: 0 });
    setUsers(data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [search, role]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Пользователи</Text>
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Search size={16} color={COLORS.textSecondary} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={load}
              placeholder="Поиск по email/имени"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
        </View>
        <View style={s.filters}>
          {[
            { k: null, l: 'Все' },
            { k: 'admin', l: 'Админы' },
            { k: 'tutor', l: 'Репетиторы' },
            { k: 'student', l: 'Ученики' },
          ].map(f => (
            <TouchableOpacity key={String(f.k)} style={[s.chip, role === f.k && s.chipActive]} onPress={() => setRole(f.k)}>
              <Text style={[s.chipText, role === f.k && s.chipTextActive]}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
        <FlatList
          data={users}
          keyExtractor={i => i.user_id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/admin-user/${item.user_id}`)}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(item.name || item.email)?.charAt(0)?.toUpperCase() || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name || '—'}</Text>
                <Text style={s.email}>{item.email}</Text>
                <View style={s.metaRow}>
                  <View style={[s.rolePill, { backgroundColor: roleColor(item.role) + '20' }]}>
                    <Text style={[s.rolePillText, { color: roleColor(item.role) }]}>{roleLabel(item.role)}</Text>
                  </View>
                  {item.is_published && <Text style={s.pubMark}>📡</Text>}
                  {item.bookings_count > 0 && <Text style={s.meta}>{item.bookings_count} бронир.</Text>}
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.dim}>Не найдено</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}
function roleLabel(r: string) { return r === 'admin' ? 'Админ' : r === 'tutor' ? 'Репетитор' : r === 'student' ? 'Ученик' : 'Гость'; }
function roleColor(r: string) { return r === 'admin' ? '#FF9800' : r === 'tutor' ? '#6C63FF' : r === 'student' ? '#4CAF50' : '#999'; }

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  searchRow: { flexDirection: 'row' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.white, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: COLORS.text },
  filters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.white, borderRadius: 12, padding: 12, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  email: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  rolePillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  pubMark: { fontSize: 12 },
  meta: { fontSize: 11, color: COLORS.textSecondary },
  empty: { padding: 40, alignItems: 'center' },
  dim: { color: COLORS.textSecondary },
});

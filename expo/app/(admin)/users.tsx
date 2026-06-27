import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Pressable, SafeAreaView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Search, Ban, ShieldCheck, Download, Check } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useResponsive } from '../../lib/responsive';
import { ExportButton } from '../../components/ExportButton';
import { useSelection } from '../../hooks/useSelection';
import { BulkActionBar } from '../../components/BulkActionBar';
import { downloadCSV } from '../../lib/csv-export';

export default function AdminUsers() {
  const params = useLocalSearchParams<{ role?: string }>();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string | null>(params.role || null);
  const PAGE_SIZE = 50;
  const { contentMaxWidth } = useResponsive();
  const sel = useSelection<any>(u => u.user_id);

  useEffect(() => { load(); }, [role]);

  // При смене фильтра/поиска сбрасываем выделение, чтобы не оперировать
  // невидимыми элементами.
  useEffect(() => { sel.clear(); }, [role]);

  async function runBulk(rpc: string, args: any, label: string) {
    const ids = sel.ids;
    if (ids.length === 0) return;
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    Alert.alert(label, `Обработано: ${data ?? ids.length}`);
    sel.clear();
    load();
  }

  function bulkBan() {
    Alert.prompt?.(
      'Бан пользователей',
      `Причина бана для ${sel.count} пользователей:`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Забанить',
          style: 'destructive',
          onPress: (reason?: string) =>
            runBulk('admin_bulk_ban', { p_user_ids: sel.ids, p_reason: reason || 'Нарушение правил' }, 'Забанено'),
        },
      ],
      'plain-text',
      'Нарушение правил',
    ) ?? runBulk('admin_bulk_ban', { p_user_ids: sel.ids, p_reason: 'Нарушение правил' }, 'Забанено');
  }

  function bulkUnban() {
    runBulk('admin_bulk_unban', { p_user_ids: sel.ids }, 'Сняты баны');
  }

  async function bulkExport() {
    const rows = users.filter(u => sel.has(u.user_id));
    await downloadCSV('users-selected.csv', rows, [
      { key: 'email' },
      { key: 'name', label: 'Имя' },
      { key: 'role', label: 'Роль' },
      { key: 'bookings_count', label: 'Брони' },
      { key: 'created_at', label: 'Зарегистрирован' },
    ]);
    sel.clear();
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_users', { p_search: search || null, p_role: role || null, p_limit: PAGE_SIZE, p_offset: 0 });
    const list = data || [];
    setUsers(list);
    setHasMore(list.length === PAGE_SIZE);
    setLoading(false);
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const { data } = await supabase.rpc('admin_list_users', { p_search: search || null, p_role: role || null, p_limit: PAGE_SIZE, p_offset: users.length });
    const more = data || [];
    setUsers(prev => [...prev, ...more]);
    setHasMore(more.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [search, role]);

  return (
    <SafeAreaView style={s.container}>
      <View style={[s.header, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <Text style={s.title}>Пользователи</Text>
          <ExportButton
            filename="users.csv"
            rows={users}
            columns={[{ key: 'email' }, { key: 'role' }, { key: 'created_at', label: 'Зарегистрирован' }]}
          />
        </View>
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
          contentContainerStyle={[s.list, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const checked = sel.has(item.user_id);
            const inSelectionMode = sel.count > 0;
            return (
              <Pressable
                style={({ pressed }) => [
                  s.card,
                  checked && s.cardSelected,
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => {
                  if (inSelectionMode) sel.toggle(item);
                  else router.push(`/admin-user/${item.user_id}`);
                }}
                onLongPress={() => sel.toggle(item)}
                delayLongPress={300}
              >
                <View style={[s.avatar, checked && { backgroundColor: COLORS.primary }]}>
                  {checked ? (
                    <Check size={20} color="#fff" />
                  ) : (
                    <Text style={s.avatarText}>{(item.name || item.email)?.charAt(0)?.toUpperCase() || '?'}</Text>
                  )}
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
              </Pressable>
            );
          }}
          ListEmptyComponent={<View style={s.empty}><Text style={s.dim}>Не найдено</Text></View>}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : !hasMore && users.length > 0 ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Text style={s.dim}>— Это все пользователи —</Text>
              </View>
            ) : null
          }
        />
      )}
      <BulkActionBar
        count={sel.count}
        onClear={sel.clear}
        actions={[
          { label: 'Бан', icon: Ban, danger: true, onPress: bulkBan },
          { label: 'Снять бан', icon: ShieldCheck, onPress: bulkUnban },
          { label: 'CSV', icon: Download, onPress: bulkExport },
        ]}
      />
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
  card: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.white, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  cardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
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

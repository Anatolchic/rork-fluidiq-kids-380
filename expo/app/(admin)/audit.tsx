// Экран просмотра журнала действий администраторов.
// Тянет последние 200 записей из admin_audit_log, имена админов подгружает
// отдельным запросом (FK на auth.users, embed не работает — как в lib/bookings).
// Клик по строке с target_table='user_roles' ведёт в /admin-user/{target_id},
// для остальных — раскрывает payload-модалку.

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronDown, X, User as UserIcon, Filter } from 'lucide-react-native';
import { format } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { ru } from '../../lib/errors';
import { useResponsive } from '../../lib/responsive';

type AuditRow = {
  id: number;
  admin_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  payload: any;
  created_at: string;
};

type AdminInfo = {
  user_id: string;
  name?: string | null;
  email?: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  ban_user: 'Бан пользователя',
  unban_user: 'Разбан пользователя',
  soft_delete_user: 'Удаление пользователя',
  approve_certification: 'Сертификат: одобрен',
  reject_certification: 'Сертификат: отклонён',
  approve_verification: 'Верификация: одобрена',
  reject_verification: 'Верификация: отклонена',
  refund_payment: 'Возврат платежа',
  cancel_booking: 'Отмена брони',
  edit_settings: 'Изменение настроек',
  create_promo: 'Создание промокода',
  delete_promo: 'Удаление промокода',
};

function labelForAction(a: string) {
  return ACTION_LABELS[a] || a;
}

export default function AdminAudit() {
  const { contentMaxWidth, isDesktop } = useResponsive();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [admins, setAdmins] = useState<Record<string, AdminInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterAction, setFilterAction] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detail, setDetail] = useState<AuditRow | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const list = (data || []) as AuditRow[];
      setRows(list);
      await attachAdmins(list);
    } catch (e) {
      Alert.alert('Ошибка', ru(e));
    } finally {
      setLoading(false);
    }
  }

  async function attachAdmins(list: AuditRow[]) {
    const ids = [...new Set(list.map(r => r.admin_id).filter(Boolean))] as string[];
    if (!ids.length) {
      setAdmins({});
      return;
    }
    const [tutors, students] = await Promise.all([
      supabase.from('tutor_profiles').select('user_id, name').in('user_id', ids),
      supabase.from('student_profiles').select('user_id, name').in('user_id', ids),
    ]);
    const map: Record<string, AdminInfo> = {};
    (tutors.data || []).forEach((p: any) => {
      map[p.user_id] = { user_id: p.user_id, name: p.name };
    });
    (students.data || []).forEach((p: any) => {
      if (!map[p.user_id]) map[p.user_id] = { user_id: p.user_id, name: p.name };
    });
    setAdmins(map);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const actionOptions = useMemo(() => {
    const set = new Set<string>(rows.map(r => r.action));
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!filterAction) return rows;
    return rows.filter(r => r.action === filterAction);
  }, [rows, filterAction]);

  function handlePress(row: AuditRow) {
    if (row.target_table === 'user_roles' && row.target_id) {
      router.push(`/admin-user/${row.target_id}` as any);
      return;
    }
    setDetail(row);
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={[s.inner, isDesktop ? { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' } : null]}>
        <View style={s.header}>
          <Text style={s.title}>Журнал действий</Text>
          <Text style={s.subtitle}>Последние 200 записей</Text>

          <TouchableOpacity style={s.filterBtn} onPress={() => setFilterOpen(true)}>
            <Filter size={14} color={COLORS.text} />
            <Text style={s.filterText} numberOfLines={1}>
              {filterAction ? labelForAction(filterAction) : 'Все типы действий'}
            </Text>
            <ChevronDown size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
          {filterAction && (
            <TouchableOpacity style={s.clearBtn} onPress={() => setFilterAction(null)}>
              <Text style={s.clearText}>Сбросить фильтр</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={i => String(i.id)}
            contentContainerStyle={s.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const admin = item.admin_id ? admins[item.admin_id] : null;
              const adminName = admin?.name || (item.admin_id ? item.admin_id.slice(0, 8) + '…' : 'система');
              const clickable = item.target_table === 'user_roles' && !!item.target_id;
              return (
                <TouchableOpacity style={s.row} onPress={() => handlePress(item)} activeOpacity={0.7}>
                  <View style={s.rowHead}>
                    <Text style={s.time}>{format(new Date(item.created_at), 'd MMM HH:mm:ss', { locale: ruLocale })}</Text>
                    <View style={s.actionPill}>
                      <Text style={s.actionPillText}>{labelForAction(item.action)}</Text>
                    </View>
                  </View>
                  <View style={s.rowBody}>
                    <View style={s.adminBox}>
                      <UserIcon size={12} color={COLORS.textSecondary} />
                      <Text style={s.adminName} numberOfLines={1}>{adminName}</Text>
                    </View>
                    {item.target_table && (
                      <Text style={s.target} numberOfLines={1}>
                        → {item.target_table}
                        {item.target_id ? `: ${item.target_id.slice(0, 8)}…` : ''}
                      </Text>
                    )}
                  </View>
                  {clickable && <Text style={s.hint}>Открыть карточку пользователя →</Text>}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.dim}>Записей нет</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Фильтр по action */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setFilterOpen(false)}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Тип действия</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)}>
                <X size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <TouchableOpacity
                style={[s.opt, !filterAction && s.optActive]}
                onPress={() => {
                  setFilterAction(null);
                  setFilterOpen(false);
                }}
              >
                <Text style={[s.optText, !filterAction && s.optTextActive]}>Все</Text>
              </TouchableOpacity>
              {actionOptions.map(a => (
                <TouchableOpacity
                  key={a}
                  style={[s.opt, filterAction === a && s.optActive]}
                  onPress={() => {
                    setFilterAction(a);
                    setFilterOpen(false);
                  }}
                >
                  <Text style={[s.optText, filterAction === a && s.optTextActive]}>{labelForAction(a)}</Text>
                  <Text style={s.optSub}>{a}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Деталь payload */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{detail ? labelForAction(detail.action) : ''}</Text>
              <TouchableOpacity onPress={() => setDetail(null)}>
                <X size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            {detail && (
              <ScrollView style={{ maxHeight: 480 }}>
                <Text style={s.kvKey}>Время</Text>
                <Text style={s.kvVal}>{format(new Date(detail.created_at), 'd MMM yyyy HH:mm:ss', { locale: ruLocale })}</Text>
                <Text style={s.kvKey}>Админ</Text>
                <Text style={s.kvVal}>
                  {detail.admin_id ? (admins[detail.admin_id]?.name || detail.admin_id) : 'система'}
                </Text>
                {detail.target_table && (
                  <>
                    <Text style={s.kvKey}>Цель</Text>
                    <Text style={s.kvVal}>{detail.target_table}{detail.target_id ? ` / ${detail.target_id}` : ''}</Text>
                  </>
                )}
                <Text style={s.kvKey}>Payload</Text>
                <Text style={s.payload}>{JSON.stringify(detail.payload ?? {}, null, 2)}</Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1 },
  header: { padding: 16, gap: 8 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 12, color: COLORS.textSecondary },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border, marginTop: 4,
  },
  filterText: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '500' },
  clearBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  clearText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingTop: 0, gap: 8, paddingBottom: 32 },
  row: { backgroundColor: COLORS.white, borderRadius: 10, padding: 12, gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  time: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  actionPill: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  actionPillText: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },
  rowBody: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  adminBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  adminName: { fontSize: 12, color: COLORS.text, fontWeight: '600', maxWidth: 160 },
  target: { fontSize: 11, color: COLORS.textSecondary, flexShrink: 1 },
  hint: { fontSize: 10, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
  dim: { color: COLORS.textSecondary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  opt: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  optActive: { backgroundColor: COLORS.primaryLight },
  optText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  optTextActive: { color: COLORS.primary, fontWeight: '700' },
  optSub: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  kvKey: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600', textTransform: 'uppercase', marginTop: 10 },
  kvVal: { fontSize: 13, color: COLORS.text, marginTop: 2 },
  payload: {
    fontSize: 11, color: COLORS.text, backgroundColor: COLORS.background,
    padding: 10, borderRadius: 8, marginTop: 4, fontFamily: 'monospace' as any,
  },
});

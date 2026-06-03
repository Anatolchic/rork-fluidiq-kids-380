import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, TextInput, TouchableOpacity, Alert, Modal, FlatList } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { UserPlus, KeyRound, ShieldOff } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';
import { useResponsive } from '../../lib/responsive';
import SettingsSection from '../../components/SettingsSection';

export default function AdminProfile() {
  const { session, setSession, setProfile } = useAuthStore();
  const { contentMaxWidth } = useResponsive();
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newPassword, setNewPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [creating, setCreating] = useState(false);

  const [grantEmail, setGrantEmail] = useState('');
  const [granting, setGranting] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_users', { p_search: null, p_role: 'admin', p_limit: 50, p_offset: 0 });
    setAdmins(data || []);
    setLoading(false);
  }

  async function changeOwnPassword() {
    if (!newPassword || newPassword.length < 8) { Alert.alert('Пароль должен быть от 8 символов'); return; }
    setSavingPass(true);
    const { error } = await supabase.functions.invoke('admin-actions', { body: { action: 'update_password_self', password: newPassword } });
    setSavingPass(false);
    if (error) Alert.alert('Ошибка', error.message);
    else { Alert.alert('Пароль изменён'); setNewPassword(''); }
  }

  async function createNewAdmin() {
    if (!newEmail || !newAdminPass) { Alert.alert('Заполните email и пароль'); return; }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke('admin-actions', { body: { action: 'create_user', email: newEmail, password: newAdminPass, role: 'admin' } });
    setCreating(false);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    Alert.alert('Админ создан', `email: ${(data as any)?.email}\npassword: ${(data as any)?.password}`);
    setCreateOpen(false); setNewEmail(''); setNewAdminPass(''); load();
  }

  async function grantAdmin() {
    if (!grantEmail) return;
    setGranting(true);
    const { data, error } = await supabase.rpc('admin_grant_admin', { p_email: grantEmail });
    setGranting(false);
    if (error || (data as any)?.success === false) {
      Alert.alert('Ошибка', error?.message || (data as any)?.error || 'Не удалось');
      return;
    }
    Alert.alert('Назначен админом', grantEmail);
    setGrantEmail(''); load();
  }

  async function revokeAdmin(uid: string) {
    if (uid === session?.user.id) { Alert.alert('Нельзя снять права с себя'); return; }
    Alert.alert('Снять права админа?', '', [
      { text: 'Отмена' },
      { text: 'Снять', style: 'destructive', onPress: async () => {
        await supabase.rpc('admin_revoke_admin', { p_user_id: uid });
        load();
      }},
    ]);
  }

  async function logout() {
    await supabase.auth.signOut();
    // НЕ ставим setSession(null)/setProfile(null) и НЕ навигируем —
    // onAuthStateChange в app/_layout.tsx сам обработает и перенаправит
    // на /(auth)/login. Иначе re-render с session=null падает в дочерних
    // компонентах раньше чем Stack успеет перейти на login.
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={[s.scroll, { maxWidth: contentMaxWidth, alignSelf: 'center' as any, width: '100%' }]}>
        <Text style={s.title}>Профиль администратора</Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>Я</Text>
          <Text style={s.email}>{session?.user.email}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Сменить свой пароль</Text>
          <TextInput style={s.input} value={newPassword} onChangeText={setNewPassword} placeholder="Новый пароль (мин. 8)" placeholderTextColor={COLORS.textSecondary} secureTextEntry />
          <TouchableOpacity style={[s.btn, (savingPass || !newPassword) && { opacity: 0.5 }]} disabled={savingPass || !newPassword} onPress={changeOwnPassword}>
            {savingPass ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Сохранить пароль</Text>}
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Назначить админом существующего</Text>
          <Text style={s.help}>Если пользователь уже зарегистрирован — повысить до админа</Text>
          <TextInput style={s.input} value={grantEmail} onChangeText={setGrantEmail} placeholder="email@example.com" placeholderTextColor={COLORS.textSecondary} keyboardType="email-address" autoCapitalize="none" />
          <TouchableOpacity style={[s.btn, (granting || !grantEmail) && { opacity: 0.5 }]} disabled={granting || !grantEmail} onPress={grantAdmin}>
            <Text style={s.btnText}>Назначить</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Все админы · {admins.length}</Text>
            <TouchableOpacity style={s.createBtn} onPress={() => setCreateOpen(true)}>
              <UserPlus size={16} color={COLORS.primary} />
              <Text style={s.createText}>Создать</Text>
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color={COLORS.primary} /> : admins.map(a => (
            <View key={a.user_id} style={s.adminRow}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/admin-user/${a.user_id}`)}>
                <Text style={s.adminName}>{a.name || '—'}</Text>
                <Text style={s.adminEmail}>{a.email}</Text>
                <Text style={s.adminMeta}>с {format(new Date(a.created_at), 'd MMM yyyy', { locale: ru })}</Text>
              </TouchableOpacity>
              {a.user_id !== session?.user.id && (
                <TouchableOpacity style={s.iconBtn} onPress={() => revokeAdmin(a.user_id)}>
                  <ShieldOff size={16} color={COLORS.warning} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        <SettingsSection />

        <TouchableOpacity style={s.logout} onPress={logout}>
          <Text style={s.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <View style={s.modalRoot}>
          <View style={s.modal}>
            <Text style={s.cardTitle}>Создать нового админа</Text>
            <TextInput style={s.input} value={newEmail} onChangeText={setNewEmail} placeholder="Email" placeholderTextColor={COLORS.textSecondary} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={s.input} value={newAdminPass} onChangeText={setNewAdminPass} placeholder="Пароль" placeholderTextColor={COLORS.textSecondary} secureTextEntry />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border }]} onPress={() => setCreateOpen(false)}>
                <Text style={[s.btnText, { color: COLORS.text }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1 }, (creating || !newEmail || !newAdminPass) && { opacity: 0.5 }]} disabled={creating || !newEmail || !newAdminPass} onPress={createNewAdmin}>
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Создать</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, paddingHorizontal: 4 },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  email: { fontSize: 14, color: COLORS.textSecondary },
  help: { fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
  input: { backgroundColor: COLORS.background, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  btn: { height: 46, backgroundColor: COLORS.primary, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.primaryLight },
  createText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: COLORS.background, borderRadius: 10 },
  adminName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  adminEmail: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  adminMeta: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.warning + '15' },
  logout: { height: 48, backgroundColor: COLORS.white, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.error + '40' },
  logoutText: { color: COLORS.error, fontSize: 14, fontWeight: '600' },
  modalRoot: { flex: 1, justifyContent: 'center', backgroundColor: '#00000088', padding: 20 },
  modal: { backgroundColor: COLORS.background, padding: 20, borderRadius: 16, gap: 10 },
});

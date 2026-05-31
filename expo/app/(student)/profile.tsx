import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { StudentProfile } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';

export default function StudentProfileScreen() {
  const { session, setSession, setProfile: setStoreProfile } = useAuthStore();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (session) fetchProfile(); }, [session]);

  async function fetchProfile() {
    const { data } = await supabase.from('student_profiles').select('*').eq('user_id', session!.user.id).single();
    if (data) { setProfile(data); setName(data.name); }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from('student_profiles').update({ name }).eq('user_id', session!.user.id);
    setSaving(false);
    Alert.alert('Сохранено');
  }

  async function handleLogout() {
    Alert.alert('Выход', 'Вы уверены?', [
      { text: 'Отмена' },
      { text: 'Выйти', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setStoreProfile(null);
      }},
    ]);
  }

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <Text style={styles.email}>{session?.user.email}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ваше имя</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Введите имя"
            placeholderTextColor={COLORS.textSecondary}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Сохранить</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Аккаунт</Text>
          <Text style={styles.roleLabel}>Роль: Ученик 📚</Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, gap: 20 },
  avatarSection: { alignItems: 'center', paddingVertical: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarText: { fontSize: 32, fontWeight: '700', color: COLORS.primary },
  email: { fontSize: 14, color: COLORS.textSecondary },
  section: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  input: { height: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: COLORS.text },
  saveBtn: { height: 48, backgroundColor: COLORS.primary, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  roleLabel: { fontSize: 14, color: COLORS.textSecondary },
  logoutBtn: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.error + '40' },
  logoutText: { color: COLORS.error, fontWeight: '600', fontSize: 16 },
});

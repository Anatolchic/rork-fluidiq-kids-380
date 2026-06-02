import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { StudentProfile } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';
import SettingsSection from '../../components/SettingsSection';
import AvatarPicker from '../../components/AvatarPicker';
import { ru } from '../../lib/errors';
import { useResponsive } from '../../lib/responsive';

export default function StudentProfileScreen() {
  const { session, setSession, setProfile: setStoreProfile } = useAuthStore();
  const { isDesktop, contentMaxWidth } = useResponsive();
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
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: contentMaxWidth }]}>
        <View style={isDesktop ? styles.twoCols : undefined}>
          <View style={isDesktop ? styles.colLeft : undefined}>
            <View style={styles.avatarSection}>
              <AvatarPicker
                userId={session!.user.id}
                photoUrl={profile?.photo_url}
                name={name}
                onUpdate={async (url) => {
                  if (profile) setProfile({ ...profile, photo_url: url });
                  await supabase.from('student_profiles').upsert({ user_id: session!.user.id, photo_url: url, name: name || 'Ученик' }, { onConflict: 'user_id' });
                }}
                size={80}
              />
              <Text style={[styles.email, { marginTop: 10 }]}>{session?.user.email}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Аккаунт</Text>
              <Text style={styles.roleLabel}>Роль: Ученик 📚</Text>
            </View>
          </View>

          <View style={isDesktop ? styles.colRight : undefined}>
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

            <SettingsSection />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, gap: 20, alignSelf: 'center' as any, width: '100%' },
  twoCols: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  colLeft: { flex: 1, gap: 20 },
  colRight: { flex: 2, gap: 20 },
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

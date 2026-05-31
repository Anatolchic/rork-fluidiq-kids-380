import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { UserRole } from '../../lib/types';

export default function RoleSelectScreen() {
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!selected) { Alert.alert('Выберите роль'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/(auth)/login'); return; }

    const { error } = await supabase.from('user_roles').upsert({ user_id: user.id, role: selected });

    if (error) { Alert.alert('Ошибка', error.message); setLoading(false); return; }

    // Создаём профиль в зависимости от роли
    if (selected === 'student') {
      await supabase.from('student_profiles').upsert({
        user_id: user.id, name: user.email?.split('@')[0] || 'Ученик', favorites: [],
      });
      router.replace('/(student)');
    } else if (selected === 'tutor') {
      router.replace('/tutor-setup');
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>Кто вы?</Text>
          <Text style={styles.subtitle}>Выберите роль в приложении</Text>
        </View>

        <View style={styles.roles}>
          <TouchableOpacity
            style={[styles.roleCard, selected === 'student' && styles.roleCardSelected]}
            onPress={() => setSelected('student')}
          >
            <Text style={styles.roleEmoji}>📚</Text>
            <Text style={[styles.roleName, selected === 'student' && styles.roleNameSelected]}>Ученик</Text>
            <Text style={styles.roleDesc}>Ищу репетитора для обучения</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, selected === 'tutor' && styles.roleCardSelected]}
            onPress={() => setSelected('tutor')}
          >
            <Text style={styles.roleEmoji}>🎓</Text>
            <Text style={[styles.roleName, selected === 'tutor' && styles.roleNameSelected]}>Репетитор</Text>
            <Text style={styles.roleDesc}>Преподаю и принимаю учеников</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.btnContinue, !selected && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={!selected || loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Продолжить →</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 32, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary },
  roles: { gap: 16, marginBottom: 40 },
  roleCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 24,
    alignItems: 'center', borderWidth: 2, borderColor: COLORS.border,
  },
  roleCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  roleEmoji: { fontSize: 48, marginBottom: 8 },
  roleName: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  roleNameSelected: { color: COLORS.primary },
  roleDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  btnContinue: {
    height: 56, backgroundColor: COLORS.primary,
    borderRadius: 14, justifyContent: 'center', alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

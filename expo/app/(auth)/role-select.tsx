import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen, GraduationCap, Check } from 'lucide-react-native';
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
          <LinearGradient
            colors={[COLORS.primary, '#8B7FFF']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.logoWrap}
          >
            <GraduationCap size={75} color="#fff" strokeWidth={2.2} />
          </LinearGradient>
          <Text style={styles.title}>Кто вы?</Text>
          <Text style={styles.subtitle}>Выберите роль в приложении</Text>
        </View>

        <View style={styles.roles}>
          <Pressable
            style={({ pressed }) => [styles.roleCard, selected === 'student' && styles.roleCardSelected, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            onPress={() => setSelected('student')}
          >
            <LinearGradient
              colors={selected === 'student' ? [COLORS.primary, '#8B7FFF'] : ['#F5F7FA', '#E8EBF5']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.roleIconWrap}
            >
              <BookOpen size={36} color={selected === 'student' ? '#fff' : COLORS.primary} strokeWidth={2.2} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.roleName, selected === 'student' && styles.roleNameSelected]}>Ученик</Text>
              <Text style={styles.roleDesc}>Ищу репетитора для обучения</Text>
            </View>
            {selected === 'student' && (
              <View style={styles.checkCircle}>
                <Check size={16} color="#fff" strokeWidth={3} />
              </View>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.roleCard, selected === 'tutor' && styles.roleCardSelected, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            onPress={() => setSelected('tutor')}
          >
            <LinearGradient
              colors={selected === 'tutor' ? [COLORS.primary, '#8B7FFF'] : ['#F5F7FA', '#E8EBF5']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.roleIconWrap}
            >
              <GraduationCap size={36} color={selected === 'tutor' ? '#fff' : COLORS.primary} strokeWidth={2.2} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.roleName, selected === 'tutor' && styles.roleNameSelected]}>Репетитор</Text>
              <Text style={styles.roleDesc}>Преподаю и принимаю учеников</Text>
            </View>
            {selected === 'tutor' && (
              <View style={styles.checkCircle}>
                <Check size={16} color="#fff" strokeWidth={3} />
              </View>
            )}
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.btnContinueWrap, !selected && { opacity: 0.5 }, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          onPress={handleContinue}
          disabled={!selected || loading}
        >
          <LinearGradient
            colors={[COLORS.primary, '#8B7FFF']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.btnContinue}
            pointerEvents="none"
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Продолжить</Text>}
          </LinearGradient>
        </Pressable>
      </View>
    </SafeAreaView>
  );
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
  inner: { flex: 1, padding: 24, justifyContent: 'center', maxWidth: 480, alignSelf: 'center' as any, width: '100%' },
  header: { alignItems: 'center', marginBottom: 32 },
  logoWrap: {
    width: 88, height: 88, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 18,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginBottom: 6, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary },

  roles: { gap: 14, marginBottom: 28 },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.white, borderRadius: 18, padding: 18,
    borderWidth: 1.5, borderColor: 'transparent',
    ...cardShadow,
  },
  roleCardSelected: { borderColor: COLORS.primary, shadowOpacity: 0.18, shadowRadius: 18 },
  roleIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  roleName: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  roleNameSelected: { color: COLORS.primary },
  roleDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  checkCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },

  btnContinueWrap: { borderRadius: 16, overflow: 'hidden', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 4 },
  btnContinue: { height: 56, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

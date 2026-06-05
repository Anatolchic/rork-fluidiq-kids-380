import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GraduationCap, ArrowLeft, Check } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { ru } from '../../lib/errors';

const MINOR_CUTOFF_YEARS = 18;

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDate, setBirthDate] = useState(''); // YYYY-MM-DD
  const [parentEmail, setParentEmail] = useState('');
  const [parentName, setParentName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [parentAgreed, setParentAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const minorMode = useIsMinor(birthDate);

  async function handleRegister() {
    if (!email || !password || !confirmPassword) { Alert.alert('Заполните все поля'); return; }
    if (!agreed) { Alert.alert('Согласие', 'Подтвердите согласие с условиями и политикой ПДн'); return; }
    if (password !== confirmPassword) { Alert.alert('Пароли не совпадают'); return; }
    if (password.length < 6) { Alert.alert('Пароль минимум 6 символов'); return; }
    if (minorMode) {
      if (!parentEmail || !parentName) { Alert.alert('Заполните данные родителя/опекуна'); return; }
      if (!parentAgreed) { Alert.alert('Нужно согласие родителя/опекуна'); return; }
    }

    setLoading(true);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://web.repetitory-app.ru';
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${origin}/(auth)/role-select` },
    });
    if (error) { setLoading(false); Alert.alert('Ошибка', ru(error)); return; }

    // Если minor и сессия есть — апсёртим student_profiles с родителем
    if (minorMode && data.user && data.session) {
      await supabase.from('student_profiles').upsert({
        user_id: data.user.id,
        name: '',
        birth_date: birthDate,
        parent_name: parentName.trim(),
        parent_email: parentEmail.trim(),
        parent_consent_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } else if (birthDate && data.user && data.session) {
      // совершеннолетний — пишем birth_date
      await supabase.from('student_profiles').upsert({
        user_id: data.user.id,
        name: '',
        birth_date: birthDate,
      }, { onConflict: 'user_id' });
    }
    setLoading(false);

    if (data.session) {
      router.replace('/(auth)/role-select');
    } else {
      router.replace({ pathname: '/(auth)/verify-email', params: { email } });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <LinearGradient
              colors={[COLORS.primary, '#8B7FFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoWrap}
            >
              <GraduationCap size={75} color="#fff" strokeWidth={2.2} />
            </LinearGradient>
            <Text style={styles.title}>Репетиторы</Text>
          </View>

          <View style={styles.authTabs}>
            <Pressable
              style={({ pressed }) => [styles.authTab, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={styles.authTabText}>Вход</Text>
            </Pressable>
            <View style={[styles.authTab, styles.authTabActive]}>
              <Text style={styles.authTabTextActive}>Регистрация</Text>
            </View>
          </View>

          <View style={styles.form}>
            <TextInput style={styles.input} placeholder="Email" value={email}
              onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email"
              placeholderTextColor={COLORS.textSecondary} />
            <TextInput style={styles.input} placeholder="Пароль (минимум 6 символов)"
              value={password} onChangeText={setPassword} secureTextEntry
              placeholderTextColor={COLORS.textSecondary} />
            <TextInput style={styles.input} placeholder="Повторите пароль"
              value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry
              placeholderTextColor={COLORS.textSecondary} />

            <Text style={styles.label}>Дата рождения (опционально, ГГГГ-ММ-ДД)</Text>
            <TextInput style={styles.input} placeholder="1990-01-15" value={birthDate}
              onChangeText={setBirthDate} placeholderTextColor={COLORS.textSecondary} />

            {minorMode && (
              <View style={styles.minorBox}>
                <Text style={styles.minorTitle}>Несовершеннолетний пользователь</Text>
                <Text style={styles.minorSub}>Для регистрации до 18 лет требуется согласие родителя или законного представителя.</Text>
                <TextInput style={styles.input} placeholder="ФИО родителя / опекуна"
                  value={parentName} onChangeText={setParentName} placeholderTextColor={COLORS.textSecondary} />
                <TextInput style={styles.input} placeholder="Email родителя"
                  value={parentEmail} onChangeText={setParentEmail} keyboardType="email-address" autoCapitalize="none"
                  placeholderTextColor={COLORS.textSecondary} />
                <TouchableOpacity style={styles.agreeRow} onPress={() => setParentAgreed(!parentAgreed)} activeOpacity={0.7}>
                  <View style={[styles.checkbox, parentAgreed && styles.checkboxChecked]}>
                    {parentAgreed && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.agreeText}>Я, родитель/опекун, даю согласие на регистрацию ребёнка на платформе «Репетиторы» и обработку его персональных данных в соответствии с ФЗ-152.</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)} activeOpacity={0.7}>
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.agreeText}>
                Я согласен с{' '}
                <Text style={styles.agreeLink} onPress={() => Linking.openURL('https://repetitory-app.ru/terms.html')}>условиями использования</Text>
                {' '}и{' '}
                <Text style={styles.agreeLink} onPress={() => Linking.openURL('https://repetitory-app.ru/privacy.html')}>политикой обработки персональных данных</Text>
                {' '}в соответствии с ФЗ-152
              </Text>
            </TouchableOpacity>

            <Pressable
              style={({ pressed }) => [
                styles.btnPrimaryWrap,
                (!agreed || (minorMode && !parentAgreed)) && { opacity: 0.5 },
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={handleRegister}
              disabled={loading}
            >
              <LinearGradient
                colors={[COLORS.primary, '#8B7FFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.btnPrimary}
                pointerEvents="none"
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Зарегистрироваться</Text>}
              </LinearGradient>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useIsMinor(birthDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
  return ageYears < MINOR_CUTOFF_YEARS;
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
  inner: { flex: 1, padding: 24, maxWidth: 480, alignSelf: 'center' as any, width: '100%' },
  header: { marginBottom: 24, alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  logoWrap: {
    width: 88, height: 88, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.text, marginBottom: 6, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  form: { gap: 14 },
  authTabs: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 14, padding: 4, marginBottom: 20, shadowColor: '#0006', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  authTab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  authTabActive: { backgroundColor: COLORS.primary + '15' },
  authTabText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  authTabTextActive: { color: COLORS.primary, fontSize: 15, fontWeight: '800' },
  label: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '700', marginTop: 4, letterSpacing: 0.3 },
  input: {
    height: 56, borderRadius: 16, paddingHorizontal: 18, fontSize: 16,
    backgroundColor: COLORS.white, color: COLORS.text,
    borderWidth: 1, borderColor: 'transparent',
    ...cardShadow,
  },
  minorBox: { padding: 16, backgroundColor: COLORS.warning + '15', borderRadius: 16, borderWidth: 1, borderColor: COLORS.warning + '40', gap: 12, marginTop: 4 },
  minorTitle: { fontSize: 14, fontWeight: '800', color: COLORS.warning, letterSpacing: -0.2 },
  minorSub: { fontSize: 12, color: COLORS.text, lineHeight: 17 },
  btnPrimaryWrap: { marginTop: 8, borderRadius: 16, ...cardShadow },
  btnPrimary: { height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { color: COLORS.textSecondary, fontSize: 14 },
  footerLink: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 6 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginTop: 2, backgroundColor: COLORS.white },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  agreeText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  agreeLink: { color: COLORS.primary, fontWeight: '700', textDecorationLine: 'underline' },
});

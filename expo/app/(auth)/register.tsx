import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!email || !password || !confirmPassword) { Alert.alert('Ошибка', 'Заполните все поля'); return; }
    if (!agreed) { Alert.alert('Согласие', 'Подтвердите согласие с условиями использования и обработкой персональных данных'); return; }
    if (password !== confirmPassword) { Alert.alert('Ошибка', 'Пароли не совпадают'); return; }
    if (password.length < 6) { Alert.alert('Ошибка', 'Пароль минимум 6 символов'); return; }

    setLoading(true);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://web.repetitory-app.ru';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/(auth)/role-select` },
    });
    setLoading(false);

    if (error) { Alert.alert('Ошибка', error.message); return; }
    // Если auto-confirm в Supabase отключён — session=null, нужно подтверждение email
    if (data.session) {
      router.replace('/(auth)/role-select');
    } else {
      router.replace({ pathname: '/(auth)/verify-email', params: { email } });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.back}>
              <Text style={styles.backText}>← Назад</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Регистрация</Text>
            <Text style={styles.subtitle}>Создайте новый аккаунт</Text>
          </View>

          <View style={styles.form}>
            <TextInput style={styles.input} placeholder="Email" value={email}
              onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
              placeholderTextColor={COLORS.textSecondary} />
            <TextInput style={styles.input} placeholder="Пароль (минимум 6 символов)"
              value={password} onChangeText={setPassword} secureTextEntry
              placeholderTextColor={COLORS.textSecondary} />
            <TextInput style={styles.input} placeholder="Повторите пароль"
              value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry
              placeholderTextColor={COLORS.textSecondary} />

            <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)} activeOpacity={0.7}>
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.agreeText}>
                Я согласен с{' '}
                <Text style={styles.agreeLink} onPress={() => { if (typeof window !== 'undefined') window.open('https://repetitory-app.ru/terms.html', '_blank'); }}>условиями использования</Text>
                {' '}и{' '}
                <Text style={styles.agreeLink} onPress={() => { if (typeof window !== 'undefined') window.open('https://repetitory-app.ru/privacy.html', '_blank'); }}>политикой обработки персональных данных</Text>
                {' '}в соответствии с ФЗ-152.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btnPrimary, (!agreed || loading) && { opacity: 0.5 }]} onPress={handleRegister} disabled={!agreed || loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Зарегистрироваться</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Уже есть аккаунт? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.footerLink}>Войти</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, padding: 24, maxWidth: 480, alignSelf: 'center' as any, width: '100%' },
  header: { marginBottom: 32 },
  back: { marginBottom: 16 },
  backText: { color: COLORS.primary, fontSize: 16 },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary },
  form: { gap: 12 },
  input: {
    height: 52, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, fontSize: 16,
    backgroundColor: COLORS.white, color: COLORS.text,
  },
  btnPrimary: {
    height: 52, backgroundColor: COLORS.primary,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { color: COLORS.textSecondary, fontSize: 14 },
  footerLink: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8, marginBottom: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  agreeText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  agreeLink: { color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' },
});

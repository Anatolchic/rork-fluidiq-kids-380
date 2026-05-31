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
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!email || !password || !confirmPassword) { Alert.alert('Ошибка', 'Заполните все поля'); return; }
    if (password !== confirmPassword) { Alert.alert('Ошибка', 'Пароли не совпадают'); return; }
    if (password.length < 6) { Alert.alert('Ошибка', 'Пароль минимум 6 символов'); return; }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: 'repetitory://auth/callback' },
    });
    setLoading(false);

    if (error) { Alert.alert('Ошибка', error.message); return; }
    Alert.alert(
      'Проверьте почту',
      'Мы отправили письмо для подтверждения email. После подтверждения выберите роль.',
      [{ text: 'OK', onPress: () => router.replace('/(auth)/role-select') }]
    );
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

            <TouchableOpacity style={styles.btnPrimary} onPress={handleRegister} disabled={loading}>
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
  inner: { flex: 1, padding: 24 },
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
});

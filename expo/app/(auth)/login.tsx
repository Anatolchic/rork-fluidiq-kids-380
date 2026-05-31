import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useResponsive } from '../../lib/responsive';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { contentMaxWidth } = useResponsive();

  async function handleLogin() {
    if (!email || !password) { Alert.alert('Ошибка', 'Заполните все поля'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Ошибка входа', error.message);
  }

  async function handleAppleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'apple' });
    if (error) Alert.alert('Ошибка', error.message);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>🎓</Text>
          <Text style={styles.title}>Репетиторы</Text>
          <Text style={styles.subtitle}>Войдите в свой аккаунт</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={COLORS.textSecondary}
          />
          <TextInput
            style={styles.input}
            placeholder="Пароль"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor={COLORS.textSecondary}
          />

          <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Войти</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
            <Text style={styles.forgotLink}>Забыли пароль?</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>или</Text>
            <View style={styles.dividerLine} />
          </View>

          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.btnApple} onPress={handleAppleLogin}>
              <Text style={styles.btnAppleText}>  Войти через Apple</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Нет аккаунта? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.footerLink}>Зарегистрироваться</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, padding: 24, justifyContent: 'center', maxWidth: 480, alignSelf: 'center' as any, width: '100%' },
  forgotLink: { color: COLORS.primary, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 6 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 64, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary },
  form: { gap: 12 },
  input: {
    height: 52, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, fontSize: 16,
    backgroundColor: COLORS.white, color: COLORS.text,
  },
  btnPrimary: {
    height: 52, backgroundColor: COLORS.primary,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    marginTop: 4,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 12, color: COLORS.textSecondary, fontSize: 14 },
  btnApple: {
    height: 52, backgroundColor: '#000',
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  btnAppleText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { color: COLORS.textSecondary, fontSize: 14 },
  footerLink: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});

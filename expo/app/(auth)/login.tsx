import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Fingerprint } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useResponsive } from '../../lib/responsive';
import { ru } from '../../lib/errors';
import {
  authenticate, getBiometricKind, isBiometricEnabled, isBiometricSupported,
  getCredentials, saveCredentials, saveSessionTokens, setBiometricPrompted, wasBiometricPrompted,
} from '../../lib/biometric';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioKind, setBioKind] = useState<'face' | 'fingerprint' | 'iris' | null>(null);
  const { contentMaxWidth } = useResponsive();

  useEffect(() => {
    (async () => {
      const [enabled, kind, supported] = await Promise.all([
        isBiometricEnabled(),
        getBiometricKind(),
        isBiometricSupported(),
      ]);
      setBioEnabled(enabled && supported);
      setBioKind(kind);
    })();
  }, []);

  async function handleLogin() {
    if (!email || !password) { Alert.alert('Заполните все поля'); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) { Alert.alert('Ошибка входа', ru(error)); return; }

    // После успешного логина — спросить про биометрию (один раз на пользователя)
    if (Platform.OS !== 'web' && data.session) {
      const supported = await isBiometricSupported();
      const userId = data.user?.id ?? null;
      const alreadyPrompted = await wasBiometricPrompted(userId);
      if (supported && !alreadyPrompted) {
        const kind = await getBiometricKind();
        const label = kind === 'face' ? 'Face ID' : kind === 'fingerprint' ? 'Touch ID' : 'биометрию';
        Alert.alert(
          `Включить вход по ${label}?`,
          'Быстрый вход — без ввода пароля каждый раз. Можно отключить в профиле.',
          [
            { text: 'Не сейчас', style: 'cancel', onPress: () => setBiometricPrompted(userId) },
            { text: 'Включить', onPress: async () => {
              await saveCredentials({ email: email.trim(), password });
              if (data.session.access_token && data.session.refresh_token) {
                await saveSessionTokens({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token });
              }
              await setBiometricPrompted(userId);
            }},
          ]
        );
      }
    }
  }

  async function handleBioLogin() {
    const auth = await authenticate('Войти в Репетиторы');
    if (!auth.success) {
      if (auth.error && auth.error !== 'Отменено') Alert.alert('Биометрия', auth.error);
      return;
    }
    const creds = await getCredentials();
    if (!creds) { Alert.alert('Нет сохранённого пароля', 'Войдите по email/паролю и снова включите биометрию'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: creds.email, password: creds.password });
    setLoading(false);
    if (error) Alert.alert('Ошибка входа', ru(error));
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.inner, { maxWidth: contentMaxWidth as any }]}>
        <View style={styles.header}>
          <Text style={styles.logo}>📚</Text>
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
            autoComplete="email"
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

          {bioEnabled && Platform.OS !== 'web' && (
            <TouchableOpacity style={styles.btnBio} onPress={handleBioLogin} disabled={loading}>
              <Fingerprint size={20} color={COLORS.primary} />
              <Text style={styles.btnBioText}>Войти через {bioKind === 'face' ? 'Face ID' : 'Touch ID'}</Text>
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
  inner: { flex: 1, padding: 24, justifyContent: 'center', alignSelf: 'center' as any, width: '100%' },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary },
  form: { gap: 12 },
  input: { height: 52, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: COLORS.white, color: COLORS.text },
  btnPrimary: { height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  forgotLink: { color: COLORS.primary, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 6 },
  btnBio: { height: 52, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 4 },
  btnBioText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { color: COLORS.textSecondary, fontSize: 14 },
  footerLink: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});

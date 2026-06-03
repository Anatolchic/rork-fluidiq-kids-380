import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Fingerprint, GraduationCap, Mail, Lock } from 'lucide-react-native';
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
  useResponsive();

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.inner, { maxWidth: 480 }]}>
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
          <Text style={styles.subtitle}>Войдите в свой аккаунт</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <Mail size={18} color={COLORS.textSecondary} />
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
          </View>

          <View style={styles.inputWrap}>
            <Lock size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.btnPrimaryWrap,
              { transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            <LinearGradient
              colors={[COLORS.primary, '#8B7FFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.btnPrimary}
              pointerEvents="none"
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Войти</Text>}
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(auth)/forgot-password')}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Text style={styles.forgotLink}>Забыли пароль?</Text>
          </Pressable>

          {bioEnabled && Platform.OS !== 'web' && (
            <Pressable
              style={({ pressed }) => [
                styles.btnBio,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={handleBioLogin}
              disabled={loading}
            >
              <Fingerprint size={20} color={COLORS.primary} />
              <Text style={styles.btnBioText}>Войти через {bioKind === 'face' ? 'Face ID' : 'Touch ID'}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Нет аккаунта? </Text>
          <Pressable
            onPress={() => router.push('/(auth)/register')}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Text style={styles.footerLink}>Зарегистрироваться</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  inner: { flex: 1, padding: 28, justifyContent: 'center', alignSelf: 'center' as any, width: '100%' },
  header: { alignItems: 'center', marginBottom: 40 },
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
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 56,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    ...cardShadow,
  },
  input: { flex: 1, fontSize: 16, color: COLORS.text },
  btnPrimaryWrap: { marginTop: 6, borderRadius: 16, ...cardShadow },
  btnPrimary: { height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  forgotLink: { color: COLORS.primary, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
  btnBio: {
    height: 56, backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.primary + '50',
    justifyContent: 'center', alignItems: 'center',
    flexDirection: 'row', gap: 8, marginTop: 4,
  },
  btnBioText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { color: COLORS.textSecondary, fontSize: 14 },
  footerLink: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
});

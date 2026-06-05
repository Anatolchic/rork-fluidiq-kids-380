import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Pressable, ScrollView, Linking, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Fingerprint, GraduationCap, Mail, Lock, Eye, EyeOff, Check } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useResponsive } from '../../lib/responsive';
import { ru } from '../../lib/errors';
import {
  authenticate, getBiometricKind, isBiometricEnabled, isBiometricSupported,
  getCredentials, saveCredentials, saveSessionTokens, setBiometricPrompted, wasBiometricPrompted,
} from '../../lib/biometric';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioKind, setBioKind] = useState<'face' | 'fingerprint' | 'iris' | null>(null);
  useResponsive();

  useEffect(() => {
    (async () => {
      const [kind, supported] = await Promise.all([
        getBiometricKind(),
        isBiometricSupported(),
      ]);
      // На native показываем кнопку биометрии всегда, если устройство
      // поддерживает Face ID/Touch ID. Если креды не сохранены — кнопка
      // подскажет сначала войти по паролю.
      setBioEnabled(supported);
      setBioKind(kind);
    })();
  }, []);

  async function handleLogin() {
    if (!email || !password) { Alert.alert('Заполните все поля'); return; }
    setLoading(true);

    let resp: any = null;
    let timedOut = false;
    try {
      resp = await Promise.race([
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        new Promise((_, reject) => setTimeout(() => { timedOut = true; reject(new Error('timeout')); }, 15000)),
      ]);
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Ошибка входа', timedOut ? 'Сервер не отвечает. Проверь интернет и попробуй снова.' : String(e?.message || e));
      return;
    }
    setLoading(false);

    const { data, error } = resp;
    if (error) { Alert.alert('Ошибка входа', ru(error)); return; }
    if (!data?.session) { Alert.alert('Ошибка входа', 'Сессия не получена'); return; }

    if (Platform.OS === 'web') {
      setTimeout(() => router.replace('/'), 100);
      return;
    }

    if (data.session) {
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

  async function handleRegister() {
    if (!email || !password || !confirmPassword) { Alert.alert('Заполните все поля'); return; }
    if (password !== confirmPassword) { Alert.alert('Пароли не совпадают'); return; }
    if (password.length < 6) { Alert.alert('Пароль', 'Минимум 6 символов'); return; }
    if (!agreed) { Alert.alert('Согласие', 'Подтвердите согласие с условиями и политикой обработки персональных данных'); return; }

    setLoading(true);
    const origin = typeof window !== 'undefined' ? (window as any).location?.origin : 'https://web.repetitory-app.ru';
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${origin}/(auth)/role-select` },
    });
    setLoading(false);
    if (error) { Alert.alert('Ошибка', ru(error)); return; }
    if (data.session) {
      router.replace('/(auth)/role-select');
    } else {
      router.replace({ pathname: '/(auth)/verify-email', params: { email } });
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

  const isRegister = mode === 'register';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.inner, { maxWidth: 480 }]}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
              style={({ pressed }) => [styles.authTab, !isRegister && styles.authTabActive, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => setMode('login')}
            >
              <Text style={!isRegister ? styles.authTabTextActive : styles.authTabText}>Вход</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.authTab, isRegister && styles.authTabActive, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => setMode('register')}
            >
              <Text style={isRegister ? styles.authTabTextActive : styles.authTabText}>Регистрация</Text>
            </Pressable>
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
                secureTextEntry={!showPass}
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={10} style={styles.eyeBtn}>
                {showPass ? <EyeOff size={18} color={COLORS.textSecondary} /> : <Eye size={18} color={COLORS.textSecondary} />}
              </TouchableOpacity>
            </View>

            {isRegister && (
              <>
                <View style={styles.inputWrap}>
                  <Lock size={18} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Повторите пароль"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirm}
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={10} style={styles.eyeBtn}>
                    {showConfirm ? <EyeOff size={18} color={COLORS.textSecondary} /> : <Eye size={18} color={COLORS.textSecondary} />}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(v => !v)} activeOpacity={0.7}>
                  <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                    {agreed && <Check size={14} color="#fff" strokeWidth={3} />}
                  </View>
                  <Text style={styles.agreeText}>
                    Я согласен с{' '}
                    <Text style={styles.agreeLink} onPress={() => Linking.openURL('https://repetitory-app.ru/terms.html')}>
                      условиями использования
                    </Text>
                    {' '}и{' '}
                    <Text style={styles.agreeLink} onPress={() => Linking.openURL('https://repetitory-app.ru/privacy.html')}>
                      политикой обработки персональных данных
                    </Text>
                    {' '}(ФЗ-152)
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.btnPrimaryWrap,
                (isRegister && !agreed) && { opacity: 0.5 },
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={isRegister ? handleRegister : handleLogin}
              disabled={loading || (isRegister && !agreed)}
            >
              <LinearGradient
                colors={[COLORS.primary, '#8B7FFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.btnPrimary}
                pointerEvents="none"
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>{isRegister ? 'Зарегистрироваться' : 'Войти'}</Text>}
              </LinearGradient>
            </Pressable>

            {!isRegister && (
              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Text style={styles.forgotLink}>Забыли пароль?</Text>
              </Pressable>
            )}

            {!isRegister && bioEnabled && Platform.OS !== 'web' && (
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
        </ScrollView>
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
  header: { alignItems: 'center', marginBottom: 30 },
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
  eyeBtn: { padding: 4 },
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
  authTabs: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 14, padding: 4, marginBottom: 20, ...cardShadow },
  authTab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  authTabActive: { backgroundColor: COLORS.primary + '15' },
  authTabText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  authTabTextActive: { color: COLORS.primary, fontSize: 15, fontWeight: '800' },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: COLORS.border, backgroundColor: COLORS.white,
    justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  agreeText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  agreeLink: { color: COLORS.primary, fontWeight: '700' },
});

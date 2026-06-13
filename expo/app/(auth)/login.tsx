import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Pressable, ScrollView, Linking,
  TouchableOpacity, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  // 18% от высоты экрана сверху до верха лого, снизу — breathing room.
  const topPad = Math.max(0, screenHeight * 0.18 - insets.top);
  const bottomPad = Math.max(0, screenHeight * 0.18 - insets.bottom);

  useEffect(() => {
    (async () => {
      const [kind, supported] = await Promise.all([
        getBiometricKind(),
        isBiometricSupported(),
      ]);
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

    const check = await supabase.rpc('check_email_exists', { p_email: email.trim() });
    if (check.data && check.data.exists && check.data.confirmed) {
      setLoading(false);
      Alert.alert(
        'Такой email уже зарегистрирован',
        'Войдите по паролю или восстановите его через «Забыли пароль?»',
        [
          { text: 'Восстановить пароль', onPress: () => router.push('/(auth)/forgot-password') },
          { text: 'Войти', onPress: () => setMode('login') },
        ]
      );
      return;
    }

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
        style={styles.kav}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.inner}>

          {/* ── ШАПКА: лого + переключатель (фиксированы, не зависят от формы) ── */}
          <View style={[styles.topSection, { paddingTop: topPad }]}>
            <View style={styles.header}>
              <LinearGradient
                colors={[COLORS.primary, '#8B7FFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoWrap}
              >
                <GraduationCap size={62} color="#fff" strokeWidth={2.2} />
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
          </View>

          {/* ── ФОРМА + КНОПКА: один ScrollView, кнопка прямо под полями ── */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.form}>

              <View style={styles.inputWrap}>
                <Mail size={16} color={COLORS.textSecondary} />
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
                <Lock size={16} color={COLORS.textSecondary} />
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
                  {showPass ? <EyeOff size={16} color={COLORS.textSecondary} /> : <Eye size={16} color={COLORS.textSecondary} />}
                </TouchableOpacity>
              </View>

              {/* Повтор пароля — всегда в DOM, скрыт в режиме входа */}
              <View
                style={[styles.inputWrap, !isRegister && styles.invisible]}
                pointerEvents={!isRegister ? 'none' : 'auto'}
              >
                <Lock size={16} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Повторите пароль"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                  editable={isRegister}
                />
                <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={10} style={styles.eyeBtn}>
                  {showConfirm ? <EyeOff size={16} color={COLORS.textSecondary} /> : <Eye size={16} color={COLORS.textSecondary} />}
                </TouchableOpacity>
              </View>

              {/* Согласие — всегда в DOM, скрыто в режиме входа */}
              <View
                style={!isRegister ? styles.invisible : undefined}
                pointerEvents={!isRegister ? 'none' : 'auto'}
              >
                <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(v => !v)} activeOpacity={0.7}>
                  <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                    {agreed && <Check size={12} color="#fff" strokeWidth={3} />}
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
              </View>

              {/* Забыли пароль — всегда в DOM, скрыт в режиме регистрации */}
              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                style={({ pressed }) => ({ opacity: isRegister ? 0 : (pressed ? 0.5 : 1) })}
                pointerEvents={isRegister ? 'none' : 'auto'}
              >
                <Text style={styles.forgotLink}>Забыли пароль?</Text>
              </Pressable>

              {/* Биометрия — только native, всегда занимает место */}
              {Platform.OS !== 'web' && (
                !isRegister && bioEnabled ? (
                  <Pressable
                    style={({ pressed }) => [styles.btnBio, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                    onPress={handleBioLogin}
                    disabled={loading}
                  >
                    <Fingerprint size={18} color={COLORS.primary} />
                    <Text style={styles.btnBioText}>Войти через {bioKind === 'face' ? 'Face ID' : 'Touch ID'}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.bioPlaceholder} />
                )
              )}

              {/* ── КНОПКА: прямо под последним полем ── */}
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
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnPrimaryText}>{isRegister ? 'Зарегистрироваться' : 'Войти'}</Text>
                  }
                </LinearGradient>
              </Pressable>

            </View>
          </ScrollView>

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
  kav: { flex: 1 },
  inner: { flex: 1, maxWidth: 480, alignSelf: 'center' as any, width: '100%' },

  // Фиксированная шапка — лого и таб-переключатель
  topSection: { paddingHorizontal: 24 },
  header: { alignItems: 'center', marginBottom: 16 },
  logoWrap: {
    width: 76, height: 76, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  authTabs: {
    flexDirection: 'row', backgroundColor: COLORS.white,
    borderRadius: 10, padding: 3, ...cardShadow,
  },
  authTab: { flex: 1, height: 30, justifyContent: 'center', alignItems: 'center', borderRadius: 7 },
  authTabActive: { backgroundColor: COLORS.primary + '15' },
  authTabText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  authTabTextActive: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },

  // Зона с полями — ScrollView обеспечивает клавиатурный отступ
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 12 },

  // Форма — все поля и кнопка идут подряд
  form: { gap: 12 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 48,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    ...cardShadow,
  },
  input: { flex: 1, fontSize: 14, color: COLORS.text },
  eyeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  // Кнопки и ссылки
  btnPrimaryWrap: { borderRadius: 14, ...cardShadow },
  btnPrimary: { height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  forgotLink: { color: COLORS.primary, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 4 },
  bioPlaceholder: { height: 44 },
  btnBio: {
    height: 44, backgroundColor: COLORS.white, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.primary + '50',
    justifyContent: 'center', alignItems: 'center',
    flexDirection: 'row', gap: 8,
  },
  btnBioText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },

  // Согласие
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5,
    borderColor: COLORS.border, backgroundColor: COLORS.white,
    justifyContent: 'center', alignItems: 'center', marginTop: 1,
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  agreeText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  agreeLink: { color: COLORS.primary, fontWeight: '700' },

  invisible: { opacity: 0 },
});

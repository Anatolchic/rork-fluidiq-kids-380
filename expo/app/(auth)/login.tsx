import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Pressable, ScrollView, Linking, TouchableOpacity,
  useWindowDimensions,
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
  const { height: sh } = useWindowDimensions();

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

  // Proportional layout: zone = 64% of screen height
  const zone = sh * 0.64;
  // topPad pushes content down so logo top = 18% from absolute screen top
  const topPad = Math.max(0, sh * 0.18 - insets.top);
  // bottomPad ensures button bottom = 18% from absolute screen bottom in register mode
  const bottomPad = Math.max(0, sh * 0.18 - insets.bottom);

  // Element heights as fractions of zone (register mode sums to ~1.000)
  const logoH     = zone * 0.170;
  const gLogoTtl  = zone * 0.035;
  const titleH    = zone * 0.065;
  const gTtlTabs  = zone * 0.025;
  const tabsH     = zone * 0.074;
  const gTabsForm = zone * 0.045;
  const inputH    = zone * 0.104;
  const gField    = zone * 0.021;
  const agreeH    = zone * 0.089;
  const btnH      = zone * 0.100;

  // Interior sizes derived from element heights
  const logoIcon    = logoH  * 0.78;
  const logoR       = logoH  * 0.28;
  const titleFS     = titleH * 0.80;
  const tabFS       = (tabsH - 6) * 0.42;
  const tabR        = tabsH  * 0.28;
  const inputR      = inputH * 0.29;
  const inputPH     = inputH * 0.25;
  const inputIcon   = inputH * 0.32;
  const inputFS     = inputH * 0.27;
  const eyeSize     = inputH * 0.55;
  const checkSz     = agreeH * 0.38;
  const agreeFS     = Math.max(11, agreeH * 0.25);
  const agreeLH     = Math.max(15, agreeH * 0.32);
  const btnR        = btnH   * 0.28;
  const btnFS       = btnH   * 0.30;

  const shadow = {
    shadowColor: '#0006' as string,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  };

  const inputStyle = {
    height: inputH,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: COLORS.white,
    borderRadius: inputR,
    paddingHorizontal: inputPH,
    gap: inputPH * 0.6,
    ...shadow,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View style={{ maxWidth: 480, alignSelf: 'center', width: '100%', paddingHorizontal: 24 }}>

            <View style={{ height: topPad }} />

            {/* Logo */}
            <View style={{ height: logoH, alignItems: 'center', justifyContent: 'center' }}>
              <LinearGradient
                colors={[COLORS.primary, '#8B7FFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: logoH, height: logoH, borderRadius: logoR,
                  justifyContent: 'center', alignItems: 'center',
                  shadowColor: COLORS.primary,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
                }}
              >
                <GraduationCap size={logoIcon} color="#fff" strokeWidth={2.2} />
              </LinearGradient>
            </View>

            <View style={{ height: gLogoTtl }} />

            {/* Title */}
            <View style={{ height: titleH, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: titleFS, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 }}>
                Репетиторы
              </Text>
            </View>

            <View style={{ height: gTtlTabs }} />

            {/* Mode tabs */}
            <View style={{ height: tabsH, flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: tabR, padding: 3, ...shadow }}>
              {(['login', 'register'] as Mode[]).map(m => {
                const active = mode === m;
                return (
                  <Pressable
                    key={m}
                    style={({ pressed }) => ({
                      flex: 1,
                      justifyContent: 'center' as const,
                      alignItems: 'center' as const,
                      borderRadius: tabR * 0.78,
                      backgroundColor: active ? COLORS.primary + '15' : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                    onPress={() => setMode(m)}
                  >
                    <Text style={{ color: active ? COLORS.primary : COLORS.textSecondary, fontSize: tabFS, fontWeight: active ? '800' : '700' }}>
                      {m === 'login' ? 'Вход' : 'Регистрация'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: gTabsForm }} />

            {/* Email */}
            <View style={inputStyle}>
              <Mail size={inputIcon} color={COLORS.textSecondary} />
              <TextInput
                style={{ flex: 1, fontSize: inputFS, color: COLORS.text }}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>

            <View style={{ height: gField }} />

            {/* Password */}
            <View style={inputStyle}>
              <Lock size={inputIcon} color={COLORS.textSecondary} />
              <TextInput
                style={{ flex: 1, fontSize: inputFS, color: COLORS.text }}
                placeholder="Пароль"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPass(v => !v)}
                hitSlop={10}
                style={{ width: eyeSize, height: eyeSize, alignItems: 'center', justifyContent: 'center' }}
              >
                {showPass ? <EyeOff size={inputIcon} color={COLORS.textSecondary} /> : <Eye size={inputIcon} color={COLORS.textSecondary} />}
              </TouchableOpacity>
            </View>

            {/* Register-only: confirm + agree */}
            {isRegister && (
              <>
                <View style={{ height: gField }} />

                {/* Confirm password */}
                <View style={inputStyle}>
                  <Lock size={inputIcon} color={COLORS.textSecondary} />
                  <TextInput
                    style={{ flex: 1, fontSize: inputFS, color: COLORS.text }}
                    placeholder="Повторите пароль"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirm}
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirm(v => !v)}
                    hitSlop={10}
                    style={{ width: eyeSize, height: eyeSize, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {showConfirm ? <EyeOff size={inputIcon} color={COLORS.textSecondary} /> : <Eye size={inputIcon} color={COLORS.textSecondary} />}
                  </TouchableOpacity>
                </View>

                <View style={{ height: gField }} />

                {/* Agree */}
                <TouchableOpacity
                  style={{ height: agreeH, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  onPress={() => setAgreed(v => !v)}
                  activeOpacity={0.7}
                >
                  <View style={{
                    width: checkSz, height: checkSz, borderRadius: checkSz * 0.27, flexShrink: 0,
                    borderWidth: 1.5, borderColor: agreed ? COLORS.primary : COLORS.border,
                    backgroundColor: agreed ? COLORS.primary : COLORS.white,
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    {agreed && <Check size={checkSz * 0.55} color="#fff" strokeWidth={3} />}
                  </View>
                  <Text style={{ flex: 1, fontSize: agreeFS, color: COLORS.textSecondary, lineHeight: agreeLH }}>
                    Я согласен с{' '}
                    <Text style={{ color: COLORS.primary, fontWeight: '700' }} onPress={() => Linking.openURL('https://repetitory-app.ru/terms.html')}>
                      условиями использования
                    </Text>
                    {' '}и{' '}
                    <Text style={{ color: COLORS.primary, fontWeight: '700' }} onPress={() => Linking.openURL('https://repetitory-app.ru/privacy.html')}>
                      политикой обработки персональных данных
                    </Text>
                    {' '}(ФЗ-152)
                  </Text>
                </TouchableOpacity>

                <View style={{ height: gField }} />
              </>
            )}

            {!isRegister && <View style={{ height: gField }} />}

            {/* Primary button */}
            <Pressable
              style={({ pressed }) => ({
                height: btnH,
                borderRadius: btnR,
                opacity: (isRegister && !agreed) ? 0.5 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
                ...shadow,
              })}
              onPress={isRegister ? handleRegister : handleLogin}
              disabled={loading || (isRegister && !agreed)}
            >
              <LinearGradient
                colors={[COLORS.primary, '#8B7FFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, borderRadius: btnR, justifyContent: 'center', alignItems: 'center' }}
                pointerEvents="none"
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: btnFS, fontWeight: '700', letterSpacing: 0.3 }}>
                      {isRegister ? 'Зарегистрироваться' : 'Войти'}
                    </Text>}
              </LinearGradient>
            </Pressable>

            {/* Login-only extras */}
            {!isRegister && (
              <>
                <Pressable
                  onPress={() => router.push('/(auth)/forgot-password')}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <Text style={{ color: COLORS.primary, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 8 }}>
                    Забыли пароль?
                  </Text>
                </Pressable>

                {Platform.OS !== 'web' && bioEnabled && (
                  <Pressable
                    style={({ pressed }) => ({
                      height: btnH,
                      backgroundColor: COLORS.white,
                      borderRadius: btnR,
                      borderWidth: 1.5,
                      borderColor: COLORS.primary + '50',
                      justifyContent: 'center' as const,
                      alignItems: 'center' as const,
                      flexDirection: 'row' as const,
                      gap: 8,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    })}
                    onPress={handleBioLogin}
                    disabled={loading}
                  >
                    <Fingerprint size={btnH * 0.37} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: btnFS * 0.87, fontWeight: '700' }}>
                      Войти через {bioKind === 'face' ? 'Face ID' : 'Touch ID'}
                    </Text>
                  </Pressable>
                )}
              </>
            )}

            {/* 18% bottom spacer in register mode */}
            {isRegister && <View style={{ height: bottomPad }} />}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

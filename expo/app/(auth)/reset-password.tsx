import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GraduationCap, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { ru } from '../../lib/errors';

const CODE_LENGTH = 6;

export default function ResetPassword() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function handleChange(idx: number, value: string) {
    const clean = value.replace(/\D/g, '');
    if (clean.length > 1) {
      const arr = clean.slice(0, CODE_LENGTH).split('');
      const next = Array(CODE_LENGTH).fill('');
      arr.forEach((c, i) => { next[i] = c; });
      setCode(next);
      inputsRef.current[Math.min(arr.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    const next = [...code]; next[idx] = clean; setCode(next);
    if (clean && idx < CODE_LENGTH - 1) inputsRef.current[idx + 1]?.focus();
  }

  function handleKey(idx: number, key: string) {
    if (key === 'Backspace' && !code[idx] && idx > 0) inputsRef.current[idx - 1]?.focus();
  }

  async function submit() {
    const token = code.join('');
    if (token.length !== CODE_LENGTH) { Alert.alert('Введите 6 цифр кода'); return; }
    if (!email) { Alert.alert('Email потерян — вернитесь к «Забыли пароль»'); return; }
    if (pwd.length < 8) { Alert.alert('Пароль', 'Минимум 8 символов'); return; }
    if (pwd !== pwd2) { Alert.alert('Пароли не совпадают'); return; }
    setLoading(true);
    // Шаг 1: верифицируем OTP (создаст сессию)
    const verify = await supabase.auth.verifyOtp({ email: String(email), token, type: 'recovery' });
    if (verify.error) { setLoading(false); Alert.alert('Неверный код', ru(verify.error)); return; }
    // Шаг 2: меняем пароль
    const upd = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (upd.error) { Alert.alert('Ошибка', ru(upd.error)); return; }
    Alert.alert('Пароль изменён', 'Войдите с новым паролем', [{ text: 'OK', onPress: async () => {
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    }}]);
  }

  async function resendCode() {
    if (!email || cooldown > 0) return;
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(String(email));
    setResending(false);
    if (error) Alert.alert('Ошибка', ru(error));
    else { setCooldown(60); Alert.alert('Код отправлен заново'); }
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.inner}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <LinearGradient colors={[COLORS.primary, '#8B7FFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.logoWrap}>
              <GraduationCap size={75} color="#fff" strokeWidth={2.2} />
            </LinearGradient>
            <Text style={s.title}>Новый пароль</Text>
            <Text style={s.sub}>Введите код из письма и новый пароль</Text>
            {!!email && <Text style={s.email}>{String(email)}</Text>}
          </View>

          <View style={s.codeRow}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <TextInput
                key={i}
                ref={el => { inputsRef.current[i] = el; }}
                style={[s.cell, code[i] && s.cellFilled]}
                value={code[i]}
                onChangeText={v => handleChange(i, v)}
                onKeyPress={e => handleKey(i, e.nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                autoFocus={i === 0}
                selectTextOnFocus
                textContentType="oneTimeCode"
              />
            ))}
          </View>

          <View style={s.inputWrap}>
            <Lock size={18} color={COLORS.textSecondary} />
            <TextInput
              style={s.input}
              value={pwd}
              onChangeText={setPwd}
              placeholder="Новый пароль"
              placeholderTextColor={COLORS.textSecondary}
              secureTextEntry={!showPwd}
              autoComplete="new-password"
            />
            <TouchableOpacity onPress={() => setShowPwd(v => !v)} hitSlop={10}>
              {showPwd ? <EyeOff size={18} color={COLORS.textSecondary} /> : <Eye size={18} color={COLORS.textSecondary} />}
            </TouchableOpacity>
          </View>

          <View style={s.inputWrap}>
            <Lock size={18} color={COLORS.textSecondary} />
            <TextInput
              style={s.input}
              value={pwd2}
              onChangeText={setPwd2}
              placeholder="Повторите пароль"
              placeholderTextColor={COLORS.textSecondary}
              secureTextEntry={!showPwd2}
              autoComplete="new-password"
            />
            <TouchableOpacity onPress={() => setShowPwd2(v => !v)} hitSlop={10}>
              {showPwd2 ? <EyeOff size={18} color={COLORS.textSecondary} /> : <Eye size={18} color={COLORS.textSecondary} />}
            </TouchableOpacity>
          </View>

          <View style={s.warnBox}>
            <AlertCircle size={16} color={COLORS.warning} />
            <Text style={s.warnText}>Если кода в почте нет — проверь папку «Спам»</Text>
          </View>

          <TouchableOpacity style={[s.btn, (loading || code.some(c => !c) || !pwd || !pwd2) && { opacity: 0.5 }]} disabled={loading || code.some(c => !c) || !pwd || !pwd2} onPress={submit}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Сохранить пароль</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={resendCode} disabled={resending || cooldown > 0} style={{ marginTop: 14 }}>
            <Text style={[s.link, (cooldown > 0 || resending) && { opacity: 0.5 }]}>
              {cooldown > 0 ? `Выслать заново через ${cooldown} сек` : (resending ? 'Отправляем…' : 'Выслать код заново')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={{ marginTop: 18 }}>
            <Text style={s.linkBack}>← Назад ко входу</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, maxWidth: 480, alignSelf: 'center' as any, width: '100%' },
  header: { alignItems: 'center', marginBottom: 24 },
  logoWrap: {
    width: 88, height: 88, borderRadius: 28, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 6, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: COLORS.textSecondary },
  email: { fontSize: 14, color: COLORS.text, fontWeight: '700', marginTop: 4 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 14 },
  cell: {
    flex: 1, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.white, textAlign: 'center', fontSize: 22, fontWeight: '800',
    color: COLORS.primary,
  },
  cellFilled: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '08' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 56,
    backgroundColor: COLORS.white, borderRadius: 16, paddingHorizontal: 16,
    marginBottom: 12, borderWidth: 1, borderColor: 'transparent',
    shadowColor: '#0006', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3,
  },
  input: { flex: 1, fontSize: 16, color: COLORS.text },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.warning + '15', borderRadius: 12, padding: 12, marginVertical: 8 },
  warnText: { flex: 1, fontSize: 13, color: COLORS.text },
  btn: { height: 56, backgroundColor: COLORS.primary, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 6, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  link: { color: COLORS.primary, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  linkBack: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});

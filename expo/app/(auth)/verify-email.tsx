import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GraduationCap, AlertCircle } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { ru } from '../../lib/errors';

const CODE_LENGTH = 6;

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef<(TextInput | null)[]>([]);
  const { width: winW, height: winH } = useWindowDimensions();
  const headerTop = Math.round(winH * 0.10);
  const w = Math.min(winW, 440);
  const logoSize = Math.round(w * 0.224);
  const iconSize = Math.round(logoSize * 0.85);
  const titleFont = Math.round(w * 0.066);
  const inputFont = Math.round(w * 0.041);

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
      const lastIdx = Math.min(arr.length, CODE_LENGTH - 1);
      inputsRef.current[lastIdx]?.focus();
      if (arr.length === CODE_LENGTH) verify(arr.join(''));
      return;
    }
    const next = [...code]; next[idx] = clean; setCode(next);
    if (clean && idx < CODE_LENGTH - 1) inputsRef.current[idx + 1]?.focus();
    if (clean && idx === CODE_LENGTH - 1 && next.every(c => c)) verify(next.join(''));
  }

  function handleKey(idx: number, key: string) {
    if (key === 'Backspace' && !code[idx] && idx > 0) inputsRef.current[idx - 1]?.focus();
  }

  async function verify(token?: string) {
    const finalToken = token || code.join('');
    if (finalToken.length !== CODE_LENGTH) { Alert.alert('Введите 6 цифр'); return; }
    if (!email) { Alert.alert('Нет email — вернитесь к регистрации'); return; }
    setVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({ email: String(email), token: finalToken, type: 'signup' });
    setVerifying(false);
    if (error) {
      Alert.alert('Неверный код', ru(error));
      setCode(Array(CODE_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
      return;
    }
    if (data.session) router.replace('/(auth)/role-select');
    else router.replace('/(auth)/login');
  }

  async function resend() {
    if (!email || cooldown > 0) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: String(email) });
    setResending(false);
    if (error) Alert.alert('Ошибка', ru(error));
    else { setCooldown(60); Alert.alert('Код отправлен заново'); }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: headerTop, paddingHorizontal: 24, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <LinearGradient
              colors={[COLORS.primary, '#8B7FFF']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.logoWrap, { width: logoSize, height: logoSize, borderRadius: Math.round(logoSize * 0.32) }]}
            >
              <GraduationCap size={iconSize} color="#fff" strokeWidth={2.2} />
            </LinearGradient>
            <Text style={[styles.title, { fontSize: titleFont }]}>Подтверждение почты</Text>
            <Text style={styles.sub}>Мы отправили код на</Text>
            <Text style={styles.email}>{email}</Text>
          </View>

          <View style={styles.codeRow}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <TextInput
                key={i}
                ref={el => { inputsRef.current[i] = el; }}
                style={[styles.cell, code[i] && styles.cellFilled, Platform.OS === 'web' && { outlineWidth: 0 } as any]}
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

          <View style={styles.warnBox}>
            <AlertCircle size={16} color={COLORS.warning} />
            <Text style={styles.warnText}>Если письма нет в течение минуты — проверь папку «Спам»</Text>
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, (verifying || code.some(c => !c)) && { opacity: 0.5 }]}
            disabled={verifying || code.some(c => !c)}
            onPress={() => verify()}
          >
            {verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Подтвердить</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={resend} disabled={resending || cooldown > 0} style={{ marginTop: 14 }}>
            <Text style={[styles.link, (cooldown > 0 || resending) && { opacity: 0.5 }]}>
              {cooldown > 0 ? `Выслать заново через ${cooldown} сек` : (resending ? 'Отправляем…' : 'Выслать код заново')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={{ marginTop: 18 }}>
            <Text style={styles.linkBack}>← Назад ко входу</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, maxWidth: 480, alignSelf: 'center' as any, width: '100%' },
  header: { alignItems: 'center', marginBottom: 28 },
  logoWrap: {
    width: 88, height: 88, borderRadius: 28, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 8, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: COLORS.textSecondary },
  email: { fontSize: 15, color: COLORS.text, fontWeight: '700', marginTop: 4 },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18, maxWidth: 360, alignSelf: 'center', width: '100%' },
  cell: {
    width: 48, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.white, textAlign: 'center', fontSize: 24, fontWeight: '800',
    color: COLORS.primary,
  },
  cellFilled: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '08' },
  warnBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.warning + '15', borderRadius: 12, padding: 12, marginBottom: 18,
  },
  warnText: { flex: 1, fontSize: 13, color: COLORS.text },
  btnPrimary: {
    height: 56, backgroundColor: COLORS.primary, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  link: { color: COLORS.primary, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  linkBack: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});

import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useResponsive } from '../../lib/responsive';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { contentMaxWidth } = useResponsive();

  async function submit() {
    if (!email.trim()) { Alert.alert('Введите email'); return; }
    setLoading(true);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://web.repetitory-app.ru';
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/(auth)/reset-password`,
    });
    setLoading(false);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    setSent(true);
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[s.content, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
          <Text style={s.title}>Восстановление пароля</Text>
          {!sent ? (
            <>
              <Text style={s.sub}>Введите email — мы отправим ссылку для сброса пароля</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              <TouchableOpacity style={[s.btn, (loading || !email) && { opacity: 0.5 }]} disabled={loading || !email} onPress={submit}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Отправить ссылку</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.successBox}>
              <Text style={s.successEmoji}>📧</Text>
              <Text style={s.successTitle}>Письмо отправлено</Text>
              <Text style={s.successSub}>Проверьте почту {email}. Если письма нет — посмотрите в «Спам».</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.link}>← Назад ко входу</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 12 },
  input: { backgroundColor: COLORS.white, borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text },
  btn: { height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  link: { color: COLORS.primary, fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 16 },
  successBox: { alignItems: 'center', gap: 8, padding: 16, backgroundColor: COLORS.success + '15', borderRadius: 14, borderWidth: 1, borderColor: COLORS.success + '40' },
  successEmoji: { fontSize: 48 },
  successTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  successSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 18 },
});

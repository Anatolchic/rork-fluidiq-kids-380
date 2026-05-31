import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useResponsive } from '../../lib/responsive';

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [resending, setResending] = useState(false);
  const { contentMaxWidth } = useResponsive();

  async function resend() {
    if (!email) return;
    setResending(true);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://web.repetitory-app.ru';
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${origin}/(auth)/role-select` } });
    setResending(false);
    if (error) Alert.alert('Ошибка', error.message);
    else Alert.alert('Письмо отправлено повторно');
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={[s.content, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
        <Text style={s.emoji}>📧</Text>
        <Text style={s.title}>Проверьте почту</Text>
        <Text style={s.sub}>Мы отправили письмо на <Text style={s.bold}>{email}</Text> со ссылкой подтверждения. Откройте письмо и кликните по ссылке.</Text>
        <Text style={s.hint}>Если письма нет в течение пары минут — посмотрите в «Спам».</Text>
        <TouchableOpacity style={[s.btn, resending && { opacity: 0.5 }]} disabled={resending} onPress={resend}>
          {resending ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Выслать письмо ещё раз</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
          <Text style={s.link}>← Ко входу</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 14 },
  emoji: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  sub: { fontSize: 15, color: COLORS.text, textAlign: 'center', lineHeight: 22, maxWidth: 400 },
  bold: { fontWeight: '700' },
  hint: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  btn: { height: 48, paddingHorizontal: 24, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  link: { color: COLORS.primary, fontSize: 14, fontWeight: '600', marginTop: 12 },
});

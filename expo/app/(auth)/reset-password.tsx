import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useResponsive } from '../../lib/responsive';

export default function ResetPassword() {
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  useResponsive();

  useEffect(() => {
    // Supabase Auth ставит сессию из ?access_token= в hash. Дождёмся session.
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  async function submit() {
    if (pwd.length < 8) { Alert.alert('Пароль минимум 8 символов'); return; }
    if (pwd !== pwd2) { Alert.alert('Пароли не совпадают'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    Alert.alert('Пароль изменён', 'Войдите с новым паролем', [{ text: 'OK', onPress: async () => {
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    }}]);
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[s.content, { maxWidth: 480, alignSelf: 'center', width: '100%' }]}>
          <Text style={s.title}>Новый пароль</Text>
          {!ready ? (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={s.sub}>Проверка ссылки…</Text>
              <Text style={s.help}>Если страница долго не реагирует — ссылка устарела. Запросите новую через «Забыли пароль».</Text>
            </View>
          ) : (
            <>
              <TextInput style={s.input} value={pwd} onChangeText={setPwd} placeholder="Новый пароль" placeholderTextColor={COLORS.textSecondary} secureTextEntry autoComplete="new-password" />
              <TextInput style={s.input} value={pwd2} onChangeText={setPwd2} placeholder="Повторите пароль" placeholderTextColor={COLORS.textSecondary} secureTextEntry autoComplete="new-password" />
              <TouchableOpacity style={[s.btn, (loading || !pwd) && { opacity: 0.5 }]} disabled={loading || !pwd} onPress={submit}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Сохранить</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 24, justifyContent: 'center', gap: 14 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  help: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 16 },
  input: { backgroundColor: COLORS.white, borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text },
  btn: { height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

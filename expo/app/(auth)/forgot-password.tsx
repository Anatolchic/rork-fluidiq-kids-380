import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GraduationCap, Mail } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { ru } from '../../lib/errors';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  const headerTop = Math.round(winH * 0.12);
  const w = Math.min(winW, 440);
  const logoSize = Math.round(w * 0.224);
  const iconSize = Math.round(logoSize * 0.85);
  const titleFont = Math.round(w * 0.066);
  const inputFont = Math.round(w * 0.041);
  const inputH = Math.round(w * 0.143);

  async function submit() {
    if (!email.trim()) { Alert.alert('Введите email'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (error) { Alert.alert('Ошибка', ru(error)); return; }
    router.replace({ pathname: '/(auth)/reset-password', params: { email: email.trim() } });
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.inner}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: headerTop, paddingHorizontal: 24, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <LinearGradient colors={[COLORS.primary, '#8B7FFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.logoWrap, { width: logoSize, height: logoSize, borderRadius: Math.round(logoSize * 0.32) }]}>
              <GraduationCap size={iconSize} color="#fff" strokeWidth={2.2} />
            </LinearGradient>
            <Text style={[s.title, { fontSize: titleFont }]}>Восстановление пароля</Text>
            <Text style={s.sub}>Введите email — отправим код для сброса пароля</Text>
          </View>

          <View style={[s.inputWrap, { height: inputH }]}>
            <Mail size={Math.round(inputFont * 1.15)} color={COLORS.textSecondary} />
            <TextInput
              style={[s.input, { fontSize: inputFont }]}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <TouchableOpacity style={[s.btn, { height: inputH }, (loading || !email) && { opacity: 0.5 }]} disabled={loading || !email} onPress={submit}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnText, { fontSize: inputFont }]}>Отправить код</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14 }}>
            <Text style={s.link}>← Назад ко входу</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, maxWidth: 480, alignSelf: 'center' as any, width: '100%' },
  header: { alignItems: 'center', marginBottom: 28 },
  logoWrap: {
    width: 88, height: 88, borderRadius: 28, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 8, letterSpacing: -0.5, textAlign: 'center' },
  sub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 56,
    backgroundColor: COLORS.white, borderRadius: 16, paddingHorizontal: 16,
    marginBottom: 14, borderWidth: 1, borderColor: 'transparent',
    shadowColor: '#0006', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3,
  },
  input: { flex: 1, fontSize: 16, color: COLORS.text },
  btn: { height: 56, backgroundColor: COLORS.primary, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  link: { color: COLORS.primary, fontSize: 14, fontWeight: '600', textAlign: 'center' },
});

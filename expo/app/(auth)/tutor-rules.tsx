import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { COLORS, PLATFORM_RULES } from '../../lib/constants';
import supabase from '../../lib/supabase';

export default function TutorRulesScreen() {
  const [agreedRules, setAgreedRules] = useState(false);
  const [agreedPD, setAgreedPD] = useState(false);

  async function handleAgree() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('student_profiles').delete().eq('user_id', user.id);
    await supabase.from('tutor_profiles').upsert({ user_id: user.id, name: user.email?.split('@')[0] || 'Репетитор' });
    router.replace('/tutor-setup');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Правила платформы</Text>
        <Text style={styles.subtitle}>Пожалуйста, ознакомьтесь перед регистрацией</Text>
      </View>

      <ScrollView style={styles.rulesBox} showsVerticalScrollIndicator={false}>
        <Text style={styles.rulesText}>{PLATFORM_RULES}</Text>
      </ScrollView>

      <View style={styles.checks}>
        <TouchableOpacity style={styles.checkRow} onPress={() => setAgreedRules(!agreedRules)}>
          <View style={[styles.checkbox, agreedRules && styles.checkboxChecked]}>
            {agreedRules && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>Я прочитал(а) и согласен(а) с правилами платформы</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.checkRow} onPress={() => setAgreedPD(!agreedPD)}>
          <View style={[styles.checkbox, agreedPD && styles.checkboxChecked]}>
            {agreedPD && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>Согласен(а) на обработку персональных данных в соответствии с ФЗ-152</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.btn, (!agreedRules || !agreedPD) && styles.btnDisabled]}
        onPress={handleAgree}
        disabled={!agreedRules || !agreedPD}
      >
        <Text style={styles.btnText}>Согласен(а), продолжить →</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary },
  rulesBox: { flex: 1, backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  rulesText: { fontSize: 14, color: COLORS.text, lineHeight: 22 },
  checks: { gap: 12, marginBottom: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  checkLabel: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20 },
  btn: { height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

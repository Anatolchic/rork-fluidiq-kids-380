import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, TextInput, Alert, Switch, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import supabase from '../../lib/supabase';
import { COLORS, SUBJECTS, LEVELS, LESSON_DURATIONS, PAYMENT_METHODS } from '../../lib/constants';
import { TutorProfile, LessonDuration, PaymentMethod } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';

export default function TutorProfileScreen() {
  const { session, setSession, setProfile: setStoreProfile } = useAuthStore();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (session) load(); }, [session]);

  async function load() {
    const { data } = await supabase.from('tutor_profiles').select('*').eq('user_id', session!.user.id).single();
    setProfile(data);
    setLoading(false);
  }

  function patch(p: Partial<TutorProfile>) {
    if (!profile) return;
    setProfile({ ...profile, ...p });
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    try {
      const ext = res.assets[0].uri.split('.').pop() || 'jpg';
      const filename = `${session!.user.id}/avatar.${ext}`;
      const blob = await (await fetch(res.assets[0].uri)).blob();
      const { error } = await supabase.storage.from('avatars').upload(filename, blob, { upsert: true, contentType: `image/${ext}` });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(filename);
      patch({ photo_url: data.publicUrl });
      Alert.alert('Фото обновлено', 'Не забудьте нажать «Сохранить»');
    } catch (e: any) {
      Alert.alert('Не удалось загрузить', e.message);
    }
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('tutor_profiles').update({
      name: profile.name,
      photo_url: profile.photo_url,
      bio: profile.bio,
      subjects: profile.subjects,
      levels: profile.levels,
      price_per_hour: profile.price_per_hour,
      min_duration: profile.min_duration,
      experience_years: profile.experience_years,
      education: profile.education,
      auto_confirm: profile.auto_confirm,
      payment_method: profile.payment_method,
      payment_details: profile.payment_details,
    }).eq('user_id', session!.user.id);
    setSaving(false);
    if (error) { Alert.alert('Ошибка', error.message); return; }
    Alert.alert('Сохранено');
  }

  async function logout() {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена' },
      { text: 'Выйти', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setStoreProfile(null);
        router.replace('/(auth)/login');
      }},
    ]);
  }

  if (loading || !profile) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Профиль</Text>

        <View style={styles.card}>
          <TouchableOpacity style={styles.avatarRow} onPress={pickPhoto}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile.name?.charAt(0)?.toUpperCase() || 'Р'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.email}>{session?.user.email}</Text>
              <Text style={styles.avatarHint}>Нажмите чтобы изменить фото</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Имя</Text>
          <TextInput style={styles.input} value={profile.name} onChangeText={v => patch({ name: v })} placeholderTextColor={COLORS.textSecondary} />

          <Text style={styles.label}>О себе</Text>
          <TextInput style={[styles.input, styles.textarea]} value={profile.bio} onChangeText={v => patch({ bio: v })} multiline maxLength={500} placeholderTextColor={COLORS.textSecondary} />
          <Text style={styles.helper}>{profile.bio?.length || 0}/500</Text>

          <Text style={styles.label}>Образование</Text>
          <TextInput style={styles.input} value={profile.education} onChangeText={v => patch({ education: v })} placeholderTextColor={COLORS.textSecondary} />

          <Text style={styles.label}>Опыт работы (лет)</Text>
          <TextInput style={styles.input} value={String(profile.experience_years)} onChangeText={v => patch({ experience_years: Number(v) || 0 })} keyboardType="number-pad" placeholderTextColor={COLORS.textSecondary} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Предметы</Text>
          <View style={styles.chipsWrap}>
            {SUBJECTS.map(s => (
              <TouchableOpacity key={s} style={[styles.chip, profile.subjects.includes(s) && styles.chipActive]} onPress={() => patch({ subjects: profile.subjects.includes(s) ? profile.subjects.filter(x => x !== s) : [...profile.subjects, s] as any })}>
                <Text style={[styles.chipText, profile.subjects.includes(s) && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Уровни учеников</Text>
          <View style={styles.chipsWrap}>
            {LEVELS.map(l => (
              <TouchableOpacity key={l} style={[styles.chip, profile.levels.includes(l) && styles.chipActive]} onPress={() => patch({ levels: profile.levels.includes(l) ? profile.levels.filter(x => x !== l) : [...profile.levels, l] as any })}>
                <Text style={[styles.chipText, profile.levels.includes(l) && styles.chipTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Цена и длительность</Text>
          <Text style={styles.label}>Цена урока (₽/час)</Text>
          <TextInput style={styles.input} value={String(profile.price_per_hour / 100)} onChangeText={v => patch({ price_per_hour: Math.round(Number(v) * 100) || 0 })} keyboardType="number-pad" placeholderTextColor={COLORS.textSecondary} />
          <Text style={styles.label}>Минимальная длительность</Text>
          <View style={styles.durRow}>
            {LESSON_DURATIONS.map(d => (
              <TouchableOpacity key={d.value} style={[styles.durBtn, profile.min_duration === d.value && styles.durBtnActive]} onPress={() => patch({ min_duration: d.value as LessonDuration })}>
                <Text style={[styles.durText, profile.min_duration === d.value && styles.durTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Авто-подтверждение</Text>
              <Text style={styles.helper}>Заявки сразу попадают в «Подтверждённые», без ручного одобрения</Text>
            </View>
            <Switch value={profile.auto_confirm} onValueChange={v => patch({ auto_confirm: v })} trackColor={{ true: COLORS.primary, false: COLORS.border }} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Способ получения оплаты от учеников</Text>
          <Text style={styles.helper}>Ученики платят вам напрямую за уроки. Эти реквизиты видны только ученикам после подтверждения брони.</Text>
          {PAYMENT_METHODS.map(p => (
            <TouchableOpacity key={p.value} style={[styles.payItem, profile.payment_method === p.value && styles.payItemActive]} onPress={() => patch({ payment_method: p.value as PaymentMethod })}>
              <View style={[styles.radio, profile.payment_method === p.value && styles.radioActive]}>
                {profile.payment_method === p.value && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.payLabel}>{p.label}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.label}>Реквизиты</Text>
          <TextInput style={styles.input} value={profile.payment_details} onChangeText={v => patch({ payment_details: v })} placeholderTextColor={COLORS.textSecondary} />
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} disabled={saving} onPress={save}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Сохранить</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, paddingHorizontal: 4, marginVertical: 8 },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 26, fontWeight: '700', color: COLORS.primary },
  email: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  avatarHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 4 },
  helper: { fontSize: 11, color: COLORS.textSecondary, alignSelf: 'flex-end' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.background },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  durRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  durBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, minWidth: 70, alignItems: 'center' },
  durBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  durText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  durTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  payItemActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  radioActive: { borderColor: COLORS.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  payLabel: { fontSize: 14, color: COLORS.text, flex: 1 },
  saveBtn: { height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  logoutBtn: { height: 48, backgroundColor: COLORS.white, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.error + '40' },
  logoutText: { color: COLORS.error, fontSize: 15, fontWeight: '600' },
});

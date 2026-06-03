import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, SafeAreaView, ActivityIndicator, TextInput, Alert, Switch, Platform } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { ShieldCheck, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS, SUBJECTS, SUBJECT_CATEGORIES, LEVELS, LESSON_DURATIONS, PAYMENT_METHODS, subjectCategoryOf } from '../../lib/constants';
import { TutorProfile, LessonDuration, PaymentMethod } from '../../lib/types';
import { useAuthStore } from '../../stores/auth';
import AvatarPicker from '../../components/AvatarPicker';
import SettingsSection from '../../components/SettingsSection';
import { ru } from '../../lib/errors';
import { useResponsive } from '../../lib/responsive';

export default function TutorProfileScreen() {
  const { session, setSession, setProfile: setStoreProfile } = useAuthStore();
  const { contentMaxWidth, isDesktop } = useResponsive();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  function toggleCategory(key: string) {
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleSubject(s: string) {
    if (!profile) return;
    const has = profile.subjects.includes(s);
    patch({ subjects: (has ? profile.subjects.filter(x => x !== s) : [...profile.subjects, s]) as any });
  }

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

  async function onPhotoUpdate(url: string) {
    patch({ photo_url: url });
    // Сохраним сразу, чтобы фото не потерялось при перезагрузке
    await supabase.from('tutor_profiles').update({ photo_url: url }).eq('user_id', session!.user.id);
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
        // onAuthStateChange в _layout сам перенаправит на login
      }},
    ]);
  }

  if (!session || loading || !profile) return <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: contentMaxWidth }]}>
        <Text style={styles.title}>Профиль</Text>

        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <AvatarPicker userId={session!.user.id} photoUrl={profile.photo_url} name={profile.name} onUpdate={onPhotoUpdate} size={72} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.email}>{session?.user.email}</Text>
              <Text style={styles.avatarHint}>Тапни по фото чтобы изменить</Text>
            </View>
          </View>
        </View>

        {/* Верификация */}
        {(profile as any).is_verified ? (
          <View style={[styles.card, styles.verifiedCard]}>
            <ShieldCheck size={28} color={COLORS.success} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.verifiedTitle}>Профиль верифицирован</Text>
              {(profile as any).verified_at && (
                <Text style={styles.verifiedDate}>
                  с {format(new Date((profile as any).verified_at), 'd MMMM yyyy', { locale: ruLocale })}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.verifyCard} onPress={() => router.push('/verification')}>
            <ShieldCheck size={24} color={COLORS.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.verifyTitle}>Подать на верификацию</Text>
              <Text style={styles.verifyHint}>Бейдж «Верифицирован» в каталоге повысит доверие учеников</Text>
            </View>
            <ChevronRight size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}

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
          <View style={styles.subjectsHeader}>
            <Text style={styles.cardTitle}>Предметы</Text>
            <Text style={styles.subjectsCounter}>Выбрано: {profile.subjects.length}</Text>
          </View>

          {/* Выбранные предметы — отдельная плашка для быстрого удаления */}
          {profile.subjects.length > 0 && (
            <View style={styles.selectedWrap}>
              {profile.subjects.map(s => (
                <Pressable
                  key={`sel-${s}`}
                  onPress={() => toggleSubject(s)}
                  style={({ pressed }) => [styles.selectedChip, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.selectedChipText}>{s}  ✕</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Категории — раскрываемые группы */}
          {SUBJECT_CATEGORIES.map(cat => {
            const isOpen = !!expandedCategories[cat.key];
            const countInCat = profile.subjects.filter(s => subjectCategoryOf(s) === cat.key).length;
            return (
              <View key={cat.key} style={styles.catGroup}>
                <Pressable
                  onPress={() => toggleCategory(cat.key)}
                  style={({ pressed }) => [styles.catHeader, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.catHeaderText}>
                    {cat.emoji}  {cat.label}
                    {countInCat > 0 && <Text style={styles.catCount}>  · {countInCat}</Text>}
                  </Text>
                  {isOpen
                    ? <ChevronUp size={18} color={COLORS.textSecondary} />
                    : <ChevronDown size={18} color={COLORS.textSecondary} />
                  }
                </Pressable>
                {isOpen && (
                  <View style={styles.chipsWrap}>
                    {cat.subjects.map(s => {
                      const active = profile.subjects.includes(s);
                      return (
                        <Pressable
                          key={s}
                          onPress={() => toggleSubject(s)}
                          style={({ pressed }) => [
                            styles.chip,
                            active && styles.chipActive,
                            pressed && { transform: [{ scale: 0.97 }] },
                          ]}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
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

        <SettingsSection />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 14, paddingBottom: 32, maxWidth: 720, alignSelf: 'center' as any, width: '100%' },
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
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  subjectsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subjectsCounter: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  selectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 6, paddingHorizontal: 4, backgroundColor: COLORS.primaryLight, borderRadius: 10, marginVertical: 4 },
  selectedChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: COLORS.primary },
  selectedChipText: { fontSize: 12, color: COLORS.white, fontWeight: '700' },
  catGroup: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, marginTop: 4 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  catHeaderText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  catCount: { color: COLORS.primary, fontWeight: '700' },
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
  verifiedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.success + '15', borderWidth: 1, borderColor: COLORS.success + '40' },
  verifiedTitle: { fontSize: 15, fontWeight: '700', color: COLORS.success },
  verifiedDate: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  verifyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.primary + '40' },
  verifyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  verifyHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
});

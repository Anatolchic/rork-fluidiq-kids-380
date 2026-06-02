import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Pressable, ScrollView, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { X, Search } from 'lucide-react-native';
import supabase from '../lib/supabase';
import { COLORS, SUBJECTS, SUBJECT_CATEGORIES, LEVELS, LESSON_DURATIONS, PAYMENT_METHODS, subjectCategoryOf } from '../lib/constants';
import { useAuthStore } from '../stores/auth';
import { useResponsive } from '../lib/responsive';

const STEPS = 6;

export default function TutorSetup() {
  const { session, setProfile } = useAuthStore();
  useResponsive();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [priceRub, setPriceRub] = useState('1000');
  const [minDuration, setMinDuration] = useState<30 | 45 | 60 | 90>(60);
  const [experienceYears, setExperienceYears] = useState('1');
  const [education, setEducation] = useState('');
  const [bio, setBio] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'phone' | 'bank' | 'phone_top' | 'other'>('card');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(SUBJECT_CATEGORIES[0]?.key || 'school');
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [modalSearch, setModalSearch] = useState('');

  const currentCategorySubjects = useMemo(() => {
    const cat = SUBJECT_CATEGORIES.find(c => c.key === selectedCategory);
    return cat ? cat.subjects : [];
  }, [selectedCategory]);

  const modalGroups = useMemo(() => {
    const s = modalSearch.trim().toLowerCase();
    if (!s) return SUBJECT_CATEGORIES;
    return SUBJECT_CATEGORIES
      .map(c => ({ ...c, subjects: c.subjects.filter(x => x.toLowerCase().includes(s)) }))
      .filter(c => c.subjects.length > 0);
  }, [modalSearch]);

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) setPhotoUri(res.assets[0].uri);
  }

  function toggleSubject(s: string) {
    setSubjects(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }
  function toggleLevel(l: string) {
    setLevels(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);
  }

  function canProceed(): boolean {
    if (step === 1) return name.trim().length >= 2;
    if (step === 2) return subjects.length > 0;
    if (step === 3) return levels.length > 0;
    if (step === 4) return Number(priceRub) >= 100;
    if (step === 5) return education.trim().length >= 3 && bio.trim().length >= 20;
    if (step === 6) return paymentDetails.trim().length >= 3;
    return false;
  }

  async function uploadPhoto(userId: string): Promise<string | null> {
    if (!photoUri) return null;
    try {
      const ext = photoUri.split('.').pop() || 'jpg';
      const filename = `${userId}/avatar.${ext}`;
      const blob = await (await fetch(photoUri)).blob();
      const { error } = await supabase.storage.from('avatars').upload(filename, blob, { upsert: true, contentType: `image/${ext}` });
      if (error) { console.warn('upload photo failed', error.message); return null; }
      const { data } = supabase.storage.from('avatars').getPublicUrl(filename);
      return data.publicUrl;
    } catch (e) {
      console.warn('photo upload err', e);
      return null;
    }
  }

  async function handleFinish() {
    if (!session?.user) return;
    setSaving(true);
    try {
      const photoUrl = await uploadPhoto(session.user.id);
      const { error: roleError } = await supabase.from('user_roles').upsert({ user_id: session.user.id, role: 'tutor' }, { onConflict: 'user_id' });
      if (roleError) throw roleError;
      const { error: profileError } = await supabase.from('tutor_profiles').upsert({
        user_id: session.user.id,
        name: name.trim(),
        photo_url: photoUrl,
        bio: bio.trim(),
        subjects,
        levels,
        price_per_hour: Math.round(Number(priceRub) * 100),
        min_duration: minDuration,
        experience_years: Number(experienceYears) || 0,
        education: education.trim(),
        payment_method: paymentMethod,
        payment_details: paymentDetails.trim(),
        is_published: false,
      }, { onConflict: 'user_id' });
      if (profileError) throw profileError;
      setProfile({ userId: session.user.id, role: 'tutor' });
      router.replace('/(tutor)');
    } catch (e: any) {
      Alert.alert('Не удалось сохранить', e.message || 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.progressRow}>
            {Array.from({ length: STEPS }).map((_, i) => (
              <View key={i} style={[styles.progressDot, i + 1 <= step && styles.progressDotActive]} />
            ))}
          </View>
          <Text style={styles.stepLabel}>Шаг {step} из {STEPS}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <View style={styles.section}>
              <Text style={styles.title}>Имя и фото</Text>
              <Text style={styles.subtitle}>Так ученики увидят вас в каталоге</Text>
              <TouchableOpacity style={styles.avatarPicker} onPress={pickPhoto}>
                {photoUri ? (
                  <View style={styles.avatarFilled}>
                    <Text style={styles.avatarFilledText}>📷 Изменить</Text>
                  </View>
                ) : (
                  <Text style={styles.avatarPlaceholder}>📷{'\n'}Выбрать фото</Text>
                )}
              </TouchableOpacity>
              <TextInput style={styles.input} placeholder="Имя и Фамилия" value={name} onChangeText={setName} placeholderTextColor={COLORS.textSecondary} />
            </View>
          )}

          {step === 2 && (
            <View style={styles.section}>
              <Text style={styles.title}>Какие предметы преподаёте?</Text>
              <Text style={styles.subtitle}>Выбрано: {subjects.length}</Text>

              {/* Выбранные — отдельная плашка */}
              {subjects.length > 0 && (
                <View style={styles.selectedWrap}>
                  {subjects.map(s => (
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

              {/* Селектор категории */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                {SUBJECT_CATEGORIES.map(c => {
                  const active = selectedCategory === c.key;
                  return (
                    <Pressable
                      key={c.key}
                      onPress={() => setSelectedCategory(c.key)}
                      style={({ pressed }) => [
                        styles.catBtn,
                        active && styles.catBtnActive,
                        pressed && { transform: [{ scale: 0.97 }] },
                      ]}
                    >
                      <Text style={[styles.catBtnText, active && styles.catBtnTextActive]}>
                        {c.emoji} {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Чипы предметов выбранной категории */}
              <View style={styles.chipsWrap}>
                {currentCategorySubjects.map(s => {
                  const active = subjects.includes(s);
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

              <Pressable
                onPress={() => setShowAllSubjects(true)}
                style={({ pressed }) => [styles.showAllBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.showAllBtnText}>Показать все категории →</Text>
              </Pressable>
            </View>
          )}

          {step === 3 && (
            <View style={styles.section}>
              <Text style={styles.title}>С какими уровнями работаете?</Text>
              <Text style={styles.subtitle}>Выбрано: {levels.length}</Text>
              <View style={styles.chipsWrap}>
                {LEVELS.map(l => (
                  <TouchableOpacity key={l} style={[styles.chip, levels.includes(l) && styles.chipActive]} onPress={() => toggleLevel(l)}>
                    <Text style={[styles.chipText, levels.includes(l) && styles.chipTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {step === 4 && (
            <View style={styles.section}>
              <Text style={styles.title}>Стоимость урока</Text>
              <Text style={styles.subtitle}>Цена за 60 минут</Text>
              <View style={styles.priceRow}>
                <TextInput style={styles.priceInput} value={priceRub} onChangeText={setPriceRub} keyboardType="number-pad" placeholderTextColor={COLORS.textSecondary} />
                <Text style={styles.priceCurrency}>₽/час</Text>
              </View>
              <Text style={styles.subtitle}>Минимальная длительность урока</Text>
              <View style={styles.durationRow}>
                {LESSON_DURATIONS.map(d => (
                  <TouchableOpacity key={d.value} style={[styles.durationBtn, minDuration === d.value && styles.durationBtnActive]} onPress={() => setMinDuration(d.value as any)}>
                    <Text style={[styles.durationText, minDuration === d.value && styles.durationTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {step === 5 && (
            <View style={styles.section}>
              <Text style={styles.title}>Опыт и образование</Text>
              <Text style={styles.label}>Опыт работы (лет)</Text>
              <TextInput style={styles.input} value={experienceYears} onChangeText={setExperienceYears} keyboardType="number-pad" placeholderTextColor={COLORS.textSecondary} />
              <Text style={styles.label}>Образование (вуз, специальность)</Text>
              <TextInput style={styles.input} value={education} onChangeText={setEducation} placeholder="МГУ, прикладная математика" placeholderTextColor={COLORS.textSecondary} />
              <Text style={styles.label}>О себе (до 500 символов)</Text>
              <TextInput style={[styles.input, styles.textarea]} value={bio} onChangeText={setBio} placeholder="Расскажите про подход, опыт, специализацию" multiline maxLength={500} placeholderTextColor={COLORS.textSecondary} />
              <Text style={styles.helper}>{bio.length}/500</Text>
            </View>
          )}

          {step === 6 && (
            <View style={styles.section}>
              <Text style={styles.title}>Как ученики платят вам</Text>
              <Text style={styles.subtitle}>Оплата за уроки идёт напрямую вам. Платформа берёт комиссию за свои услуги — 200 ₽ с урока, она списывается с вашего внутреннего счёта.</Text>
              <View style={styles.paymentList}>
                {PAYMENT_METHODS.map(p => (
                  <TouchableOpacity key={p.value} style={[styles.paymentItem, paymentMethod === p.value && styles.paymentItemActive]} onPress={() => setPaymentMethod(p.value)}>
                    <View style={[styles.radio, paymentMethod === p.value && styles.radioActive]}>
                      {paymentMethod === p.value && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.paymentLabel}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Реквизиты для оплаты</Text>
              <TextInput
                style={styles.input}
                value={paymentDetails}
                onChangeText={setPaymentDetails}
                placeholder={
                  paymentMethod === 'card' ? '5536 9100 1234 5678' :
                  paymentMethod === 'phone' ? '+7 999 123-45-67 (Сбер)' :
                  paymentMethod === 'bank' ? 'Реквизиты банка' :
                  paymentMethod === 'phone_top' ? '+7 999 123-45-67' :
                  'Удобный способ'
                }
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step > 1 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.backBtnText}>← Назад</Text>
            </TouchableOpacity>
          )}
          {step < STEPS ? (
            <TouchableOpacity style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]} disabled={!canProceed()} onPress={() => setStep(step + 1)}>
              <Text style={styles.nextBtnText}>Далее →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.nextBtn, (!canProceed() || saving) && styles.nextBtnDisabled]} disabled={!canProceed() || saving} onPress={handleFinish}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextBtnText}>Готово ✓</Text>}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Модал «Все категории и предметы» */}
      <Modal
        visible={showAllSubjects}
        animationType="slide"
        onRequestClose={() => setShowAllSubjects(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Все предметы</Text>
            <Pressable
              hitSlop={10}
              style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.6 }]}
              onPress={() => { setShowAllSubjects(false); setModalSearch(''); }}
            >
              <X size={22} color={COLORS.text} />
            </Pressable>
          </View>
          <View style={styles.modalSearchBox}>
            <Search size={16} color={COLORS.textSecondary} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Поиск предмета..."
              value={modalSearch}
              onChangeText={setModalSearch}
              placeholderTextColor={COLORS.textSecondary}
            />
            {modalSearch.length > 0 && (
              <Pressable hitSlop={8} onPress={() => setModalSearch('')}>
                <X size={16} color={COLORS.textSecondary} />
              </Pressable>
            )}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalScroll}>
            {modalGroups.map(cat => (
              <View key={cat.key} style={styles.modalGroup}>
                <Text style={styles.modalGroupTitle}>{cat.emoji}  {cat.label}</Text>
                <View style={styles.chipsWrap}>
                  {cat.subjects.map(s => {
                    const active = subjects.includes(s);
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
              </View>
            ))}
          </ScrollView>
          <View style={styles.modalFooter}>
            <Pressable
              onPress={() => { setShowAllSubjects(false); setModalSearch(''); }}
              style={({ pressed }) => [styles.modalDoneBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.modalDoneText}>Готово · выбрано {subjects.length}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, maxWidth: 560, alignSelf: 'center' as any, width: '100%' },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  progressDotActive: { backgroundColor: COLORS.primary },
  stepLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  scroll: { padding: 20, paddingBottom: 100, maxWidth: 560, alignSelf: 'center' as any, width: '100%' },
  section: { gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 8, lineHeight: 20 },
  label: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600', marginTop: 8 },
  helper: { fontSize: 12, color: COLORS.textSecondary, alignSelf: 'flex-end' },
  input: { backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14, fontSize: 15, color: COLORS.text },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  avatarPicker: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.primaryLight, alignSelf: 'center', justifyContent: 'center', alignItems: 'center', marginVertical: 16, borderWidth: 2, borderColor: COLORS.primary, borderStyle: 'dashed' },
  avatarPlaceholder: { fontSize: 14, color: COLORS.primary, fontWeight: '600', textAlign: 'center' },
  avatarFilled: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  avatarFilledText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  selectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10, backgroundColor: COLORS.primaryLight, borderRadius: 12, marginBottom: 8 },
  selectedChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.primary },
  selectedChipText: { fontSize: 12, color: COLORS.white, fontWeight: '700' },
  catBtn: { height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center' },
  catBtnActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  catBtnText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '700' },
  catBtnTextActive: { color: COLORS.primary },
  showAllBtn: { alignSelf: 'center', marginTop: 10, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 14, backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primary },
  showAllBtnText: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  modalClose: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  modalSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, height: 44, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  modalSearchInput: { flex: 1, fontSize: 15, color: COLORS.text },
  modalScroll: { padding: 16, paddingBottom: 32 },
  modalGroup: { marginBottom: 18 },
  modalGroupTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  modalFooter: { padding: 16, paddingBottom: Platform.OS === 'ios' ? 24 : 16, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background },
  modalDoneBtn: { height: 52, backgroundColor: COLORS.primary, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  modalDoneText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, marginVertical: 8 },
  priceInput: { flex: 1, fontSize: 24, fontWeight: '700', color: COLORS.text, paddingVertical: 14 },
  priceCurrency: { fontSize: 16, color: COLORS.textSecondary, fontWeight: '600' },
  durationRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  durationBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, minWidth: 80, alignItems: 'center' },
  durationBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  durationText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  durationTextActive: { color: '#fff' },
  paymentList: { gap: 8, marginVertical: 12 },
  paymentItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  paymentItemActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  radioActive: { borderColor: COLORS.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  paymentLabel: { fontSize: 15, color: COLORS.text, flex: 1, fontWeight: '500' },
  footer: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: Platform.OS === 'ios' ? 24 : 16, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background, maxWidth: 560, alignSelf: 'center' as any, width: '100%' },
  backBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, justifyContent: 'center' },
  backBtnText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  nextBtn: { flex: 1, height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

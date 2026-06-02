import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, TextInput, TouchableOpacity, Switch, Alert } from 'react-native';
import supabase from '../../lib/supabase';
import { COLORS, SUBJECT_CATEGORIES } from '../../lib/constants';
import { ru } from '../../lib/errors';
import { useResponsive } from '../../lib/responsive';

function rub(kop?: number | null) {
  return ((kop || 0) / 100).toLocaleString('ru');
}

export default function AdminSettings() {
  const { contentMaxWidth, isDesktop } = useResponsive();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data, error } = await supabase.from('app_settings').select('*').limit(1).single();
    if (error) Alert.alert('Ошибка', ru(error));
    setSettings(data);
    setLoading(false);
  }

  function patch(p: any) { setSettings({ ...settings, ...p }); }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('app_settings').update({
      lesson_commission: settings.lesson_commission,
      min_balance_to_start: settings.min_balance_to_start,
      tbank_terminal_id: settings.tbank_terminal_id,
      tbank_terminal_password: settings.tbank_terminal_password,
      test_mode: settings.test_mode,
      verification_price_kopecks: settings.verification_price_kopecks,
      pro_subscription_price_kopecks: settings.pro_subscription_price_kopecks,
    }).eq('id', settings.id);
    setSaving(false);
    if (error) Alert.alert('Ошибка', ru(error));
    else Alert.alert('Сохранено');
  }

  if (loading || !settings) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={[s.scroll, isDesktop ? { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' } : null]}>
        <Text style={s.title}>Настройки платформы</Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>Текущие цены</Text>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Комиссия за урок</Text>
            <Text style={s.priceValue}>{rub(settings.lesson_commission)} ₽</Text>
          </View>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Мин. баланс</Text>
            <Text style={s.priceValue}>{rub(settings.min_balance_to_start)} ₽</Text>
          </View>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Верификация</Text>
            <Text style={s.priceValue}>{rub(settings.verification_price_kopecks)} ₽</Text>
          </View>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>PRO-подписка / мес</Text>
            <Text style={s.priceValue}>{rub(settings.pro_subscription_price_kopecks)} ₽</Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Финансы</Text>
          <Text style={s.label}>Комиссия за урок (₽)</Text>
          <TextInput style={s.input} value={String((settings.lesson_commission || 0) / 100)} onChangeText={v => patch({ lesson_commission: Math.round(Number(v) * 100) || 0 })} keyboardType="number-pad" />
          <Text style={s.label}>Мин. баланс для старта урока (₽)</Text>
          <TextInput style={s.input} value={String((settings.min_balance_to_start || 0) / 100)} onChangeText={v => patch({ min_balance_to_start: Math.round(Number(v) * 100) || 0 })} keyboardType="number-pad" />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Платные сервисы для репетиторов</Text>
          <Text style={s.help}>Стоимость подключается из buy_pro_subscription / request_verification — меняйте здесь.</Text>
          <Text style={s.label}>Цена верификации (₽)</Text>
          <TextInput
            style={s.input}
            value={String((settings.verification_price_kopecks || 0) / 100)}
            onChangeText={v => patch({ verification_price_kopecks: Math.round(Number(v) * 100) || 0 })}
            keyboardType="number-pad"
            placeholder="500"
            placeholderTextColor={COLORS.textSecondary}
          />
          <Text style={s.label}>Цена PRO-подписки за месяц (₽)</Text>
          <TextInput
            style={s.input}
            value={String((settings.pro_subscription_price_kopecks || 0) / 100)}
            onChangeText={v => patch({ pro_subscription_price_kopecks: Math.round(Number(v) * 100) || 0 })}
            keyboardType="number-pad"
            placeholder="990"
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>T-Bank эквайринг</Text>
          <Text style={s.help}>Введите данные тестового или боевого терминала из личного кабинета T-Bank.</Text>
          <Text style={s.label}>Terminal ID</Text>
          <TextInput style={s.input} value={settings.tbank_terminal_id || ''} onChangeText={v => patch({ tbank_terminal_id: v })} placeholder="TinkoffBankTest" placeholderTextColor={COLORS.textSecondary} />
          <Text style={s.label}>Terminal Password</Text>
          <TextInput style={s.input} value={settings.tbank_terminal_password || ''} onChangeText={v => patch({ tbank_terminal_password: v })} placeholder="••••••••" placeholderTextColor={COLORS.textSecondary} secureTextEntry />
          <Text style={s.help}>Webhook URL для настройки в кабинете T-Bank:</Text>
          <Text style={s.code}>https://supabase.repetitory-app.ru/functions/v1/tbank-webhook</Text>
        </View>

        <View style={s.card}>
          <View style={s.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Режим тестирования</Text>
              <Text style={s.help}>В кошельке у репетиторов появляется кнопка «тестовая оплата» — мгновенно зачисляет баланс без T-Bank. Выключите перед запуском в прод.</Text>
            </View>
            <Switch value={!!settings.test_mode} onValueChange={v => patch({ test_mode: v })} trackColor={{ true: COLORS.primary, false: COLORS.border }} />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Категории предметов</Text>
          <Text style={s.help}>
            Read-only. Категории зашиты в код (lib/constants.ts → SUBJECT_CATEGORIES).
            Всего категорий: {SUBJECT_CATEGORIES.length}, предметов: {SUBJECT_CATEGORIES.reduce((acc, c) => acc + c.subjects.length, 0)}.
          </Text>
          {SUBJECT_CATEGORIES.map(c => (
            <View key={c.key} style={s.catRow}>
              <View style={s.catRowHeader}>
                <Text style={s.catRowTitle}>{c.emoji}  {c.label}</Text>
                <Text style={s.catRowCount}>{c.subjects.length} шт.</Text>
              </View>
              <Text style={s.catRowSubjects} numberOfLines={3}>{c.subjects.join(' · ')}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.5 }]} disabled={saving} onPress={save}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Сохранить</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 4, paddingHorizontal: 4 },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 6 },
  help: { fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
  input: { backgroundColor: COLORS.background, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  code: { fontSize: 11, color: COLORS.text, backgroundColor: COLORS.background, padding: 8, borderRadius: 6, fontFamily: 'monospace' as any },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveBtn: { height: 52, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  priceLabel: { fontSize: 13, color: COLORS.textSecondary },
  priceValue: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  catRow: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, marginTop: 4 },
  catRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catRowTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  catRowCount: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },
  catRowSubjects: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, lineHeight: 16 },
});

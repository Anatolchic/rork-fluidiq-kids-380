import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { Fingerprint, Bell, LogOut } from 'lucide-react-native';
import supabase from '../lib/supabase';
import { COLORS } from '../lib/constants';
import { ru } from '../lib/errors';
import {
  authenticate, getBiometricKind, isBiometricEnabled, isBiometricSupported,
  saveCredentials, saveSessionTokens, clearCredentials,
} from '../lib/biometric';
import { useAuthStore } from '../stores/auth';

type Prefs = {
  push_enabled: boolean;
  email_enabled: boolean;
  events: Record<string, boolean>;
};
const EVENT_LABELS: { key: string; label: string }[] = [
  { key: 'new_booking', label: 'Новая заявка на урок' },
  { key: 'booking_confirmed', label: 'Подтверждение брони' },
  { key: 'booking_cancelled', label: 'Отмена брони' },
  { key: 'new_message', label: 'Новое сообщение в чате' },
  { key: 'reminder_1h', label: 'Напоминание за 1 час' },
  { key: 'reminder_15m', label: 'Напоминание за 15 минут' },
  { key: 'balance_topup', label: 'Пополнение баланса' },
  { key: 'review_request', label: 'Запрос отзыва' },
  { key: 'review_left', label: 'Оставлен отзыв' },
];

export default function SettingsSection() {
  const { session, setSession, setProfile } = useAuthStore();
  const [bioOn, setBioOn] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioKind, setBioKind] = useState<'face' | 'fingerprint' | 'iris' | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [enabled, sup, kind, p] = await Promise.all([
      isBiometricEnabled(),
      isBiometricSupported(),
      getBiometricKind(),
      supabase.from('notification_prefs').select('*').maybeSingle(),
    ]);
    setBioOn(enabled);
    setBioSupported(sup);
    setBioKind(kind);
    if (p.data) {
      setPrefs({ push_enabled: p.data.push_enabled, email_enabled: p.data.email_enabled, events: p.data.events });
    } else {
      // дефолты как в SQL
      const def: Record<string, boolean> = {};
      EVENT_LABELS.forEach(e => (def[e.key] = true));
      setPrefs({ push_enabled: true, email_enabled: true, events: def });
    }
    setLoading(false);
  }

  async function toggleBio(value: boolean) {
    if (value) {
      const auth = await authenticate('Включить биометрию');
      if (!auth.success) {
        if (auth.error && auth.error !== 'Отменено') Alert.alert('Биометрия', auth.error);
        return;
      }
      Alert.prompt?.('Подтвердите пароль', 'Чтобы сохранить вход, введите ваш пароль ещё раз',
        async (password) => {
          if (!password || !session?.user.email) return;
          // Проверим что пароль верный — пробуем reauth
          const { error } = await supabase.auth.signInWithPassword({ email: session.user.email, password });
          if (error) { Alert.alert('Неверный пароль', ru(error)); return; }
          await saveCredentials({ email: session.user.email, password });
          if (session.access_token && session.refresh_token) {
            await saveSessionTokens({ accessToken: session.access_token, refreshToken: session.refresh_token });
          }
          setBioOn(true);
          Alert.alert('Биометрия включена', `Теперь можете входить через ${bioKind === 'face' ? 'Face ID' : 'Touch ID'}`);
        },
        'secure-text'
      );
    } else {
      await clearCredentials();
      setBioOn(false);
    }
  }

  async function savePrefs(p: Prefs) {
    if (!session?.user.id) return;
    setPrefs(p);
    const { error } = await supabase.from('notification_prefs').upsert({
      user_id: session.user.id,
      push_enabled: p.push_enabled,
      email_enabled: p.email_enabled,
      events: p.events,
    });
    if (error) Alert.alert('Не сохранено', ru(error));
  }

  async function logout() {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена' },
      { text: 'Выйти', style: 'destructive', onPress: async () => {
        await clearCredentials();
        await supabase.auth.signOut();
        setSession(null); setProfile(null);
        router.replace('/(auth)/login');
      }},
    ]);
  }

  if (loading || !prefs) return <View style={s.loader}><ActivityIndicator color={COLORS.primary} /></View>;

  return (
    <View style={{ gap: 12 }}>
      {Platform.OS !== 'web' && (
        <View style={s.card}>
          <Text style={s.title}>Безопасность</Text>
          {!bioSupported ? (
            <Text style={s.hint}>Биометрия не настроена на устройстве. Добавьте Face ID / Touch ID в настройках iPhone.</Text>
          ) : (
            <View style={s.row}>
              <View style={s.rowLeft}>
                <Fingerprint size={18} color={COLORS.primary} />
                <View>
                  <Text style={s.rowLabel}>Вход через {bioKind === 'face' ? 'Face ID' : 'Touch ID'}</Text>
                  <Text style={s.rowSub}>Быстрый вход без ввода пароля</Text>
                </View>
              </View>
              <Switch value={bioOn} onValueChange={toggleBio} trackColor={{ true: COLORS.primary, false: COLORS.border }} />
            </View>
          )}
        </View>
      )}

      <View style={s.card}>
        <Text style={s.title}>Уведомления</Text>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <Bell size={18} color={COLORS.primary} />
            <Text style={s.rowLabel}>Push-уведомления</Text>
          </View>
          <Switch value={prefs.push_enabled} onValueChange={v => savePrefs({ ...prefs, push_enabled: v })} trackColor={{ true: COLORS.primary, false: COLORS.border }} />
        </View>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <Bell size={18} color={COLORS.primary} />
            <Text style={s.rowLabel}>Email-уведомления</Text>
          </View>
          <Switch value={prefs.email_enabled} onValueChange={v => savePrefs({ ...prefs, email_enabled: v })} trackColor={{ true: COLORS.primary, false: COLORS.border }} />
        </View>
        {(prefs.push_enabled || prefs.email_enabled) && (
          <>
            <Text style={s.divider}>Типы событий</Text>
            {EVENT_LABELS.map(e => (
              <View key={e.key} style={s.eventRow}>
                <Text style={s.eventLabel}>{e.label}</Text>
                <Switch
                  value={prefs.events[e.key] !== false}
                  onValueChange={v => savePrefs({ ...prefs, events: { ...prefs.events, [e.key]: v } })}
                  trackColor={{ true: COLORS.primary, false: COLORS.border }}
                />
              </View>
            ))}
          </>
        )}
      </View>

      <TouchableOpacity style={s.logout} onPress={logout}>
        <LogOut size={16} color={COLORS.error} />
        <Text style={s.logoutText}>Выйти из аккаунта</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  loader: { padding: 24, alignItems: 'center' },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rowLabel: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  rowSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  hint: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  divider: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', marginTop: 4 },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  eventLabel: { fontSize: 13, color: COLORS.text, flex: 1 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.error + '40' },
  logoutText: { color: COLORS.error, fontSize: 14, fontWeight: '600' },
});

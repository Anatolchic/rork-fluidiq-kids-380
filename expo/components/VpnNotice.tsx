import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ShieldAlert, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../lib/constants';
import { useVpnDetection } from '../hooks/useVpnDetection';

/**
 * Баннер о работающем VPN — показывается один раз за сессию.
 * Адаптировано из проекта Рестики (rork----/expo/components/VpnNotice.tsx).
 */
export function VpnNotice() {
  const { detected } = useVpnDetection();
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (detected && !dismissed) {
      const t = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(t);
    }
    return () => {};
  }, [detected, dismissed]);

  if (!visible || dismissed) return null;
  const top = (Platform.OS === 'ios' ? insets.top : 12) + 8;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top }]} testID="vpn-notice">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <ShieldAlert size={18} color={COLORS.warning} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Обнаружен VPN</Text>
          <Text style={styles.subtitle}>С включённым VPN приложение может работать медленнее.</Text>
        </View>
        <Pressable onPress={() => setDismissed(true)} hitSlop={12} style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]} testID="vpn-notice-close">
          <X size={18} color={COLORS.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1000 },
  card: {
    width: '100%', maxWidth: 520,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white,
    borderColor: COLORS.border, borderWidth: 1,
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.warning + '15' },
  textWrap: { flex: 1 },
  title: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  subtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  close: { padding: 6, borderRadius: 8 },
});

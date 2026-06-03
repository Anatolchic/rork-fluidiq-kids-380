import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { COLORS } from '../lib/constants';

export type BulkAction = {
  label: string;
  onPress: () => void;
  danger?: boolean;
  icon?: any;
};

/**
 * Sticky bottom-bar для массовых операций в админских списках.
 * Появляется когда count > 0. Закрывается крестиком (onClear).
 */
export function BulkActionBar({
  count,
  onClear,
  actions,
}: {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
}) {
  if (count === 0) return null;
  return (
    <View style={styles.bar}>
      <TouchableOpacity onPress={onClear} style={styles.clear} hitSlop={8}>
        <X size={18} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.count}>Выбрано: {count}</Text>
      <View style={{ flex: 1 }} />
      {actions.map((a, i) => {
        const Icon = a.icon;
        return (
          <TouchableOpacity
            key={i}
            onPress={a.onPress}
            style={[styles.action, a.danger && styles.dangerAction]}
          >
            {Icon ? <Icon size={16} color="#fff" /> : null}
            <Text style={styles.actionText}>{a.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    backgroundColor: COLORS.text,
    paddingBottom: 28,
  },
  clear: { padding: 6 },
  count: { color: '#fff', fontWeight: '700' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  dangerAction: { backgroundColor: COLORS.error },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

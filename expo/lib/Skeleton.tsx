import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from './constants';

type Props = {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
};

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: Props) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: COLORS.border, opacity },
        style,
      ]}
    />
  );
}

export function TutorCardSkeleton() {
  return (
    <View style={s.card}>
      <Skeleton width={64} height={64} radius={32} />
      <View style={s.cardBody}>
        <View style={s.row}>
          <Skeleton width="55%" height={16} />
          <Skeleton width={50} height={16} />
        </View>
        <Skeleton width="80%" height={12} />
        <Skeleton width="60%" height={12} />
        <View style={s.row}>
          <Skeleton width={80} height={14} />
          <Skeleton width={70} height={12} />
        </View>
      </View>
    </View>
  );
}

export function BookingCardSkeleton() {
  return (
    <View style={s.simpleCard}>
      <View style={s.row}><Skeleton width="40%" height={16} /><Skeleton width={90} height={20} /></View>
      <Skeleton width="50%" height={13} />
      <Skeleton width="70%" height={13} />
      <Skeleton width={80} height={15} />
    </View>
  );
}

export function ListSkeleton({ count = 3, Item = BookingCardSkeleton }: { count?: number; Item?: React.ComponentType }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => <Item key={i} />)}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14, padding: 16, backgroundColor: COLORS.white, borderRadius: 16, alignItems: 'center' },
  cardBody: { flex: 1, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  simpleCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 8 },
});

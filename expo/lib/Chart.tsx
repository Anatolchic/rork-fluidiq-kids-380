import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path, Line, Rect, Circle, Text as SvgText, G } from 'react-native-svg';
import { COLORS } from './constants';

type Props = {
  title: string;
  data: number[];
  labels: string[];
  color?: string;
  height?: number;
  unit?: string;
};

// Простой LineChart на SVG: ось X — даты, ось Y — авто-min/max
export function LineChart({ title, data, labels, color = COLORS.primary, height = 180, unit = '' }: Props) {
  const { width: winW } = useWindowDimensions();
  const W = Math.min(winW - 32, 880);
  const H = height;
  const PAD_L = 36, PAD_R = 12, PAD_T = 14, PAD_B = 26;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  if (!data || data.length === 0) {
    return <View style={s.empty}><Text style={s.emptyText}>Нет данных</Text></View>;
  }

  const min = Math.min(...data, 0);
  const max = Math.max(...data, 1);
  const range = Math.max(max - min, 1);

  const x = (i: number) => PAD_L + (i / Math.max(data.length - 1, 1)) * innerW;
  const y = (v: number) => PAD_T + (1 - (v - min) / range) * innerH;

  const pathD = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${x(data.length - 1).toFixed(1)},${(PAD_T + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + innerH).toFixed(1)} Z`;

  const yTicks = 3;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = min + (range * i) / yTicks;
    return { y: y(v), label: formatNum(v) };
  });

  const total = data.reduce((a, b) => a + b, 0);
  const avg = total / data.length;
  const last = data[data.length - 1];

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.title}>{title}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.statValue}>{formatNum(last)} {unit}</Text>
          <Text style={s.statSub}>сегодня · ср {formatNum(avg)}/день</Text>
        </View>
      </View>
      <Svg width={W} height={H}>
        {yLabels.map((t, i) => (
          <G key={i}>
            <Line x1={PAD_L} y1={t.y} x2={W - PAD_R} y2={t.y} stroke={COLORS.border} strokeWidth={0.5} strokeDasharray="3,4" />
            <SvgText x={PAD_L - 4} y={t.y + 4} fontSize={9} fill={COLORS.textSecondary} textAnchor="end">{t.label}</SvgText>
          </G>
        ))}
        <Path d={areaD} fill={color} opacity={0.12} />
        <Path d={pathD} stroke={color} strokeWidth={2} fill="none" />
        {data.map((v, i) => (
          <Circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={color} />
        ))}
        {labels.length > 0 && (
          <>
            <SvgText x={x(0)} y={H - 8} fontSize={9} fill={COLORS.textSecondary} textAnchor="start">{shortDate(labels[0])}</SvgText>
            <SvgText x={x(Math.floor(data.length / 2))} y={H - 8} fontSize={9} fill={COLORS.textSecondary} textAnchor="middle">{shortDate(labels[Math.floor(data.length / 2)])}</SvgText>
            <SvgText x={x(data.length - 1)} y={H - 8} fontSize={9} fill={COLORS.textSecondary} textAnchor="end">{shortDate(labels[data.length - 1])}</SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

export function BarChart({ title, data, labels, color = COLORS.primary, height = 180, unit = '' }: Props) {
  const { width: winW } = useWindowDimensions();
  const W = Math.min(winW - 32, 880);
  const H = height;
  const PAD_L = 36, PAD_R = 12, PAD_T = 14, PAD_B = 26;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  if (!data || data.length === 0) return <View style={s.empty}><Text style={s.emptyText}>Нет данных</Text></View>;

  const max = Math.max(...data, 1);
  const barW = (innerW / data.length) * 0.7;
  const gap = (innerW / data.length) * 0.3;

  const total = data.reduce((a, b) => a + b, 0);
  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.title}>{title}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.statValue}>{formatNum(total)} {unit}</Text>
          <Text style={s.statSub}>сумма за 30 дней</Text>
        </View>
      </View>
      <Svg width={W} height={H}>
        <Line x1={PAD_L} y1={PAD_T + innerH} x2={W - PAD_R} y2={PAD_T + innerH} stroke={COLORS.border} strokeWidth={0.5} />
        <SvgText x={PAD_L - 4} y={PAD_T + 4} fontSize={9} fill={COLORS.textSecondary} textAnchor="end">{formatNum(max)}</SvgText>
        <SvgText x={PAD_L - 4} y={PAD_T + innerH + 4} fontSize={9} fill={COLORS.textSecondary} textAnchor="end">0</SvgText>
        {data.map((v, i) => {
          const bh = (v / max) * innerH;
          const bx = PAD_L + (i * (barW + gap)) + gap / 2;
          const by = PAD_T + innerH - bh;
          return <Rect key={i} x={bx} y={by} width={barW} height={Math.max(bh, 1)} rx={2} fill={color} opacity={v > 0 ? 1 : 0.2} />;
        })}
        {labels.length > 0 && (
          <>
            <SvgText x={x0(PAD_L, innerW, 0, data.length)} y={H - 8} fontSize={9} fill={COLORS.textSecondary} textAnchor="start">{shortDate(labels[0])}</SvgText>
            <SvgText x={x0(PAD_L, innerW, data.length - 1, data.length)} y={H - 8} fontSize={9} fill={COLORS.textSecondary} textAnchor="end">{shortDate(labels[data.length - 1])}</SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

function x0(padL: number, innerW: number, i: number, n: number) {
  return padL + (i / Math.max(n - 1, 1)) * innerW;
}
function formatNum(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
  return Number.isInteger(v) ? String(v) : v.toFixed(0);
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const s = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, gap: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  statSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  empty: { backgroundColor: COLORS.white, borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: COLORS.textSecondary },
});

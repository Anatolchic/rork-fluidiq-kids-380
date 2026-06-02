import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, endOfWeek, isBefore, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { COLORS } from '../lib/constants';

type DayMarker = {
  date: string; // 'YYYY-MM-DD'
  hasSlots?: boolean;     // есть свободные слоты (для tutor view)
  hasBookings?: boolean;  // есть бронирования
  bookingsCount?: number;
};

type Props = {
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
  markers?: DayMarker[];
  month: Date;
  onMonthChange: (m: Date) => void;
  /** Для ученика: подсвечивать только даты со свободными слотами (hasSlots), disabled остальные. */
  studentMode?: boolean;
  /** Минимальная разрешённая дата (по умолчанию — сегодня). */
  minDate?: Date;
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function CalendarMonth({ selectedDate, onSelect, markers = [], month, onMonthChange, studentMode = false, minDate }: Props) {
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const min = minDate ? startOfDay(minDate) : todayStart;

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const markerMap = useMemo(() => {
    const m: Record<string, DayMarker> = {};
    markers.forEach(x => { m[x.date] = x; });
    return m;
  }, [markers]);

  return (
    <View>
      <View style={s.head}>
        <TouchableOpacity style={s.navBtn} onPress={() => onMonthChange(addMonths(month, -1))}>
          <ChevronLeft size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={s.title}>{format(month, 'LLLL yyyy', { locale: ru })}</Text>
        <TouchableOpacity style={s.navBtn} onPress={() => onMonthChange(addMonths(month, 1))}>
          <ChevronRight size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.weekHead}>
        {WEEKDAYS.map(w => <Text key={w} style={s.weekLabel}>{w}</Text>)}
      </View>

      <View style={s.grid}>
        {days.map(d => {
          const key = format(d, 'yyyy-MM-dd');
          const marker = markerMap[key];
          const inMonth = isSameMonth(d, month);
          const past = isBefore(d, min);
          const selected = selectedDate && isSameDay(d, selectedDate);
          const studentDisabled = studentMode && (past || !marker?.hasSlots);

          let bgColor = 'transparent';
          if (selected) bgColor = COLORS.primary;
          else if (marker?.hasBookings) bgColor = COLORS.warning + '40';
          else if (marker?.hasSlots) bgColor = COLORS.success + '25';

          const textColor =
            selected ? '#fff' :
            !inMonth ? COLORS.textSecondary + '60' :
            studentDisabled ? COLORS.textSecondary + '60' :
            past ? COLORS.textSecondary + '60' :
            COLORS.text;

          return (
            <TouchableOpacity
              key={key}
              style={[s.cell, { backgroundColor: bgColor }, isToday(d) && !selected && s.cellToday]}
              disabled={studentDisabled || (!studentMode && past)}
              onPress={() => onSelect(d)}
              activeOpacity={0.7}
            >
              <Text style={[s.dayNum, { color: textColor }, isToday(d) && !selected && { fontWeight: '800' }]}>{format(d, 'd')}</Text>
              {marker?.hasBookings && marker.bookingsCount ? (
                <View style={[s.dot, { backgroundColor: selected ? '#fff' : COLORS.warning }]}>
                  <Text style={[s.dotText, { color: selected ? COLORS.warning : '#fff' }]}>{marker.bookingsCount}</Text>
                </View>
              ) : marker?.hasSlots ? (
                <View style={[s.dotSmall, { backgroundColor: selected ? '#fff' : COLORS.success }]} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {!studentMode && (
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: COLORS.success + '60' }]} />
            <Text style={s.legendText}>Свободные слоты</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: COLORS.warning + '60' }]} />
            <Text style={s.legendText}>Есть бронь</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 8 },
  navBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: COLORS.primaryLight },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text, textTransform: 'capitalize' },
  weekHead: { flexDirection: 'row', paddingBottom: 4 },
  weekLabel: { flex: 1, fontSize: 11, color: COLORS.textSecondary, textAlign: 'center', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%` as any, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 10, padding: 2 },
  cellToday: { borderWidth: 1.5, borderColor: COLORS.primary },
  dayNum: { fontSize: 14, fontWeight: '600' },
  dot: { minWidth: 16, height: 14, borderRadius: 7, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  dotText: { fontSize: 9, fontWeight: '800' },
  dotSmall: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
  legend: { flexDirection: 'row', gap: 16, paddingHorizontal: 8, paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontSize: 11, color: COLORS.textSecondary },
});

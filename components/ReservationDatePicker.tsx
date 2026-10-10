import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../constants/theme';
import {
  formatReservationMonth,
  getReservationCalendarDays,
  getReservationDateBounds,
} from '../utils/reservationSchedule';

interface ReservationDatePickerProps {
  value: string;
  onChange(value: string): void;
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function ReservationDatePicker({ value, onChange }: ReservationDatePickerProps) {
  const { today, maximum } = getReservationDateBounds();
  const selectedDate = value ? new Date(`${value}T12:00:00`) : null;
  const [visibleMonth, setVisibleMonth] = useState(
    selectedDate && Number.isFinite(selectedDate.getTime())
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const days = useMemo(() => getReservationCalendarDays(visibleMonth), [visibleMonth]);
  const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(maximum.getFullYear(), maximum.getMonth(), 1);
  const canGoPrevious = visibleMonth > firstMonth;
  const canGoNext = visibleMonth < lastMonth;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          accessibilityState={{ disabled: !canGoPrevious }}
          disabled={!canGoPrevious}
          onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
          style={[styles.monthButton, !canGoPrevious && styles.disabled]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={styles.month}>{formatReservationMonth(visibleMonth)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          accessibilityState={{ disabled: !canGoNext }}
          disabled={!canGoNext}
          onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
          style={[styles.monthButton, !canGoNext && styles.disabled]}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.weekdays}>
        {WEEKDAYS.map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}
      </View>
      <View style={styles.grid}>
        {days.map((day) => {
          const selected = day.date === value;
          return (
            <Pressable
              key={day.date}
              accessibilityRole="button"
              accessibilityLabel={`Seleccionar ${day.date}`}
              accessibilityState={{ disabled: day.disabled, selected }}
              disabled={day.disabled}
              onPress={() => onChange(day.date)}
              style={[styles.day, !day.currentMonth && styles.outsideMonth, selected && styles.selectedDay, day.disabled && styles.disabled]}
            >
              <Text style={[styles.dayText, selected && styles.selectedDayText, day.disabled && styles.disabledText]}>{day.day}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.helper}>Disponible desde hoy hasta {maximum.toLocaleDateString('es')}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  month: { color: colors.text, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  monthButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.softBlue },
  monthButtonText: { color: colors.primary, fontSize: 27, lineHeight: 30, fontWeight: '700' },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between' },
  weekday: { width: '14.28%', color: colors.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xs },
  day: { width: '14.28%', minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  dayText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  selectedDay: { backgroundColor: colors.primary },
  selectedDayText: { color: colors.surface, fontWeight: '800' },
  outsideMonth: { opacity: 0.45 },
  disabled: { opacity: 0.35 },
  disabledText: { color: colors.muted },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});

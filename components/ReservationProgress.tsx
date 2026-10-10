import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../constants/theme';
import type { ReservationStatus } from '../types/reservation';

export const RESERVATION_PROGRESS_STEPS = [
  'confirmada',
  'cliente_llego',
  'en_espera',
  'en_lavado',
  'finalizada',
] as const;

type ProgressStep = (typeof RESERVATION_PROGRESS_STEPS)[number];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cliente_llego: 'Cliente llegó',
  en_espera: 'En espera',
  en_lavado: 'En lavado',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

export function getReservationStatusLabel(status: ReservationStatus): string {
  return RESERVATION_STATUS_LABELS[status];
}

const STEP_LABELS: Record<ProgressStep, string> = {
  confirmada: RESERVATION_STATUS_LABELS.confirmada,
  cliente_llego: RESERVATION_STATUS_LABELS.cliente_llego,
  en_espera: RESERVATION_STATUS_LABELS.en_espera,
  en_lavado: RESERVATION_STATUS_LABELS.en_lavado,
  finalizada: RESERVATION_STATUS_LABELS.finalizada,
};

export type ReservationProgressState =
  | { kind: 'progress'; activeIndex: number }
  | { kind: 'pending' }
  | { kind: 'cancelled' };

export function getReservationProgressState(status: ReservationStatus): ReservationProgressState {
  if (status === 'pendiente') {
    return { kind: 'pending' };
  }
  if (status === 'cancelada') {
    return { kind: 'cancelled' };
  }
  return { kind: 'progress', activeIndex: RESERVATION_PROGRESS_STEPS.indexOf(status) };
}

interface ReservationProgressProps {
  status: ReservationStatus;
  compact?: boolean;
}

export function ReservationProgress({ status, compact = false }: ReservationProgressProps) {
  const progress = getReservationProgressState(status);
  if (progress.kind === 'pending') {
    return (
      <View accessibilityLabel="Progreso de reservación pendiente" style={styles.message}>
        <Text style={styles.pending}>Reservación pendiente</Text>
      </View>
    );
  }
  if (progress.kind === 'cancelled') {
    return (
      <View accessibilityLabel="Progreso de reservación cancelada" style={styles.message}>
        <Text style={styles.cancelled}>Reservación cancelada</Text>
      </View>
    );
  }

  return (
    <View accessibilityLabel={`Progreso de reservación: ${getReservationStatusLabel(status)}`} style={[styles.container, compact && styles.compact]}>
      {RESERVATION_PROGRESS_STEPS.map((step, index) => {
        const reached = index <= progress.activeIndex;
        return (
          <View key={step} style={styles.step}>
            <View style={[styles.marker, reached && styles.markerReached]}>
              <Text style={[styles.markerText, reached && styles.markerTextReached]}>{index + 1}</Text>
            </View>
            <Text style={[styles.label, reached && styles.labelReached]}>{STEP_LABELS[step]}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  compact: { gap: spacing.xs },
  step: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  marker: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  markerReached: { backgroundColor: colors.primary, borderColor: colors.primary },
  markerText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  markerTextReached: { color: colors.surface },
  label: { color: colors.muted, fontSize: 14 },
  labelReached: { color: colors.text, fontWeight: '700' },
  message: { paddingVertical: spacing.xs },
  pending: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  cancelled: { color: colors.danger, fontSize: 14, fontWeight: '700' },
});

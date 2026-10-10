import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '../../../../components/BackButton';
import { PrimaryButton } from '../../../../components/PrimaryButton';
import { Screen } from '../../../../components/Screen';
import { colors, spacing } from '../../../../constants/theme';
import { paymentService, type PaymentService } from '../../../../services/paymentService';
import { reservationService, type ReservationService } from '../../../../services/reservationService';
import type { Payment } from '../../../../types/payment';
import type { Reservation } from '../../../../types/reservation';

interface PaymentResultRouteProps {
  paymentService?: Pick<PaymentService, 'getPayment'>;
  reservationService?: Pick<ReservationService, 'getReservation'>;
}

type ResultState = {
  title: string;
  message: string;
  tone: 'success' | 'warning' | 'error';
};

const RESERVATION_STATUS_LABELS: Record<Reservation['status'], string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cliente_llego: 'Cliente llegó',
  en_espera: 'En espera',
  en_lavado: 'En lavado',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

function getResultState(payment: Payment, reservation: Reservation): ResultState {
  if (payment.status === 'pagado' && reservation.status === 'confirmada') {
    return {
      title: 'Pago confirmado',
      message: 'La reservación está confirmada.',
      tone: 'success',
    };
  }

  switch (payment.status) {
    case 'pendiente':
      return {
        title: 'Pago pendiente',
        message: 'El servidor aún no registra un resultado definitivo. La reservación no se confirmará hasta recibir ambos estados.',
        tone: 'warning',
      };
    case 'procesando':
      return {
        title: 'Pago en procesamiento',
        message: 'El pago se está procesando. Consulta nuevamente más tarde.',
        tone: 'warning',
      };
    case 'rechazado':
      return {
        title: 'Pago rechazado',
        message: 'El pago fue rechazado. La reservación no fue confirmada.',
        tone: 'error',
      };
    case 'cancelado':
      return {
        title: 'Pago cancelado',
        message: 'El pago fue cancelado. La reservación no fue confirmada.',
        tone: 'error',
      };
    case 'reembolsado':
      return {
        title: 'Pago reembolsado',
        message: 'El pago fue reembolsado. La reservación no se considera confirmada.',
        tone: 'error',
      };
    case 'pagado':
      return {
        title: 'No se pudo confirmar la reservación',
        message: 'El pago aparece registrado, pero la reservación todavía no está confirmada por el servidor.',
        tone: 'error',
      };
  }
}

function ResultActions({
  loading,
  onRetry,
  error,
}: {
  loading: boolean;
  onRetry: () => void;
  error: boolean;
}) {
  return (
    <View style={styles.actions}>
      <PrimaryButton
        label={error ? 'Reintentar' : 'Consultar de nuevo'}
        onPress={onRetry}
        loading={loading}
        disabled={loading}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver a mis reservaciones"
        disabled={loading}
        onPress={() => router.push('/reservaciones')}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>Volver a mis reservaciones</Text>
      </Pressable>
    </View>
  );
}

export default function PaymentResultRoute({
  paymentService: paymentReader = paymentService,
  reservationService: reservationReader = reservationService,
}: PaymentResultRouteProps) {
  const { paymentId: rawPaymentId } = useLocalSearchParams<{ paymentId?: string | string[] }>();
  const paymentId = firstParam(rawPaymentId);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadResult = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    setPayment(null);
    setReservation(null);
    if (!paymentId) {
      setError('No se especificó el pago solicitado.');
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
      return;
    }

    try {
      const loadedPayment = await paymentReader.getPayment(paymentId);
      const loadedReservation = await reservationReader.getReservation(loadedPayment.reservationId);
      if (!loadedReservation) {
        throw new Error('No se encontró la reservación.');
      }
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setPayment(loadedPayment);
      setReservation(loadedReservation);
    } catch {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setError('No se pudo consultar el estado del pago.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [paymentId, paymentReader, reservationReader]);

  useEffect(() => {
    void loadResult();
  }, [loadResult]);

  const resultState = payment && reservation ? getResultState(payment, reservation) : null;

  return (
    <Screen>
      <View style={styles.content}>
        <BackButton fallback="/reservaciones" />
        <Text style={styles.title}>Resultado del pago</Text>
        <Text style={styles.sandboxLabel}>Estado de pago verificado por Stripe</Text>
        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Consultando el estado del pago y la reservación…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && error ? <ResultActions loading={loading} onRetry={() => void loadResult()} error /> : null}
        {!loading && !error && payment && reservation ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{reservation.autolavadoName}</Text>
              <Text style={styles.detail}>Servicio: {reservation.serviceName}</Text>
              <Text style={styles.detail}>Vehículo: {reservation.vehicleBrand} {reservation.vehicleModel}</Text>
              <Text style={styles.detail}>Fecha: {reservation.date}</Text>
              <Text style={styles.detail}>Hora: {reservation.time}</Text>
              <Text style={styles.total}>Total de la reservación: ${formatPrice(reservation.price)}</Text>
              <Text style={styles.detail}>Estado de la reservación: {RESERVATION_STATUS_LABELS[reservation.status]}</Text>
            </View>
            {resultState ? (
              <View style={[styles.card, resultState.tone === 'success' && styles.successCard, resultState.tone === 'error' && styles.errorCard]}>
                <Text style={[styles.stateTitle, resultState.tone === 'success' && styles.successText, resultState.tone === 'error' && styles.errorText]}>
                  {resultState.title}
                </Text>
                <Text style={styles.message}>{resultState.message}</Text>
              </View>
            ) : null}
            <ResultActions loading={loading} onRetry={() => void loadResult()} error={false} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  backButtonText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  title: { color: colors.text, fontSize: 27, fontWeight: '700' },
  sandboxLabel: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  successCard: { borderWidth: 1, borderColor: colors.primary },
  errorCard: { borderWidth: 1, borderColor: colors.danger },
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  stateTitle: { color: colors.text, fontSize: 21, fontWeight: '700' },
  successText: { color: colors.primary },
  errorText: { color: colors.danger },
  detail: { color: colors.text, fontSize: 16, lineHeight: 23 },
  total: { color: colors.primary, fontSize: 20, fontWeight: '700' },
  actions: { gap: spacing.sm },
  secondaryButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  secondaryButtonText: { color: colors.primary, fontWeight: '700' },
});

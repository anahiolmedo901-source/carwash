import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '../../../../components/BackButton';
import { PrimaryButton } from '../../../../components/PrimaryButton';
import { Screen } from '../../../../components/Screen';
import { colors, spacing } from '../../../../constants/theme';
import { reservationService, type ReservationService } from '../../../../services/reservationService';
import type { Reservation } from '../../../../types/reservation';

interface PaymentSummaryRouteProps {
  reservationService?: Pick<ReservationService, 'getReservation'>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

export default function PaymentSummaryRoute({
  reservationService: reservationReader = reservationService,
}: PaymentSummaryRouteProps) {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(rawId);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadReservation = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    if (!id) {
      setError('No se especificó la reservación solicitada.');
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
      return;
    }

    try {
      const loadedReservation = await reservationReader.getReservation(id);
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setReservation(loadedReservation);
    } catch {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setError('No se pudo cargar el resumen de pago.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [id, reservationReader]);

  useEffect(() => {
    void loadReservation();
  }, [loadReservation]);

  return (
    <Screen>
      <View style={styles.content}>
        <BackButton fallback="/reservaciones" />
        <Text style={styles.title}>Resumen de pago</Text>
        <Text style={styles.sandboxLabel}>Pago seguro con Stripe</Text>
        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando la reservación…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadReservation()} /> : null}
        {!loading && !error && !reservation ? <Text style={styles.message}>No se encontró la reservación solicitada.</Text> : null}
        {!loading && !error && reservation ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{reservation.autolavadoName}</Text>
            <Text style={styles.detail}>Servicio: {reservation.serviceName}</Text>
            <Text style={styles.detail}>Vehículo: {reservation.vehicleBrand} {reservation.vehicleModel}</Text>
            <Text style={styles.detail}>Fecha: {reservation.date}</Text>
            <Text style={styles.detail}>Hora: {reservation.time}</Text>
            <Text style={styles.total}>Total: ${formatPrice(reservation.price)}</Text>
            <Text style={styles.message}>El monto y el estado de la reservación se consultan desde el servidor.</Text>
            <PrimaryButton
              label="Continuar al pago"
              onPress={() => router.push({ pathname: '/pago/[id]', params: { id: reservation.id } })}
            />
          </View>
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
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  detail: { color: colors.text, fontSize: 16, lineHeight: 23 },
  total: { color: colors.primary, fontSize: 20, fontWeight: '700' },
});

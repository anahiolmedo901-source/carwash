import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '../../../components/BackButton';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { ReservationProgress } from '../../../components/ReservationProgress';
import { Screen } from '../../../components/Screen';
import { colors, spacing } from '../../../constants/theme';
import { useOptionalAuth } from '../../../context/AuthContext';
import { reservationService, type ReservationService } from '../../../services/reservationService';
import { realtimeService as defaultRealtimeService, type RealtimeService } from '../../../services/realtimeService';
import type { Reservation } from '../../../types/reservation';
import type { ReservationStatusUpdate } from '../../../types/realtime';
import { getReservationStatusLabel } from '../../../components/ReservationProgress';
import { getUserFacingErrorMessage } from '../../../utils/userFacingError';
import { isAtLeastAsFresh } from '../../../utils/realtimeFreshness';

interface ReservationDetailRouteProps {
  service?: Pick<ReservationService, 'getReservation' | 'cancelReservation'>;
  realtimeService?: Pick<RealtimeService, 'subscribeToCustomerReservations'>;
  customerId?: string;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

function canCancel(status: Reservation['status']): boolean {
  return status === 'pendiente' || status === 'confirmada';
}

export default function ReservationDetailRoute({
  service = reservationService,
  realtimeService: realtimeReader = defaultRealtimeService,
  customerId,
}: ReservationDetailRouteProps) {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(rawId);
  const auth = useOptionalAuth();
  const authenticatedCustomerId = auth?.state.status === 'signed-in' ? auth.state.profile.id : undefined;
  const resolvedCustomerId = customerId ?? authenticatedCustomerId;
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [realtimeWarning, setRealtimeWarning] = useState<string | null>(null);
  const cancelStarted = useRef(false);
  const loadRequestRef = useRef(0);
  const latestUpdateRef = useRef<ReservationStatusUpdate | null>(null);

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
      const loadedReservation = await service.getReservation(id);
      if (requestId !== loadRequestRef.current) {
        return;
      }
      if (!loadedReservation) {
        setReservation(null);
      } else {
        setReservation((current) => {
          const latestUpdate = latestUpdateRef.current;
          let next = current && !isAtLeastAsFresh(loadedReservation.updatedAt, current.updatedAt)
            ? current
            : loadedReservation;
          if (latestUpdate && !isAtLeastAsFresh(next.updatedAt, latestUpdate.updatedAt)) {
            next = { ...next, status: latestUpdate.status, updatedAt: latestUpdate.updatedAt };
          }
          return next;
        });
      }
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setError('No se pudo cargar la reservación.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [id, service]);

  useEffect(() => {
    latestUpdateRef.current = null;
  }, [id]);

  useEffect(() => {
    void loadReservation();
  }, [loadReservation]);

  useEffect(() => {
    if (!resolvedCustomerId || !id) {
      return undefined;
    }

    return realtimeReader.subscribeToCustomerReservations(
      resolvedCustomerId,
      (update: ReservationStatusUpdate) => {
        if (update.entityId !== id) {
          return;
        }
        latestUpdateRef.current = update;
        setReservation((current) => current && isAtLeastAsFresh(update.updatedAt, current.updatedAt)
          ? { ...current, status: update.status, updatedAt: update.updatedAt }
          : current);
      },
      () => setRealtimeWarning('Las actualizaciones en tiempo real no están disponibles por ahora.'),
    );
  }, [id, realtimeReader, resolvedCustomerId]);

  const requestCancellation = () => {
    if (!reservation || !canCancel(reservation.status) || cancelStarted.current) {
      return;
    }
    Alert.alert(
      'Cancelar reservación',
      '¿Quieres cancelar esta reservación? El historial se conservará.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Cancelar reservación',
          style: 'destructive',
          onPress: () => {
            if (cancelStarted.current) {
              return;
            }
            cancelStarted.current = true;
            setCancelling(true);
            setError(null);
            void service.cancelReservation(reservation.id).then((cancelled) => {
              setReservation((current) => current && !isAtLeastAsFresh(cancelled.updatedAt, current.updatedAt)
                ? current
                : cancelled);
              setCancelSuccess(true);
            }).catch((cancelError) => {
              setError(`No se pudo cancelar la reservación: ${getUserFacingErrorMessage(cancelError, 'Ocurrió un error inesperado.')}`);
            }).finally(() => {
              cancelStarted.current = false;
              setCancelling(false);
            });
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.content}>
        <BackButton fallback="/reservaciones" />
        <Text style={styles.title}>Detalle de reservación</Text>
        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando reservación…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {realtimeWarning ? <Text style={styles.warning}>{realtimeWarning}</Text> : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadReservation()} /> : null}
        {!loading && !error && !reservation ? <Text style={styles.message}>No se encontró la reservación solicitada.</Text> : null}
        {!loading && !error && reservation ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{reservation.autolavadoName}</Text>
            <Text style={styles.detail}>Servicio: {reservation.serviceName}</Text>
            <Text style={styles.detail}>Vehículo: {reservation.vehicleBrand} {reservation.vehicleModel}</Text>
            <Text style={styles.detail}>Placas: {reservation.vehiclePlate}</Text>
            <Text style={styles.detail}>Precio: ${formatPrice(reservation.price)}</Text>
            <Text style={styles.detail}>Duración: {formatPrice(reservation.durationMinutes)} minutos</Text>
            <Text style={styles.detail}>Fecha: {reservation.date}</Text>
            <Text style={styles.detail}>Hora: {reservation.time}</Text>
            <Text style={styles.status}>Estado: {getReservationStatusLabel(reservation.status)}</Text>
            <ReservationProgress status={reservation.status} />
            {reservation.qrCode ? (
              <Text style={styles.qr}>Código QR: {reservation.qrCode}</Text>
            ) : (
              <Text style={styles.message}>Código QR no disponible.</Text>
            )}
            {reservation.status === 'confirmada' ? (
              <PrimaryButton
                label="Ya llegué: registrar llegada"
                onPress={() => router.push({ pathname: '/llegada/[id]', params: { id: reservation.id } })}
              />
            ) : null}
            {reservation.status !== 'cancelada' ? (
              <PrimaryButton
                label="Fotografías del vehículo"
                onPress={() => router.push({ pathname: '/fotos/[id]', params: { id: reservation.id } })}
              />
            ) : null}
            {cancelSuccess ? <Text style={styles.success}>Reservación cancelada correctamente.</Text> : null}
            {!cancelSuccess && canCancel(reservation.status) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: cancelling }}
                disabled={cancelling}
                onPress={requestCancellation}
                style={[styles.cancelButton, cancelling && styles.cancelButtonDisabled]}
              >
                <Text style={styles.cancelButtonText}>{cancelling ? 'Cancelando reservación…' : 'Cancelar reservación'}</Text>
              </Pressable>
            ) : null}
            {!cancelSuccess && !canCancel(reservation.status) && reservation.status !== 'cancelada' ? (
              <Text style={styles.message}>Esta reservación ya no se puede cancelar.</Text>
            ) : null}
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
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  warning: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  success: { color: colors.primary, fontSize: 15, lineHeight: 21 },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  detail: { color: colors.text, fontSize: 16, lineHeight: 23 },
  status: { color: colors.text, fontSize: 16, fontWeight: '700' },
  qr: { color: colors.primary, fontSize: 16, fontWeight: '700', lineHeight: 23 },
  cancelButton: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
  cancelButtonDisabled: { opacity: 0.65 },
  cancelButtonText: { color: colors.surface, fontSize: 16, fontWeight: '700' },
});

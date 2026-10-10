import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PaymentSheetError, useStripe } from '../../../lib/stripeNative';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '../../../components/BackButton';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { Screen } from '../../../components/Screen';
import { colors, spacing } from '../../../constants/theme';
import { paymentService, type PaymentService } from '../../../services/paymentService';
import { reservationService, type ReservationService } from '../../../services/reservationService';
import { isStripeAvailable } from '../../../lib/stripe';
import { getUserFacingErrorMessage } from '../../../utils/userFacingError';
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../../../types/payment';
import type { Reservation } from '../../../types/reservation';

interface PaymentRouteProps {
  paymentService?: Pick<PaymentService, 'checkout' | 'createStripePaymentIntent'>;
  reservationService?: Pick<ReservationService, 'getReservation'>;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
  mercado_pago: 'Mercado Pago',
  efectivo: 'Efectivo',
  otro: 'Otro',
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

export default function PaymentRoute({
  paymentService: paymentReader = paymentService,
  reservationService: reservationReader = reservationService,
}: PaymentRouteProps) {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(rawId);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const stripeMode = isStripeAvailable();

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
      setError('No se pudo cargar la reservación para el pago.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [id, reservationReader]);

  useEffect(() => {
    void loadReservation();
  }, [loadReservation]);

  const submitPayment = async () => {
    if (!reservation || processing || (!stripeMode && !selectedMethod)) {
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      if (stripeMode) {
        if (!isStripeAvailable()) {
          throw new Error('Stripe no está configurado en este build.');
        }

        const stripeSession = await paymentReader.createStripePaymentIntent(reservation.id);
        const { error: initializationError } = await initPaymentSheet({
          merchantDisplayName: 'CarWashNow',
          paymentIntentClientSecret: stripeSession.clientSecret,
          returnURL: 'carwashnow://stripe-redirect',
          paymentMethodOrder: ['card'],
        });
        if (initializationError) {
          throw new Error(initializationError.message);
        }

        const { error: presentationError } = await presentPaymentSheet();
        if (presentationError) {
          if (presentationError.code === PaymentSheetError.Canceled) {
            return;
          }
          throw new Error(presentationError.message);
        }

        router.push({
          pathname: '/pago/resultado/[paymentId]',
          params: { paymentId: stripeSession.payment.id },
        });
        return;
      }

      if (!selectedMethod) {
        return;
      }
      const result = await paymentReader.checkout({
        reservationId: reservation.id,
        method: selectedMethod,
      });
      router.push({
        pathname: '/pago/resultado/[paymentId]',
        params: { paymentId: result.payment.id },
      });
    } catch (paymentError) {
      const paymentErrorMessage = getUserFacingErrorMessage(paymentError, 'Ocurrió un error inesperado.');
      const paymentErrorPrefix = stripeMode
        ? 'No se pudo procesar el pago con Stripe'
        : 'No se pudo procesar el pago en el entorno de prueba';
      setError(paymentErrorMessage === `${paymentErrorPrefix}.`
        ? `${paymentErrorPrefix}.`
        : `${paymentErrorPrefix}: ${paymentErrorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <BackButton fallback="/reservaciones" />
        <Text style={styles.title}>Pago de reservación</Text>
        <Text style={styles.sandboxLabel}>{stripeMode ? 'Pago seguro con Stripe' : 'Entorno de prueba'}</Text>
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
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{reservation.autolavadoName}</Text>
              <Text style={styles.detail}>Servicio: {reservation.serviceName}</Text>
              <Text style={styles.detail}>Vehículo: {reservation.vehicleBrand} {reservation.vehicleModel}</Text>
              <Text style={styles.detail}>Fecha: {reservation.date}</Text>
              <Text style={styles.detail}>Hora: {reservation.time}</Text>
              <Text style={styles.total}>Total: ${formatPrice(reservation.price)}</Text>
            </View>
            <View style={styles.card}>
              {stripeMode ? (
                <>
                  <Text style={styles.sectionTitle}>Paga de forma segura con Stripe</Text>
                  <Text style={styles.message}>
                    Stripe gestionará los datos de tu tarjeta. CarWashNow no almacena números de tarjeta ni CVV.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Selecciona un método de pago</Text>
                  {PAYMENT_METHODS.map((method) => (
                    <Pressable
                      key={method}
                      accessibilityRole="button"
                      accessibilityLabel={`Método de pago: ${PAYMENT_METHOD_LABELS[method]}`}
                      accessibilityState={{ selected: selectedMethod === method }}
                      onPress={() => setSelectedMethod(method)}
                      style={[styles.method, selectedMethod === method && styles.methodSelected]}
                    >
                      <Text style={styles.methodTitle}>{PAYMENT_METHOD_LABELS[method]}</Text>
                    </Pressable>
                  ))}
                </>
              )}
              <PrimaryButton
                label={stripeMode ? 'Pagar con Stripe' : 'Pagar en entorno de prueba'}
                onPress={() => void submitPayment()}
                loading={processing}
                disabled={(!stripeMode && !selectedMethod) || processing}
              />
            </View>
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
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  detail: { color: colors.text, fontSize: 16, lineHeight: 23 },
  total: { color: colors.primary, fontSize: 20, fontWeight: '700' },
  method: { gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  methodSelected: { borderColor: colors.primary, backgroundColor: colors.softBlue },
  methodTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BackButton } from '../../components/BackButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../constants/theme';
import { paymentService, type PaymentService } from '../../services/paymentService';
import type { PaymentHistoryItem, PaymentMethod, PaymentStatus } from '../../types/payment';
import type { ReservationStatus } from '../../types/reservation';

interface PaymentHistoryRouteProps {
  paymentService?: Pick<PaymentService, 'listPayments'>;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
  mercado_pago: 'Mercado Pago',
  efectivo: 'Efectivo',
  otro: 'Otro',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pendiente: 'Pendiente',
  procesando: 'En procesamiento',
  pagado: 'Pagado',
  rechazado: 'Rechazado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
};

const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cliente_llego: 'Cliente llegó',
  en_espera: 'En espera',
  en_lavado: 'En lavado',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

function formatTime(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

function PaymentHistoryCard({ item }: { item: PaymentHistoryItem }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.reservation.autolavadoName}</Text>
      <Text style={styles.detail}>Reservación: {item.reservation.reservationId}</Text>
      <Text style={styles.detail}>Servicio: {item.reservation.serviceName}</Text>
      <Text style={styles.detail}>Fecha: {item.reservation.reservationDate}</Text>
      <Text style={styles.detail}>Hora: {formatTime(item.reservation.reservationTime)}</Text>
      <Text style={styles.total}>Monto: ${formatPrice(item.payment.amount)}</Text>
      <Text style={styles.detail}>Método: {PAYMENT_METHOD_LABELS[item.payment.method]}</Text>
      <Text style={styles.status}>Estado del pago: {PAYMENT_STATUS_LABELS[item.payment.status]}</Text>
      <Text style={styles.detail}>
        Estado de la reservación: {RESERVATION_STATUS_LABELS[item.reservation.reservationStatus]}
      </Text>
    </View>
  );
}

export default function PaymentHistoryRoute({
  paymentService: paymentReader = paymentService,
}: PaymentHistoryRouteProps) {
  const [items, setItems] = useState<PaymentHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadHistory = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const history = await paymentReader.listPayments();
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setItems(history.items);
    } catch {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setItems(null);
      setError('No se pudo cargar tu historial de pagos.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [paymentReader]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <Screen>
      <View style={styles.content}>
          <BackButton fallback="/" />
        <Text style={styles.title}>Historial de pagos</Text>
        <Text style={styles.notice}>Consulta los pagos asociados a tus reservaciones.</Text>
        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando tu historial de pagos…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadHistory()} /> : null}
        {!loading && !error && items ? (
          <>
            <PrimaryButton label="Actualizar historial" onPress={() => void loadHistory()} />
            {items.length === 0 ? (
              <Text style={styles.message}>Todavía no tienes pagos registrados.</Text>
            ) : (
              items.map((item) => <PaymentHistoryCard key={item.payment.id} item={item} />)
            )}
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
  notice: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  detail: { color: colors.text, fontSize: 15, lineHeight: 22 },
  total: { color: colors.primary, fontSize: 19, fontWeight: '700' },
  status: { color: colors.text, fontSize: 15, fontWeight: '700' },
});

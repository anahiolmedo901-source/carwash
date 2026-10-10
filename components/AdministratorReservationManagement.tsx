import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  AdministratorChoiceButton,
  AdministratorDestructiveButton,
  AdministratorPageHeader,
  AdministratorSecondaryButton,
  formatAdministratorCurrency,
  getAdministratorErrorMessage,
} from './AdministratorUI';
import { PrimaryButton } from './PrimaryButton';
import { Screen } from './Screen';
import { TextField } from './TextField';
import { colors, spacing } from '../constants/theme';
import { administratorService as defaultAdministratorService } from '../services/administratorService';
import type { AdministratorReservation, AdministratorService } from '../types/administrator';
import { RESERVATION_STATUSES, type ReservationStatus } from '../types/reservation';
import { isAtLeastAsFresh } from '../utils/realtimeFreshness';

const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cliente_llego: 'Cliente llegó',
  en_espera: 'En espera',
  en_lavado: 'En lavado',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

const NEXT_RESERVATION_STATUSES: Record<ReservationStatus, readonly ReservationStatus[]> = {
  pendiente: ['confirmada', 'cancelada'],
  confirmada: ['cliente_llego', 'cancelada'],
  cliente_llego: ['en_espera', 'en_lavado'],
  en_espera: ['en_lavado'],
  en_lavado: ['finalizada'],
  finalizada: [],
  cancelada: [],
};

function getReservationActionLabel(status: ReservationStatus): string {
  if (status === 'confirmada') {
    return 'Autorizar reservación';
  }
  return RESERVATION_STATUS_LABELS[status];
}

type ReservationFilter = ReservationStatus | 'todos';

interface AdministratorReservationManagementProps {
  service?: AdministratorService;
}

export default function AdministratorReservationManagement({
  service = defaultAdministratorService,
}: AdministratorReservationManagementProps) {
  const [reservations, setReservations] = useState<AdministratorReservation[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReservationFilter>('todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const loadedReservations = await service.listReservations();
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setReservations(loadedReservations);
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setError(`No se pudieron cargar las reservaciones: ${getAdministratorErrorMessage(loadError, 'La solicitud falló.')}`);
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [service]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleReservations = reservations.filter((reservation) => {
    if (statusFilter !== 'todos' && reservation.status !== statusFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const searchableText = [
      reservation.id,
      reservation.serviceName,
      reservation.autolavadoName,
      reservation.customerFirstName,
      reservation.customerLastName,
      reservation.customerEmail,
      reservation.customerPhone,
      reservation.vehiclePlate,
      reservation.vehicleBrand,
      reservation.vehicleModel,
      reservation.date,
      RESERVATION_STATUS_LABELS[reservation.status],
    ].join(' ').toLowerCase();
    return searchableText.includes(normalizedQuery);
  });

  const selectedReservation = reservations.find((reservation) => reservation.id === selectedId) ?? null;

  const changeStatus = async (reservation: AdministratorReservation, status: ReservationStatus) => {
    if (updatingId) {
      return;
    }
    setUpdatingId(reservation.id);
    setError(null);
    setSuccess(null);
    try {
      const update = await service.updateReservationStatus(reservation.id, status);
      setReservations((current) => current.map((item) => (
        item.id === reservation.id && isAtLeastAsFresh(update.updatedAt, item.updatedAt)
          ? { ...item, status: update.status, updatedAt: update.updatedAt }
          : item
      )));
      setSuccess(`Reservación actualizada a ${RESERVATION_STATUS_LABELS[update.status]}.`);
    } catch (updateError) {
      setError(`No se pudo actualizar la reservación: ${getAdministratorErrorMessage(updateError, 'La solicitud falló.')}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const requestStatusChange = (reservation: AdministratorReservation, status: ReservationStatus) => {
    if (status !== 'cancelada') {
      void changeStatus(reservation, status);
      return;
    }
    Alert.alert(
      'Cancelar reservación',
      'La cancelación libera la operación y no se puede revertir desde este panel.',
      [
        { text: 'Volver', style: 'cancel' },
        { text: 'Cancelar reservación', style: 'destructive', onPress: () => void changeStatus(reservation, status) },
      ],
    );
  };

  return (
    <Screen wide>
      <View style={styles.content}>
        <AdministratorPageHeader
          title="Gestión de reservaciones"
          subtitle="El administrador autoriza las reservaciones y controla cada transición operativa desde este panel."
          onBack={() => router.back()}
        />

        <TextField
          label="Buscar reservaciones"
          placeholder="Cliente, placa, servicio o folio"
          value={query}
          onChangeText={setQuery}
        />

        <View style={styles.filterBlock}>
          <Text style={styles.fieldLabel}>Filtrar por estado</Text>
          <View style={styles.filterRow}>
            <AdministratorChoiceButton
              label="Todas"
              selected={statusFilter === 'todos'}
              onPress={() => setStatusFilter('todos')}
            />
            {RESERVATION_STATUSES.map((status) => (
              <AdministratorChoiceButton
                key={status}
                label={RESERVATION_STATUS_LABELS[status]}
                selected={statusFilter === status}
                onPress={() => setStatusFilter(status)}
              />
            ))}
          </View>
        </View>

        {success ? <Text style={styles.success}>{success}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando reservaciones…</Text>
          </View>
        ) : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadData()} /> : null}

        {!loading && !error && visibleReservations.length === 0 ? (
          <Text style={styles.message}>No hay reservaciones que coincidan con los filtros.</Text>
        ) : null}

        {!loading && !error ? visibleReservations.map((reservation) => (
          <ReservationCard
            key={reservation.id}
            item={reservation}
            selected={selectedId === reservation.id}
            onOpen={() => setSelectedId(reservation.id)}
          />
        )) : null}

        {selectedReservation ? (
          <ReservationDetail
            item={selectedReservation}
            updating={updatingId === selectedReservation.id}
            onClose={() => setSelectedId(null)}
            onChangeStatus={(status) => requestStatusChange(selectedReservation, status)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function ReservationCard({
  item,
  selected,
  onOpen,
}: {
  item: AdministratorReservation;
  selected: boolean;
  onOpen(): void;
}) {
  return (
    <View style={[styles.card, selected && styles.selectedCard]}>
      <Text style={styles.cardTitle}>{item.serviceName}</Text>
      <Text style={styles.detailText}>{item.autolavadoName}</Text>
      <Text style={styles.detailText}>Fecha: {item.date} a las {item.time.slice(0, 5)}</Text>
      <Text style={styles.detailText}>Cliente: {item.customerFirstName} {item.customerLastName}</Text>
      <Text style={styles.detailText}>Placa: {item.vehiclePlate}</Text>
      <Text style={styles.detailText}>Estado: {RESERVATION_STATUS_LABELS[item.status]}</Text>
      <Text style={styles.detailText}>Importe: {formatAdministratorCurrency(item.price)}</Text>
      <AdministratorSecondaryButton label="Ver detalle" onPress={onOpen} />
    </View>
  );
}

function ReservationDetail({
  item,
  updating,
  onClose,
  onChangeStatus,
}: {
  item: AdministratorReservation;
  updating: boolean;
  onClose(): void;
  onChangeStatus(status: ReservationStatus): void;
}) {
  const nextStatuses = NEXT_RESERVATION_STATUSES[item.status];
  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHeading}>
        <View style={styles.detailHeadingCopy}>
          <Text style={styles.sectionTitle}>Detalle de reservación</Text>
          <Text style={styles.detailText}>Folio: {item.id}</Text>
        </View>
        <AdministratorSecondaryButton label="Cerrar" onPress={onClose} disabled={updating} />
      </View>
      <Text style={styles.detailText}>Servicio: {item.serviceName}</Text>
      <Text style={styles.detailText}>Autolavado: {item.autolavadoName}</Text>
      <Text style={styles.detailText}>Fecha y hora: {item.date} {item.time.slice(0, 5)}</Text>
      <Text style={styles.detailText}>Duración: {item.durationMinutes} minutos</Text>
      <Text style={styles.detailText}>Estado actual: {RESERVATION_STATUS_LABELS[item.status]}</Text>
      <Text style={styles.detailText}>Cliente: {item.customerFirstName} {item.customerLastName}</Text>
      <Text style={styles.detailText}>Contacto: {item.customerEmail} · {item.customerPhone}</Text>
      <Text style={styles.detailText}>Vehículo: {item.vehicleBrand} {item.vehicleModel} · Placa {item.vehiclePlate}</Text>
      <Text style={styles.detailText}>Espacio: {item.spaceId ?? 'Sin espacio asignado'}</Text>
      <Text style={styles.detailText}>Precio: {formatAdministratorCurrency(item.price)}</Text>
      <Text style={styles.detailText}>
        Pago: {item.paymentStatus ?? 'No registrado'}
        {item.paymentAmount === null ? '' : ` · ${formatAdministratorCurrency(item.paymentAmount)}`}
      </Text>
      <Text style={styles.detailText}>Creada: {item.createdAt}</Text>
      <Text style={styles.detailText}>Actualizada: {item.updatedAt}</Text>

      <Text style={styles.fieldLabel}>Siguiente estado operativo</Text>
      {nextStatuses.length === 0 ? (
        <Text style={styles.message}>No hay transiciones disponibles para este estado.</Text>
      ) : (
        <View style={styles.statusActions}>
          {nextStatuses.map((status) => status === 'cancelada' ? (
              <AdministratorDestructiveButton
                key={status}
                label={getReservationActionLabel(status)}
              onPress={() => onChangeStatus(status)}
              disabled={updating}
            />
          ) : (
            <AdministratorSecondaryButton
              key={status}
              label={getReservationActionLabel(status)}
              onPress={() => onChangeStatus(status)}
              disabled={updating}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  title: { color: colors.text, fontSize: 27, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  filterBlock: { gap: spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  statusActions: { gap: spacing.sm },
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  success: { color: colors.primaryDark, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  card: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surfaceSubtle, elevation: 1, shadowColor: colors.navy, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  selectedCard: { borderWidth: 2, borderColor: colors.primary },
  cardTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  detailCard: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: '#B8D8EE', borderRadius: 22, backgroundColor: colors.softBlue },
  detailHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  detailHeadingCopy: { flex: 1, gap: spacing.xs },
  sectionTitle: { color: colors.navy, fontSize: 21, fontWeight: '800' },
  detailText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '../../components/BackButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ReservationDatePicker } from '../../components/ReservationDatePicker';
import { ReservationTimePicker } from '../../components/ReservationTimePicker';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../constants/theme';
import { autolavadoService } from '../../services/autolavadoService';
import { reservationService, type ReservationService } from '../../services/reservationService';
import { realtimeService as defaultRealtimeService, type RealtimeService } from '../../services/realtimeService';
import { vehicleService } from '../../services/vehicleService';
import { useOptionalAuth } from '../../context/AuthContext';
import type { AutolavadoDetail, AutolavadoService } from '../../types/autolavado';
import type { Reservation } from '../../types/reservation';
import type { ReservationStatusUpdate, SpaceStatus, SpaceStatusUpdate } from '../../types/realtime';
import type { VehicleService } from '../../services/vehicleService';
import type { VehicleRpcRow } from '../../types/database';
import { getUserFacingErrorMessage } from '../../utils/userFacingError';
import { isAtLeastAsFresh } from '../../utils/realtimeFreshness';
import { getReservationTimeSlots, isReservationDateAllowed } from '../../utils/reservationSchedule';

type ReservationParams = Record<string, string | string[]> & {
  autolavadoId?: string | string[];
  autolavadoName?: string | string[];
  serviceId?: string | string[];
  serviceName?: string | string[];
};

interface ReservationRouteProps {
  autolavadoReader?: Pick<AutolavadoService, 'getAutolavado'>;
  vehicleReader?: Pick<VehicleService, 'listVehicles'>;
  reservationReader?: Pick<ReservationService, 'getAvailableSpaces' | 'createReservation'>;
  realtimeService?: Pick<RealtimeService, 'subscribeToCustomerReservations' | 'subscribeToSpaceStatus'>;
  customerId?: string;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

export function isValidBusinessDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day;
}

export function isValidBusinessTime(value: string): boolean {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return false;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function displayError(error: unknown): string {
  return getUserFacingErrorMessage(error, 'Ocurrió un error inesperado.');
}

const SPACE_STATUS_LABELS: Record<SpaceStatus, string> = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  ocupado: 'Ocupado',
  mantenimiento: 'En mantenimiento',
};

export function getSpaceStatusLabel(status: SpaceStatus): string {
  return SPACE_STATUS_LABELS[status];
}

export default function ReservationRoute({
  autolavadoReader = autolavadoService,
  vehicleReader = vehicleService,
  reservationReader = reservationService,
  realtimeService: realtimeReader = defaultRealtimeService,
  customerId,
}: ReservationRouteProps) {
  const params = useLocalSearchParams<ReservationParams>();
  const autolavadoId = firstParam(params.autolavadoId);
  const serviceId = firstParam(params.serviceId);
  const auth = useOptionalAuth();
  const authenticatedCustomerId = auth?.state.status === 'signed-in' ? auth.state.profile.id : undefined;
  const resolvedCustomerId = customerId ?? authenticatedCustomerId;
  const contextAutolavadoName = firstParam(params.autolavadoName);
  const contextServiceName = firstParam(params.serviceName);
  const [detail, setDetail] = useState<AutolavadoDetail | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRpcRow[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Awaited<ReturnType<ReservationService['getAvailableSpaces']>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdReservation, setCreatedReservation] = useState<Reservation | null>(null);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [spaceStatuses, setSpaceStatuses] = useState<Record<string, SpaceStatus>>({});
  const [realtimeWarning, setRealtimeWarning] = useState<string | null>(null);
  const selectedSpaceIdRef = useRef<string | null>(null);
  const spaceStatusUpdatedAtRef = useRef<Record<string, string>>({});
  const contextRequestRef = useRef(0);

  const selectedService = useMemo(
    () => detail?.services.find((service) => service.id === serviceId) ?? null,
    [detail, serviceId],
  );
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [selectedVehicleId, vehicles],
  );
  const dateWithinWindow = isReservationDateAllowed(date);
  const validDate = isValidBusinessDate(date) && dateWithinWindow;
  const timeSlots = selectedService && detail
    ? getReservationTimeSlots(detail.hours, selectedService.approximateDurationMinutes, date)
    : [];
  const validTime = isValidBusinessTime(time) && timeSlots.includes(time);
  const contextError = !autolavadoId || !serviceId
    ? 'No se recibió el autolavado o servicio seleccionado.'
    : null;

  const loadContext = useCallback(async () => {
    const requestId = ++contextRequestRef.current;
    setLoading(true);
    setLoadError(null);
    if (contextError || !autolavadoId || !serviceId) {
      if (requestId === contextRequestRef.current) {
        setLoading(false);
      }
      return;
    }

    try {
      const [loadedDetail, loadedVehicles] = await Promise.all([
        autolavadoReader.getAutolavado(autolavadoId),
        vehicleReader.listVehicles(),
      ]);
      if (requestId !== contextRequestRef.current) {
        return;
      }
      if (!loadedDetail) {
        setLoadError('No se encontró el autolavado solicitado.');
      } else if (!loadedDetail.services.some((service) => service.id === serviceId)) {
        setLoadError('El servicio seleccionado no está disponible en este autolavado.');
      } else {
        setDetail(loadedDetail);
        setVehicles(loadedVehicles);
      }
    } catch (error) {
      if (requestId !== contextRequestRef.current) {
        return;
      }
      setLoadError(displayError(error));
    } finally {
      if (requestId === contextRequestRef.current) {
        setLoading(false);
      }
    }
  }, [autolavadoId, autolavadoReader, contextError, serviceId, vehicleReader]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    selectedSpaceIdRef.current = null;
    setSpaceStatuses({});
    spaceStatusUpdatedAtRef.current = {};
  }, [autolavadoId, serviceId]);

  useEffect(() => {
    if (!autolavadoId) {
      return undefined;
    }

    return realtimeReader.subscribeToSpaceStatus(
      autolavadoId,
      (update: SpaceStatusUpdate) => {
        const previousUpdatedAt = spaceStatusUpdatedAtRef.current[update.entityId];
        if (!isAtLeastAsFresh(update.updatedAt, previousUpdatedAt)) {
          return;
        }
        spaceStatusUpdatedAtRef.current[update.entityId] = update.updatedAt;
        setSpaceStatuses((current) => ({ ...current, [update.entityId]: update.status }));
        if (update.status !== 'disponible' && selectedSpaceIdRef.current === update.entityId) {
          selectedSpaceIdRef.current = null;
          setSelectedSpaceId(null);
        }
        setAvailability(null);
        setAvailabilityError(null);
        setReviewing(false);
        setAvailabilityRetry((value) => value + 1);
      },
      () => setRealtimeWarning('Las actualizaciones de espacios no están disponibles por ahora.'),
    );
  }, [autolavadoId, realtimeReader]);

  const createdReservationId = createdReservation?.id;

  useEffect(() => {
    if (!createdReservationId || !resolvedCustomerId) {
      return undefined;
    }

    return realtimeReader.subscribeToCustomerReservations(
      resolvedCustomerId,
      (update: ReservationStatusUpdate) => {
        if (update.entityId !== createdReservationId) {
          return;
        }
        setCreatedReservation((current) => current
          && isAtLeastAsFresh(update.updatedAt, current.updatedAt)
          ? { ...current, status: update.status, updatedAt: update.updatedAt }
          : current);
      },
      () => setRealtimeWarning('Las actualizaciones de la reservación no están disponibles por ahora.'),
    );
  }, [createdReservationId, realtimeReader, resolvedCustomerId]);

  useEffect(() => {
    setAvailability(null);
    setAvailabilityError(null);
    setSelectedSpaceId(null);
    selectedSpaceIdRef.current = null;
    setReviewing(false);
    if (!selectedVehicleId || !validDate || !validTime || !autolavadoId || !serviceId || createdReservation) {
      setLoadingAvailability(false);
      return undefined;
    }

    let current = true;
    setLoadingAvailability(true);
    void reservationReader.getAvailableSpaces({
      autolavadoId,
      serviceId,
      date,
      time,
    }).then((result) => {
      if (current) {
        setAvailability(result);
      }
    }).catch(() => {
      if (current) {
        setAvailabilityError('No se pudo consultar la disponibilidad.');
      }
    }).finally(() => {
      if (current) {
        setLoadingAvailability(false);
      }
    });

    return () => {
      current = false;
    };
  }, [autolavadoId, date, selectedVehicleId, serviceId, time, validDate, validTime, reservationReader, createdReservation, availabilityRetry]);

  const updateDate = (value: string) => {
    setDate(value);
    setTime('');
    setAvailability(null);
    setAvailabilityError(null);
    setSelectedSpaceId(null);
    selectedSpaceIdRef.current = null;
    setReviewing(false);
    setCreateError(null);
  };

  const updateTime = (value: string) => {
    setTime(value);
    setAvailability(null);
    setAvailabilityError(null);
    setSelectedSpaceId(null);
    selectedSpaceIdRef.current = null;
    setReviewing(false);
    setCreateError(null);
  };

  const selectVehicle = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    setAvailability(null);
    setAvailabilityError(null);
    setSelectedSpaceId(null);
    selectedSpaceIdRef.current = null;
    setReviewing(false);
    setCreatedReservation(null);
    setCreateError(null);
  };

  const selectSpace = (spaceId: string) => {
    selectedSpaceIdRef.current = spaceId;
    setSelectedSpaceId(spaceId);
  };

  const canReview = Boolean(
    detail
      && selectedService
      && selectedVehicle
      && validDate
      && validTime
      && availability?.available
      && (!availability.requiresSpace || selectedSpaceId),
  );

  const confirmReservation = async () => {
    if (!canReview || !autolavadoId || !serviceId || !selectedVehicleId) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const result = await reservationReader.createReservation({
        autolavadoId,
        serviceId,
        vehicleId: selectedVehicleId,
        date,
        time,
        spaceId: selectedSpaceId,
      });
      setCreatedReservation(result);
      router.push({ pathname: '/pago/resumen/[id]', params: { id: result.id } });
    } catch (error) {
      setCreateError(`No se pudo crear la reservación: ${displayError(error)}`);
      setReviewing(true);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <BackButton fallback="/autolavados" />
        <Text style={styles.title}>Reservar servicio</Text>
        {contextAutolavadoName || detail?.name ? <Text style={styles.context}>{detail?.name ?? contextAutolavadoName}</Text> : null}
        {contextServiceName || selectedService?.name ? <Text style={styles.context}>{selectedService?.name ?? contextServiceName}</Text> : null}

        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando datos para reservar…</Text>
          </View>
        ) : null}
        {contextError ? <Text accessibilityRole="alert" style={styles.error}>{contextError}</Text> : null}
        {realtimeWarning ? <Text style={styles.warning}>{realtimeWarning}</Text> : null}
        {loadError ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
            <PrimaryButton label="Reintentar" onPress={() => void loadContext()} />
          </>
        ) : null}

        {!loading && !loadError && !contextError && detail && selectedService ? (
          <>
            {createdReservation ? (
              <PaymentHandoffCard />
            ) : (
              <>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Selecciona un vehículo</Text>
                  {vehicles.length === 0 ? (
                    <Text style={styles.message}>No tienes vehículos registrados. Agrega un vehículo antes de reservar.</Text>
                  ) : (
                    vehicles.map((vehicle) => {
                      const vehicleName = `${vehicle.marca} ${vehicle.modelo}`;
                      const selected = selectedVehicleId === vehicle.id;
                      return (
                        <Pressable
                          key={vehicle.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Seleccionar ${vehicleName}`}
                          accessibilityState={{ selected }}
                          onPress={() => selectVehicle(vehicle.id)}
                          style={[styles.option, selected && styles.optionSelected]}
                        >
                          <Text style={styles.optionTitle}>{vehicleName}</Text>
                          <Text style={styles.optionDetail}>Placas: {vehicle.placas}</Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>

                {selectedVehicle ? (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Selecciona la fecha</Text>
                    <TextInput
                      accessibilityLabel="Fecha"
                      autoCapitalize="none"
                      editable={false}
                      placeholder="Selecciona una fecha"
                      showSoftInputOnFocus={false}
                      style={styles.input}
                      value={date}
                    />
                    <ReservationDatePicker value={date} onChange={updateDate} />
                    {date && !isValidBusinessDate(date) ? <Text style={styles.error}>Ingresa una fecha válida con formato AAAA-MM-DD.</Text> : null}
                    {date && isValidBusinessDate(date) && !dateWithinWindow ? <Text style={styles.error}>La fecha debe estar entre hoy y un mes a futuro.</Text> : null}
                  </View>
                ) : null}

                {selectedVehicle && validDate ? (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Selecciona la hora</Text>
                    <TextInput
                      accessibilityLabel="Hora"
                      autoCapitalize="none"
                      editable={false}
                      placeholder="Selecciona un horario"
                      showSoftInputOnFocus={false}
                      style={styles.input}
                      value={time}
                    />
                    <ReservationTimePicker
                      hours={detail.hours}
                      durationMinutes={selectedService.approximateDurationMinutes}
                      date={date}
                      value={time}
                      onChange={updateTime}
                    />
                    {time && !validTime ? <Text style={styles.error}>Selecciona uno de los horarios disponibles.</Text> : null}
                    {loadingAvailability ? <Text style={styles.message}>Consultando disponibilidad…</Text> : null}
                    {availabilityError ? (
                      <>
                        <Text accessibilityRole="alert" style={styles.error}>{availabilityError}</Text>
                        <PrimaryButton label="Reintentar disponibilidad" onPress={() => setAvailabilityRetry((value) => value + 1)} />
                      </>
                    ) : null}
                    {availability && !loadingAvailability && !availabilityError && !availability.available ? (
                      <Text style={styles.error}>
                        {availability.requiresSpace
                          ? 'No hay espacios disponibles para este horario.'
                          : 'El autolavado está ocupado para este horario.'}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {Object.keys(spaceStatuses).length > 0 ? (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Estado de los espacios</Text>
                    <SpaceStatusSummary statuses={spaceStatuses} />
                  </View>
                ) : null}

                {availability?.requiresSpace && availability.available ? (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Selecciona un espacio disponible</Text>
                    {availability.spaces.map((space) => (
                      <Pressable
                        key={space.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Seleccionar espacio ${space.id}`}
                        accessibilityState={{ selected: selectedSpaceId === space.id }}
                        onPress={() => selectSpace(space.id)}
                        style={[styles.option, selectedSpaceId === space.id && styles.optionSelected]}
                      >
                        <Text style={styles.optionTitle}>Espacio {space.id}</Text>
                        <Text style={styles.optionDetail}>
                          {spaceStatuses[space.id]
                            ? `Estado: ${getSpaceStatusLabel(spaceStatuses[space.id])}`
                            : 'Disponible para la fecha y hora seleccionadas.'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {canReview && !reviewing ? (
                  <PrimaryButton label="Revisar reservación" onPress={() => setReviewing(true)} />
                ) : null}
                {reviewing && selectedVehicle ? (
                  <ReviewCard
                    detail={detail}
                    selectedService={selectedService}
                    selectedVehicle={selectedVehicle}
                    date={date}
                    time={time}
                    onConfirm={() => void confirmReservation()}
                    onBack={() => setReviewing(false)}
                    creating={creating}
                    error={createError}
                  />
                ) : null}
              </>
            )}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function ReviewCard({
  detail,
  selectedService,
  selectedVehicle,
  date,
  time,
  onConfirm,
  onBack,
  creating,
  error,
}: {
  detail: AutolavadoDetail;
  selectedService: AutolavadoDetail['services'][number];
  selectedVehicle: VehicleRpcRow;
  date: string;
  time: string;
  onConfirm: () => void;
  onBack: () => void;
  creating: boolean;
  error: string | null;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Resumen de reservación</Text>
      <Text style={styles.summary}>Autolavado: {detail.name}</Text>
      <Text style={styles.summary}>Vehículo: {selectedVehicle.marca} {selectedVehicle.modelo}</Text>
      <Text style={styles.summary}>Servicio: {selectedService.name}</Text>
      <Text style={styles.summary}>Precio: ${formatPrice(selectedService.price)}</Text>
      <Text style={styles.summary}>Duración: {formatPrice(selectedService.approximateDurationMinutes)} minutos</Text>
      <Text style={styles.summary}>Fecha: {date}</Text>
      <Text style={styles.summary}>Hora: {time}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Confirmar reservación" onPress={onConfirm} loading={creating} disabled={creating} />
      <Pressable accessibilityRole="button" accessibilityLabel="Editar selección" disabled={creating} onPress={onBack} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Editar selección</Text>
      </Pressable>
    </View>
  );
}

function PaymentHandoffCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Reservación creada</Text>
      <Text style={styles.success}>La reservación se registró. Continúa al resumen de pago.</Text>
    </View>
  );
}

function SpaceStatusSummary({ statuses }: { statuses: Record<string, SpaceStatus> }) {
  const entries = Object.entries(statuses);
  if (entries.length === 0) {
    return null;
  }
  return (
    <View style={styles.statusSummary}>
      {entries.map(([spaceId, status]) => (
        <Text key={spaceId} style={styles.optionDetail}>
          Estado del espacio {spaceId}: {getSpaceStatusLabel(status)}
        </Text>
      ))}
    </View>
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
  context: { color: colors.muted, fontSize: 16 },
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  warning: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  success: { color: colors.primary, fontSize: 15, lineHeight: 21 },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  option: { gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.softBlue },
  optionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  optionDetail: { color: colors.muted, fontSize: 14 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: spacing.md, color: colors.text, fontSize: 16 },
  summary: { color: colors.text, fontSize: 16, lineHeight: 23 },
  statusSummary: { gap: spacing.xs },
  secondaryButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  secondaryButtonText: { color: colors.primary, fontWeight: '700' },
});

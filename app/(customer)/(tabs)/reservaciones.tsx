import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { ReservationProgress } from '../../../components/ReservationProgress';
import { Screen } from '../../../components/Screen';
import { colors, radii, shadows, spacing } from '../../../constants/theme';
import { useOptionalAuth } from '../../../context/AuthContext';
import { reservationService, type ReservationService } from '../../../services/reservationService';
import { realtimeService as defaultRealtimeService, type RealtimeService } from '../../../services/realtimeService';
import type { Reservation } from '../../../types/reservation';
import type { ReservationStatusUpdate } from '../../../types/realtime';
import { getReservationStatusLabel } from '../../../components/ReservationProgress';
import { isAtLeastAsFresh } from '../../../utils/realtimeFreshness';

interface ReservationSections {
  upcoming: Reservation[];
  previous: Reservation[];
  cancelled: Reservation[];
}

function currentBusinessDateTime(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function reservationDateTime(reservation: Reservation): string {
  return `${reservation.date}T${reservation.time.slice(0, 5)}`;
}

export function classifyReservations(
  reservations: Reservation[],
  now = currentBusinessDateTime(),
): ReservationSections {
  return reservations.reduce<ReservationSections>((sections, reservation) => {
    if (reservation.status === 'cancelada') {
      sections.cancelled.push(reservation);
    } else if (reservation.status === 'finalizada' || reservationDateTime(reservation) < now) {
      sections.previous.push(reservation);
    } else {
      sections.upcoming.push(reservation);
    }
    return sections;
  }, { upcoming: [], previous: [], cancelled: [] });
}

interface ReservationsRouteProps {
  service?: Pick<ReservationService, 'listReservations'>;
  realtimeService?: Pick<RealtimeService, 'subscribeToCustomerReservations'>;
  customerId?: string;
}

export default function ReservationsRoute({
  service = reservationService,
  realtimeService: realtimeReader = defaultRealtimeService,
  customerId,
}: ReservationsRouteProps) {
  const auth = useOptionalAuth();
  const authenticatedCustomerId = auth?.state.status === 'signed-in' ? auth.state.profile.id : undefined;
  const resolvedCustomerId = customerId ?? authenticatedCustomerId;
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeWarning, setRealtimeWarning] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const latestUpdatesRef = useRef(new Map<string, ReservationStatusUpdate>());

  const loadReservations = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const loadedReservations = await service.listReservations();
      if (requestId !== loadRequestRef.current) {
        return;
      }

      setReservations((current) => {
        const currentById = new Map(current.map((reservation) => [reservation.id, reservation]));
        return loadedReservations.map((loaded) => {
          const currentReservation = currentById.get(loaded.id);
          const latestUpdate = latestUpdatesRef.current.get(loaded.id);
          let next = currentReservation && !isAtLeastAsFresh(loaded.updatedAt, currentReservation.updatedAt)
            ? currentReservation
            : loaded;
          if (latestUpdate && !isAtLeastAsFresh(next.updatedAt, latestUpdate.updatedAt)) {
            next = { ...next, status: latestUpdate.status, updatedAt: latestUpdate.updatedAt };
          }
          return next;
        });
      });
    } catch {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setError('No se pudieron cargar tus reservaciones.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [service]);

  useEffect(() => {
    latestUpdatesRef.current.clear();
  }, [resolvedCustomerId]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    if (!resolvedCustomerId) {
      return undefined;
    }

    return realtimeReader.subscribeToCustomerReservations(
      resolvedCustomerId,
      (update: ReservationStatusUpdate) => {
        latestUpdatesRef.current.set(update.entityId, update);
        setReservations((current) => current.map((reservation) => {
          if (reservation.id !== update.entityId || !isAtLeastAsFresh(update.updatedAt, reservation.updatedAt)) {
            return reservation;
          }
          return { ...reservation, status: update.status, updatedAt: update.updatedAt };
        }));
      },
      () => setRealtimeWarning('Las actualizaciones en tiempo real no están disponibles por ahora.'),
    );
  }, [realtimeReader, resolvedCustomerId]);

  const sections = classifyReservations(reservations);

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>TU ACTIVIDAD</Text>
            <Text style={styles.title}>Mis reservaciones</Text>
            <Text style={styles.subtitle}>Sigue cada visita desde que la agendas hasta que sale reluciente.</Text>
          </View>
          {!loading && !error ? <View style={styles.countPill}><Text style={styles.count}>{reservations.length}</Text><Text style={styles.countLabel}>total</Text></View> : null}
        </View>
        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando tus reservaciones…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {realtimeWarning ? <Text style={styles.warning}>{realtimeWarning}</Text> : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadReservations()} /> : null}
        {!loading && !error && reservations.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>01</Text></View>
            <Text style={styles.emptyTitle}>Tu agenda está libre</Text>
            <Text style={styles.message}>Todavía no tienes reservaciones.</Text>
            <Text style={styles.emptyDescription}>Explora un autolavado y elige el horario que mejor te funcione.</Text>
            <PrimaryButton label="Buscar autolavado" onPress={() => router.push('/autolavados')} />
          </View>
        ) : null}
        {!loading && !error && reservations.length > 0 ? (
          <>
            <ReservationSection title="Próximas" reservations={sections.upcoming} emptyMessage="No tienes reservaciones próximas." />
            <ReservationSection title="Anteriores" reservations={sections.previous} emptyMessage="No tienes reservaciones anteriores." />
            <ReservationSection title="Canceladas" reservations={sections.cancelled} emptyMessage="No tienes reservaciones canceladas." />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function ReservationSection({ title, reservations, emptyMessage }: { title: string; reservations: Reservation[]; emptyMessage: string }) {
  return (
    <View style={styles.section}>
          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionCount}>{reservations.length}</Text></View>
      {reservations.length === 0 ? <Text style={styles.message}>{emptyMessage}</Text> : null}
      {reservations.map((reservation) => (
        <Pressable
          key={reservation.id}
          accessibilityRole="button"
          accessibilityLabel={`Ver reservación de ${reservation.autolavadoName}`}
          onPress={() => router.push({ pathname: '/reservacion/[id]', params: { id: reservation.id } })}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.cardHeading}>
            <View style={styles.cardHeadingCopy}>
              <Text style={styles.cardTitle}>{reservation.autolavadoName}</Text>
              <Text style={styles.detail}>{reservation.serviceName}</Text>
            </View>
            <View style={styles.statusPill}><Text style={styles.statusPillText}>{getReservationStatusLabel(reservation.status)}</Text></View>
          </View>
          <Text style={styles.detail}>Fecha: {reservation.date}</Text>
          <Text style={styles.detail}>Hora: {reservation.time}</Text>
          <Text style={styles.status}>Estado: {getReservationStatusLabel(reservation.status)}</Text>
          <ReservationProgress status={reservation.status} compact />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  header: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 3 },
  title: { color: colors.navy, fontSize: 29, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.xs, maxWidth: 520 },
  countPill: { alignItems: 'center', minWidth: 62, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.md, backgroundColor: colors.softBlue },
  count: { color: colors.primaryDark, fontSize: 20, fontWeight: '900' },
  countLabel: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '700' },
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  warning: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  emptyCard: { alignItems: 'flex-start', gap: spacing.sm, padding: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.surface, ...shadows.card, shadowOpacity: 0.05 },
  emptyIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.accentSoft },
  emptyIconText: { color: colors.accent, fontSize: 15, fontWeight: '900' },
  emptyTitle: { color: colors.navy, fontSize: 20, fontWeight: '800' },
  emptyDescription: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionCount: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface, ...shadows.card, shadowOpacity: 0.05 },
  cardPressed: { opacity: 0.8 },
  cardHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardHeadingCopy: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.navy, fontSize: 18, fontWeight: '800' },
  detail: { color: colors.muted, fontSize: 15 },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.softBlue },
  statusPillText: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' },
  status: { color: colors.text, fontSize: 15, fontWeight: '700' },
});

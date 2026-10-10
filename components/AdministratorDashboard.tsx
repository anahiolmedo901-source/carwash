import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { router } from 'expo-router';
import {
  AdministratorChoiceButton,
  AdministratorStatusBadge,
  formatAdministratorCurrency,
  getAdministratorErrorMessage,
} from './AdministratorUI';
import { PrimaryButton } from './PrimaryButton';
import { Screen } from './Screen';
import { colors, spacing } from '../constants/theme';
import { administratorService as defaultAdministratorService } from '../services/administratorService';
import type {
  AdministratorAutolavado,
  AdministratorDashboard as AdministratorDashboardData,
  AdministratorEmployee,
  AdministratorReservation,
  AdministratorService,
} from '../types/administrator';
import type { PaymentStatus } from '../types/payment';
import type { ReservationStatus } from '../types/reservation';

const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cliente_llego: 'Cliente llegó',
  en_espera: 'En espera',
  en_lavado: 'En lavado',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pendiente: 'Pendiente',
  procesando: 'En procesamiento',
  pagado: 'Pagado',
  rechazado: 'Rechazado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
};

type DashboardSection = 'resumen' | 'catalogo' | 'operacion';

interface AdministratorDashboardProps {
  service?: AdministratorService;
  administratorName: string;
  onSignOut(): void | Promise<void>;
}

export default function AdministratorDashboard({
  service = defaultAdministratorService,
  administratorName,
  onSignOut,
}: AdministratorDashboardProps) {
  const { width } = useWindowDimensions();
  const [dashboard, setDashboard] = useState<AdministratorDashboardData | null>(null);
  const [autolavados, setAutolavados] = useState<AdministratorAutolavado[]>([]);
  const [employees, setEmployees] = useState<AdministratorEmployee[]>([]);
  const [reservations, setReservations] = useState<AdministratorReservation[]>([]);
  const [activeSection, setActiveSection] = useState<DashboardSection>('resumen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const responsiveCardWidth: DimensionValue = width >= 900 ? '31.5%' : '47%';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDashboard(null);
    setAutolavados([]);
    setEmployees([]);
    setReservations([]);

    try {
      const [nextDashboard, nextAutolavados, nextEmployees, nextReservations] = await Promise.all([
        service.getDashboard(),
        service.listAutolavados(),
        service.listEmployees(),
        service.listReservations(),
      ]);
      setDashboard(nextDashboard);
      setAutolavados(nextAutolavados);
      setEmployees(nextEmployees);
      setReservations(nextReservations);
    } catch (loadError) {
      setError(`No se pudieron cargar los datos de administración: ${getAdministratorErrorMessage(loadError, 'La solicitud falló.')}`);
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <Screen wide>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.brandGroup}>
              <View style={styles.brandMark}>
                <Text style={styles.brandInitial}>C</Text>
              </View>
              <View style={styles.brandCopy}>
                <Text style={styles.brand}>CARWASHNOW</Text>
                <Text style={styles.heroEyebrow}>ADMINISTRACIÓN</Text>
              </View>
            </View>
            <AdministratorStatusBadge label="Sesión activa" tone="positive" />
          </View>
          <Text style={styles.title}>Panel de administración</Text>
          <Text style={styles.heroSubtitle}>Control operativo, catálogo y seguimiento del servicio desde un solo lugar.</Text>
          <View style={styles.heroBottom}>
            <Text style={styles.welcome}>Bienvenido, {administratorName}</Text>
            <PrimaryButton label="Cerrar sesión" onPress={() => void onSignOut()} />
          </View>
        </View>

        <View style={styles.sectionIntro}>
          <View>
            <Text style={styles.sectionKicker}>MÓDULOS ADMINISTRATIVOS</Text>
            <Text style={styles.sectionTitle}>Accesos rápidos</Text>
          </View>
        </View>

        <View style={styles.quickGrid}>
          <QuickAction
            width={responsiveCardWidth}
            label="Administrar servicios"
            description="Precios y disponibilidad"
            onPress={() => router.push('/services')}
          />
          <QuickAction
            width={responsiveCardWidth}
            label="Administrar espacios de lavado"
            description="Bahías y capacidad"
            onPress={() => router.push('/washing-spaces')}
          />
          <QuickAction
            width={responsiveCardWidth}
            label="Gestionar reservaciones"
            description="Estados operativos"
            onPress={() => router.push('/reservations')}
          />
          <QuickAction
            width={responsiveCardWidth}
            label="Consultar empleados"
            description="Personal y asignaciones"
            onPress={() => router.push('/employees')}
          />
          <QuickAction
            width={responsiveCardWidth}
            label="Consultar calificaciones"
            description="Feedback del cliente"
            onPress={() => router.push('/ratings')}
          />
        </View>

        <View style={styles.sectionMenu}>
          <View>
            <Text style={styles.sectionKicker}>VISTA DEL PANEL</Text>
            <Text style={styles.menuTitle}>Consulta por sección</Text>
          </View>
          <View style={styles.menuOptions}>
            <AdministratorChoiceButton
              label="Resumen"
              selected={activeSection === 'resumen'}
              onPress={() => setActiveSection('resumen')}
            />
            <AdministratorChoiceButton
              label="Catálogo"
              selected={activeSection === 'catalogo'}
              onPress={() => setActiveSection('catalogo')}
            />
            <AdministratorChoiceButton
              label="Operación"
              selected={activeSection === 'operacion'}
              onPress={() => setActiveSection('operacion')}
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando los datos de administración…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadData()} /> : null}

        {!loading && !error && dashboard && activeSection === 'resumen' ? (
          <SummarySection dashboard={dashboard} width={responsiveCardWidth} />
        ) : null}

        {!loading && !error && activeSection === 'catalogo' ? (
          <CatalogSection autolavados={autolavados} />
        ) : null}

        {!loading && !error && activeSection === 'operacion' ? (
          <OperationsSection employees={employees} reservations={reservations} />
        ) : null}
      </View>
    </Screen>
  );
}

function QuickAction({
  description,
  label,
  onPress,
  width,
}: {
  description: string;
  label: string;
  onPress(): void;
  width: DimensionValue;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, { width }, pressed && styles.quickActionPressed]}
    >
      <View style={styles.quickActionTop}>
        <View style={styles.quickActionMark}>
          <View style={styles.quickActionDot} />
        </View>
        <Text style={styles.quickActionArrow}>-&gt;</Text>
      </View>
      <Text style={styles.quickActionTitle}>{label}</Text>
      <Text style={styles.quickActionDescription}>{description}</Text>
    </Pressable>
  );
}

function SummarySection({
  dashboard,
  width,
}: {
  dashboard: AdministratorDashboardData;
  width: DimensionValue;
}) {
  return (
    <View style={styles.sectionContent}>
      <View style={styles.sectionIntro}>
        <View>
          <Text style={styles.sectionKicker}>RESUMEN EN TIEMPO REAL</Text>
          <Text style={styles.sectionTitle}>Indicadores de hoy</Text>
        </View>
        <Text style={styles.sectionNote}>Datos calculados por el servidor</Text>
      </View>
      <View style={styles.metricGrid}>
        <MetricCard width={width} label="Reservaciones de hoy" value={String(dashboard.todayReservations)} accent={colors.primary} />
        <MetricCard width={width} label="Ingresos recaudados" value={formatAdministratorCurrency(dashboard.collectedRevenue)} accent={colors.success} />
        <MetricCard width={width} label="Servicios finalizados" value={String(dashboard.completedServices)} accent={colors.primaryDark} />
        <MetricCard width={width} label="Vehículos en lavado" value={String(dashboard.vehiclesCurrentlyWashing)} accent={colors.warning} />
        <MetricCard width={width} label="Calificación promedio" value={`${dashboard.averageRating.toFixed(2)} / 5`} accent={colors.success} />
        <MetricCard width={width} label="Opiniones recibidas" value={String(dashboard.ratingCount)} accent={colors.primary} />
      </View>
    </View>
  );
}

function CatalogSection({ autolavados }: { autolavados: AdministratorAutolavado[] }) {
  return (
    <ReadOnlySection title="Autolavados" count={autolavados.length}>
      {autolavados.length === 0 ? (
        <Text style={styles.message}>No hay autolavados disponibles.</Text>
      ) : (
        autolavados.map((autolavado) => (
          <View key={autolavado.id} style={styles.card}>
            <Text style={styles.cardTitle}>{autolavado.name}</Text>
            <Text style={styles.detailText}>Resumen del catálogo de solo lectura</Text>
          </View>
        ))
      )}
    </ReadOnlySection>
  );
}

function OperationsSection({
  employees,
  reservations,
}: {
  employees: AdministratorEmployee[];
  reservations: AdministratorReservation[];
}) {
  return (
    <View style={styles.sectionContent}>
      <ReadOnlySection title="Empleados" count={employees.length}>
        {employees.length === 0 ? (
          <Text style={styles.message}>No hay empleados disponibles.</Text>
        ) : (
          employees.map((employee) => (
            <View key={employee.id} style={styles.card}>
              <View style={styles.cardHeading}>
                <Text style={styles.cardTitle}>{employee.firstName} {employee.lastName}</Text>
                <AdministratorStatusBadge label={employee.active ? 'Activo' : 'Inactivo'} tone={employee.active ? 'positive' : 'neutral'} />
              </View>
              <Text style={styles.detailText}>{employee.email}</Text>
              <Text style={styles.detailText}>{employee.phone}</Text>
              <Text style={styles.detailText}>
                {employee.assignments.length === 0
                  ? 'Sin asignación de autolavado'
                  : `Autolavados asignados: ${employee.assignments.map((assignment) => assignment.autolavadoName).join(', ')}`}
              </Text>
            </View>
          ))
        )}
      </ReadOnlySection>

      <ReadOnlySection title="Reservaciones" count={reservations.length}>
        {reservations.length === 0 ? (
          <Text style={styles.message}>No hay reservaciones disponibles.</Text>
        ) : (
          reservations.map((reservation) => (
            <View key={reservation.id} style={styles.card}>
              <View style={styles.cardHeading}>
                <Text style={styles.cardTitle}>{reservation.serviceName}</Text>
                <AdministratorStatusBadge label={RESERVATION_STATUS_LABELS[reservation.status]} tone="info" />
              </View>
              <Text style={styles.detailText}>{reservation.autolavadoName}</Text>
              <Text style={styles.detailText}>Fecha: {reservation.date} a las {reservation.time.slice(0, 5)}</Text>
              <Text style={styles.detailText}>
                Cliente: {reservation.customerFirstName} {reservation.customerLastName}
              </Text>
              <Text style={styles.detailText}>
                Vehículo: {reservation.vehicleBrand} {reservation.vehicleModel} · Placa {reservation.vehiclePlate}
              </Text>
              <Text style={styles.detailText}>Estado: {RESERVATION_STATUS_LABELS[reservation.status]}</Text>
              <Text style={styles.detailText}>Precio: {formatAdministratorCurrency(reservation.price)}</Text>
              <Text style={styles.detailText}>
                Pago: {reservation.paymentStatus
                  ? PAYMENT_STATUS_LABELS[reservation.paymentStatus]
                  : 'No registrado'}
              </Text>
            </View>
          ))
        )}
      </ReadOnlySection>
    </View>
  );
}

function MetricCard({
  label,
  value,
  accent,
  width,
}: {
  label: string;
  value: string;
  accent: string;
  width: DimensionValue;
}) {
  return (
    <View style={[styles.metricCard, { width }]}>
      <View style={styles.metricTop}>
        <View style={[styles.metricDot, { backgroundColor: accent }]} />
        <Text style={styles.metricKicker}>ACTUALIZADO</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ReadOnlySection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionKicker}>CONSULTA</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.sectionMeta}>
          <Text style={styles.sectionCount}>{count} registros</Text>
          <Text style={styles.readOnly}>Solo lectura</Text>
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  hero: { gap: spacing.md, padding: spacing.xl, borderRadius: 28, backgroundColor: colors.navy },
  heroTop: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md },
  brandGroup: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  brandMark: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primary },
  brandInitial: { color: colors.surface, fontSize: 24, fontWeight: '900' },
  brandCopy: { gap: 2 },
  brand: { color: colors.surface, fontSize: 14, fontWeight: '800', letterSpacing: 1.2 },
  heroEyebrow: { color: '#A9C9E5', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: colors.surface, fontSize: 31, fontWeight: '800', letterSpacing: -0.6 },
  heroSubtitle: { color: '#C4D7E8', fontSize: 15, lineHeight: 22, maxWidth: 680 },
  heroBottom: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  welcome: { color: colors.surface, flex: 1, fontSize: 15, fontWeight: '700' },
  sectionIntro: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  sectionKicker: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 3 },
  sectionTitle: { color: colors.navy, fontSize: 22, fontWeight: '800' },
  sectionNote: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'right' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  quickAction: { gap: spacing.sm, minHeight: 112, justifyContent: 'space-between', padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  quickActionPressed: { backgroundColor: colors.softBlue, borderColor: colors.primary },
  quickActionTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  quickActionMark: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.softBlue },
  quickActionDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  quickActionArrow: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  quickActionTitle: { color: colors.navy, fontSize: 16, fontWeight: '800' },
  quickActionDescription: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  sectionMenu: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surfaceSubtle },
  menuTitle: { color: colors.navy, fontSize: 18, fontWeight: '800' },
  menuOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sectionContent: { gap: spacing.xl },
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricCard: { minHeight: 128, justifyContent: 'space-between', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, elevation: 1, shadowColor: colors.navy, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  metricTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  metricDot: { width: 8, height: 8, borderRadius: 4 },
  metricKicker: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  metricLabel: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  metricValue: { color: colors.navy, fontSize: 25, fontWeight: '900' },
  section: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  sectionMeta: { alignItems: 'flex-end', gap: spacing.xs },
  sectionCount: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  readOnly: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  sectionBody: { gap: spacing.sm },
  card: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surfaceSubtle },
  cardHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { color: colors.navy, flex: 1, fontSize: 18, fontWeight: '800' },
  detailText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
});

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  AdministratorChoiceButton,
  AdministratorPageHeader,
  AdministratorSecondaryButton,
  getAdministratorErrorMessage,
} from './AdministratorUI';
import { PrimaryButton } from './PrimaryButton';
import { Screen } from './Screen';
import { TextField } from './TextField';
import { colors, spacing } from '../constants/theme';
import { administratorService as defaultAdministratorService } from '../services/administratorService';
import type { AdministratorEmployee, AdministratorService } from '../types/administrator';

type EmployeeFilter = 'todos' | 'activos' | 'inactivos';

interface AdministratorEmployeeManagementProps {
  service?: AdministratorService;
}

export default function AdministratorEmployeeManagement({
  service = defaultAdministratorService,
}: AdministratorEmployeeManagementProps) {
  const [employees, setEmployees] = useState<AdministratorEmployee[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EmployeeFilter>('todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEmployees(await service.listEmployees());
    } catch (loadError) {
      setError(`No se pudieron cargar los empleados: ${getAdministratorErrorMessage(loadError, 'La solicitud falló.')}`);
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleEmployees = employees.filter((employee) => {
    if (filter === 'activos' && !employee.active) {
      return false;
    }
    if (filter === 'inactivos' && employee.active) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const searchableText = [
      employee.firstName,
      employee.lastName,
      employee.email,
      employee.phone,
      ...employee.assignments.map((assignment) => assignment.autolavadoName),
    ].join(' ').toLowerCase();
    return searchableText.includes(normalizedQuery);
  });

  const selectedEmployee = employees.find((employee) => employee.id === selectedId) ?? null;

  return (
    <Screen wide>
      <View style={styles.content}>
        <AdministratorPageHeader
          title="Consulta de empleados"
          subtitle="Revisa el personal activo, sus datos de contacto y los autolavados asignados."
          onBack={() => router.back()}
        />

        <TextField
          label="Buscar empleados"
          placeholder="Nombre, correo, teléfono o autolavado"
          value={query}
          onChangeText={setQuery}
        />
        <View style={styles.filterBlock}>
          <Text style={styles.fieldLabel}>Filtrar por estado</Text>
          <View style={styles.filterRow}>
            <AdministratorChoiceButton label="Todos" selected={filter === 'todos'} onPress={() => setFilter('todos')} />
            <AdministratorChoiceButton label="Activos" selected={filter === 'activos'} onPress={() => setFilter('activos')} />
            <AdministratorChoiceButton label="Inactivos" selected={filter === 'inactivos'} onPress={() => setFilter('inactivos')} />
          </View>
        </View>

        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando empleados…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadData()} /> : null}
        {!loading && !error && visibleEmployees.length === 0 ? (
          <Text style={styles.message}>No hay empleados que coincidan con los filtros.</Text>
        ) : null}

        {!loading && !error ? visibleEmployees.map((employee) => (
          <EmployeeCard
            key={employee.id}
            item={employee}
            selected={selectedId === employee.id}
            onOpen={() => setSelectedId(employee.id)}
          />
        )) : null}

        {selectedEmployee ? (
          <EmployeeDetail item={selectedEmployee} onClose={() => setSelectedId(null)} />
        ) : null}
      </View>
    </Screen>
  );
}

function EmployeeCard({
  item,
  selected,
  onOpen,
}: {
  item: AdministratorEmployee;
  selected: boolean;
  onOpen(): void;
}) {
  return (
    <View style={[styles.card, selected && styles.selectedCard]}>
      <Text style={styles.cardTitle}>{item.firstName} {item.lastName}</Text>
      <Text style={styles.detailText}>{item.active ? 'Activo' : 'Inactivo'}</Text>
      <Text style={styles.detailText}>{item.email}</Text>
      <Text style={styles.detailText}>{item.phone}</Text>
      <Text style={styles.detailText}>
        {item.assignments.length === 0
          ? 'Sin asignación de autolavado'
          : `Asignaciones activas: ${item.assignments.filter((assignment) => assignment.active).length}`}
      </Text>
      <AdministratorSecondaryButton label="Revisar empleado" onPress={onOpen} />
    </View>
  );
}

function EmployeeDetail({ item, onClose }: { item: AdministratorEmployee; onClose(): void }) {
  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHeading}>
        <Text style={styles.sectionTitle}>Detalle de empleado</Text>
        <AdministratorSecondaryButton label="Cerrar" onPress={onClose} />
      </View>
      <Text style={styles.detailText}>Nombre: {item.firstName} {item.lastName}</Text>
      <Text style={styles.detailText}>Estado: {item.active ? 'Activo' : 'Inactivo'}</Text>
      <Text style={styles.detailText}>Correo: {item.email}</Text>
      <Text style={styles.detailText}>Teléfono: {item.phone}</Text>
      <Text style={styles.fieldLabel}>Autolavados asignados</Text>
      {item.assignments.length === 0 ? (
        <Text style={styles.message}>Sin asignaciones registradas.</Text>
      ) : item.assignments.map((assignment) => (
        <View key={assignment.id} style={styles.assignmentRow}>
          <Text style={styles.detailText}>{assignment.autolavadoName}</Text>
          <Text style={styles.detailText}>{assignment.active ? 'Activa' : 'Inactiva'}</Text>
        </View>
      ))}
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
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  card: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surfaceSubtle, elevation: 1, shadowColor: colors.navy, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  selectedCard: { borderWidth: 2, borderColor: colors.primary },
  cardTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  detailCard: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: '#B8D8EE', borderRadius: 22, backgroundColor: colors.softBlue },
  detailHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  sectionTitle: { color: colors.navy, fontSize: 21, fontWeight: '800' },
  detailText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  assignmentRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
});

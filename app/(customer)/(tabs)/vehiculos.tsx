import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { colors, radii, shadows, spacing } from '../../../constants/theme';
import { vehicleService } from '../../../services/vehicleService';
import type { VehiculoInput, VehicleRpcRow, VehicleType } from '../../../types/database';
import { VEHICLE_TYPES } from '../../../types/database';
import { getUserFacingErrorMessage } from '../../../utils/userFacingError';

type ScreenMode = 'list' | 'detail' | 'form';
type FormMode = 'create' | 'edit';
type VehicleDraft = Omit<VehiculoInput, 'anio'> & { anio: string };

const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  sedan: 'Sedán',
  hatchback: 'Hatchback',
  suv: 'SUV',
  pickup: 'Pick-up',
  van: 'Van',
  deportivo: 'Deportivo',
  otro: 'Otro',
};

function getVehicleTypeLabel(type: VehicleType): string {
  return VEHICLE_TYPE_LABELS[type];
}

const EMPTY_DRAFT: VehicleDraft = {
  marca: '',
  modelo: '',
  anio: '',
  color: '',
  placas: '',
  tipo: 'sedan',
};

function draftFromVehicle(vehicle: VehicleRpcRow): VehicleDraft {
  return {
    marca: vehicle.marca,
    modelo: vehicle.modelo,
    anio: String(vehicle.anio),
    color: vehicle.color,
    placas: vehicle.placas,
    tipo: vehicle.tipo,
  };
}

function vehicleInputFromDraft(draft: VehicleDraft): VehiculoInput {
  return {
    marca: draft.marca,
    modelo: draft.modelo,
    anio: Number(draft.anio),
    color: draft.color,
    placas: draft.placas,
    tipo: draft.tipo,
  };
}

export default function VehiclesRoute() {
  const [mode, setMode] = useState<ScreenMode>('list');
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [vehicles, setVehicles] = useState<VehicleRpcRow[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRpcRow | null>(null);
  const [draft, setDraft] = useState<VehicleDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const deletionInProgress = useRef(false);
  const loadRequestRef = useRef(0);
  const detailRequestRef = useRef(0);

  const loadVehicles = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const loadedVehicles = await vehicleService.listVehicles();
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setVehicles(loadedVehicles);
    } catch {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setError('No se pudieron cargar tus vehículos.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const openDetail = async (vehicle: VehicleRpcRow) => {
    const requestId = ++detailRequestRef.current;
    setMode('detail');
    setDetailLoading(true);
    setSelectedVehicle(null);
    setError(null);
    setSuccess(null);
    try {
      const detail = await vehicleService.getVehicle(vehicle.id);
      if (requestId !== detailRequestRef.current) {
        return;
      }
      setSelectedVehicle(detail);
      if (!detail) {
        setError('No se encontró este vehículo.');
      }
    } catch {
      if (requestId !== detailRequestRef.current) {
        return;
      }
      setError('No se pudieron cargar los detalles del vehículo.');
    } finally {
      if (requestId === detailRequestRef.current) {
        setDetailLoading(false);
      }
    }
  };

  const startCreate = () => {
    setDraft(EMPTY_DRAFT);
    setFormMode('create');
    setFormError(null);
    setError(null);
    setSuccess(null);
    setMode('form');
  };

  const startEdit = () => {
    if (!selectedVehicle) {
      return;
    }
    setDraft(draftFromVehicle(selectedVehicle));
    setFormMode('edit');
    setFormError(null);
    setError(null);
    setSuccess(null);
    setMode('form');
  };

  const saveVehicle = async () => {
    setFormError(null);
    setSuccess(null);
    if (!draft.marca.trim() || !draft.modelo.trim() || !draft.anio.trim() || !draft.color.trim() || !draft.placas.trim()) {
      setFormError('Completa todos los campos del vehículo.');
      return;
    }
    const input = vehicleInputFromDraft(draft);
    if (!Number.isInteger(input.anio) || input.anio < 1886) {
      setFormError('Introduce un año válido.');
      return;
    }

    setSaving(true);
    try {
      if (formMode === 'create') {
        await vehicleService.createVehicle(input);
        setSuccess('Vehículo guardado correctamente.');
        setMode('list');
        await loadVehicles();
      } else if (selectedVehicle) {
        const updated = await vehicleService.updateVehicle(selectedVehicle.id, input);
        setSelectedVehicle(updated);
        setSuccess('Vehículo actualizado correctamente.');
        setMode('detail');
        await loadVehicles();
      }
    } catch (saveError) {
      setFormError(getUserFacingErrorMessage(saveError, 'No se pudo guardar el vehículo.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteSelectedVehicle = async () => {
    if (!selectedVehicle || deletionInProgress.current) {
      return;
    }
    deletionInProgress.current = true;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const deleted = await vehicleService.deleteVehicle(selectedVehicle.id);
      if (!deleted) {
        setError('No se encontró este vehículo para eliminarlo.');
        return;
      }
      setVehicles((current) => current.filter((vehicle) => vehicle.id !== selectedVehicle.id));
      setSelectedVehicle(null);
      setMode('list');
      setSuccess('Vehículo eliminado correctamente.');
      await loadVehicles();
    } catch (deleteError) {
      setError(`No se pudo eliminar el vehículo: ${getUserFacingErrorMessage(deleteError, 'Ocurrió un error inesperado.')}`);
    } finally {
      deletionInProgress.current = false;
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (deletionInProgress.current) {
      return;
    }
    Alert.alert(
      'Eliminar vehículo',
      '¿Quieres retirar este vehículo de tu lista? Se conservará el historial de sus reservaciones.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void deleteSelectedVehicle() },
      ],
    );
  };

  const updateDraft = <K extends keyof VehicleDraft>(field: K, value: VehicleDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.kicker}>TU GARAJE DIGITAL</Text>
        <Text style={styles.title}>Mis vehículos</Text>
        <Text style={styles.subtitle}>Guarda los datos de tus autos para reservar sin repetir información.</Text>
        {success ? <Text style={styles.success}>{success}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {mode === 'list' ? (
          <>
            <PrimaryButton label="Agregar vehículo" onPress={startCreate} />
            {loading ? <Text style={styles.message}>Cargando tus vehículos…</Text> : null}
            {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadVehicles()} /> : null}
            {!loading && !error && vehicles.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Todavía no tienes vehículos registrados.</Text>
                <Text style={styles.message}>Añade uno para tener tu próxima reservación lista en menos pasos.</Text>
              </View>
            ) : null}
            {!loading
              ? vehicles.map((vehicle) => (
                  <View key={vehicle.id} style={styles.card}>
                    <Text style={styles.vehicleTitle}>{vehicle.marca} {vehicle.modelo}</Text>
                    <Text style={styles.detailText}>Año: {vehicle.anio}</Text>
                    <Text style={styles.detailText}>Color: {vehicle.color}</Text>
                    <Text style={styles.detailText}>Placas: {vehicle.placas}</Text>
                    <Text style={styles.detailText}>Tipo: {getVehicleTypeLabel(vehicle.tipo)}</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void openDetail(vehicle)}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Ver detalles de {vehicle.marca} {vehicle.modelo}</Text>
                    </Pressable>
                  </View>
                ))
              : null}
          </>
        ) : null}

        {mode === 'detail' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Detalles del vehículo</Text>
            {detailLoading ? <Text style={styles.message}>Cargando detalles…</Text> : null}
            {selectedVehicle ? (
              <>
                <Text style={styles.vehicleTitle}>{selectedVehicle.marca} {selectedVehicle.modelo}</Text>
                <Text style={styles.detailText}>Año: {selectedVehicle.anio}</Text>
                <Text style={styles.detailText}>Color: {selectedVehicle.color}</Text>
                <Text style={styles.detailText}>Placas: {selectedVehicle.placas}</Text>
                <Text style={styles.detailText}>Tipo: {getVehicleTypeLabel(selectedVehicle.tipo)}</Text>
                <PrimaryButton label="Editar vehículo" onPress={startEdit} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: deleting }}
                  disabled={deleting}
                  onPress={confirmDelete}
                  style={styles.destructiveButton}
                >
                  <Text style={styles.destructiveButtonText}>
                    {deleting ? 'Eliminando vehículo…' : 'Eliminar vehículo'}
                  </Text>
                </Pressable>
              </>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setMode('list')} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Volver a la lista</Text>
            </Pressable>
          </View>
        ) : null}

        {mode === 'form' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{formMode === 'create' ? 'Agregar vehículo' : 'Editar vehículo'}</Text>
            <TextField label="Marca" value={draft.marca} onChangeText={(value) => updateDraft('marca', value)} />
            <TextField label="Modelo" value={draft.modelo} onChangeText={(value) => updateDraft('modelo', value)} />
            <TextField
              keyboardType="number-pad"
              label="Año"
              value={draft.anio}
              onChangeText={(value) => updateDraft('anio', value)}
            />
            <TextField label="Color" value={draft.color} onChangeText={(value) => updateDraft('color', value)} />
            <TextField label="Placas" value={draft.placas} onChangeText={(value) => updateDraft('placas', value)} />
            <Text style={styles.typeLabel}>Tipo</Text>
            <View style={styles.typeOptions}>
              {VEHICLE_TYPES.map((type) => (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityState={{ selected: draft.tipo === type }}
                  onPress={() => updateDraft('tipo', type)}
                  style={[styles.typeOption, draft.tipo === type && styles.typeOptionSelected]}
                >
                  <Text style={[styles.typeOptionText, draft.tipo === type && styles.typeOptionTextSelected]}>{getVehicleTypeLabel(type)}</Text>
                </Pressable>
              ))}
            </View>
            {formError ? <Text accessibilityRole="alert" style={styles.error}>{formError}</Text> : null}
            <PrimaryButton
              label={formMode === 'create' ? 'Guardar vehículo' : 'Guardar cambios'}
              loading={saving}
              onPress={() => void saveVehicle()}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode(formMode === 'edit' ? 'detail' : 'list')}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: -spacing.xs },
  title: { color: colors.navy, fontSize: 29, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '700' },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  success: { color: colors.primaryDark, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  emptyCard: { gap: spacing.xs, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface, ...shadows.card, shadowOpacity: 0.05 },
  emptyTitle: { color: colors.navy, fontSize: 17, fontWeight: '800' },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
    shadowOpacity: 0.05,
  },
  vehicleTitle: { color: colors.navy, fontSize: 19, fontWeight: '800' },
  detailText: { color: colors.muted, fontSize: 15 },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.primary, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  destructiveButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
  },
  destructiveButtonText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  typeLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  typeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  typeOption: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.background },
  typeOptionSelected: { backgroundColor: colors.primary },
  typeOptionText: { color: colors.text, fontSize: 14 },
  typeOptionTextSelected: { color: colors.surface, fontWeight: '700' },
});

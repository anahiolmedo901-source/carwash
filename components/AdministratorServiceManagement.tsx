import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  AdministratorChoiceButton,
  AdministratorDestructiveButton,
  AdministratorPageHeader,
  AdministratorSecondaryButton,
  getAdministratorErrorMessage,
} from './AdministratorUI';
import { PrimaryButton } from './PrimaryButton';
import { Screen } from './Screen';
import { TextField } from './TextField';
import { colors, spacing } from '../constants/theme';
import { administratorService as defaultAdministratorService } from '../services/administratorService';
import type {
  AdministratorAutolavado,
  AdministratorManagedService,
  AdministratorService,
  AdministratorServiceInput,
} from '../types/administrator';

const MAX_SERVICE_PRICE = 9999999999.99;

interface ServiceDraft {
  autolavadoId: string;
  name: string;
  description: string;
  price: string;
  durationMinutes: string;
  active: boolean;
}

const EMPTY_DRAFT: ServiceDraft = {
  autolavadoId: '',
  name: '',
  description: '',
  price: '',
  durationMinutes: '',
  active: true,
};

interface AdministratorServiceManagementProps {
  service?: AdministratorService;
}

export default function AdministratorServiceManagement({
  service = defaultAdministratorService,
}: AdministratorServiceManagementProps) {
  const [services, setServices] = useState<AdministratorManagedService[]>([]);
  const [autolavados, setAutolavados] = useState<AdministratorAutolavado[]>([]);
  const [draft, setDraft] = useState<ServiceDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const savingInProgress = useRef(false);
  const deletingInProgress = useRef<string | null>(null);

  const loadData = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const [nextServices, nextAutolavados] = await Promise.all([
        service.listServices(),
        service.listAutolavados(),
      ]);
      setServices(nextServices);
      setAutolavados(nextAutolavados);
      return true;
    } catch (loadError) {
      setError(`No se pudieron cargar los servicios: ${getAdministratorErrorMessage(loadError, 'La solicitud falló.')}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const startCreate = () => {
    setDraft({ ...EMPTY_DRAFT, autolavadoId: autolavados[0]?.id ?? '' });
    setEditingId(null);
    setFormError(null);
    setError(null);
    setSuccess(null);
    setShowForm(true);
  };

  const startEdit = (serviceItem: AdministratorManagedService) => {
    setDraft({
      autolavadoId: serviceItem.autolavadoId,
      name: serviceItem.name,
      description: serviceItem.description,
      price: String(serviceItem.price),
      durationMinutes: String(serviceItem.durationMinutes),
      active: serviceItem.active,
    });
    setEditingId(serviceItem.id);
    setFormError(null);
    setError(null);
    setSuccess(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormError(null);
  };

  const saveService = async () => {
    if (savingInProgress.current) {
      return;
    }

    setFormError(null);
    setSuccess(null);
    const validationError = validateServiceDraft(draft);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    const input = serviceInputFromDraft(draft);

    savingInProgress.current = true;
    setSaving(true);
    const currentEditingId = editingId;
    try {
      if (currentEditingId) {
        await service.updateService(currentEditingId, input);
      } else {
        await service.createService(input);
      }
      closeForm();
      const refreshed = await loadData();
      setSuccess(refreshed
        ? currentEditingId ? 'Servicio actualizado correctamente.' : 'Servicio creado correctamente.'
        : 'El servicio se guardó, pero no se pudo actualizar la lista.');
    } catch (saveError) {
      setFormError(`No se pudo guardar el servicio: ${getAdministratorErrorMessage(saveError, 'La solicitud falló.')}`);
    } finally {
      savingInProgress.current = false;
      setSaving(false);
    }
  };

  const deleteService = async (serviceItem: AdministratorManagedService) => {
    if (deletingInProgress.current) {
      return;
    }

    deletingInProgress.current = serviceItem.id;
    setDeletingId(serviceItem.id);
    setError(null);
    setSuccess(null);
    try {
      const deleted = await service.deleteService(serviceItem.id);
      if (!deleted) {
        setError(`El servicio "${serviceItem.name}" no se eliminó.`);
        return;
      }
      const refreshed = await loadData();
      setSuccess(refreshed
        ? 'Servicio eliminado correctamente.'
        : 'El servicio se eliminó, pero no se pudo actualizar la lista.');
    } catch (deleteError) {
      setError(
        `No se pudo eliminar el servicio "${serviceItem.name}": ${getAdministratorErrorMessage(deleteError, 'La solicitud falló.')}`,
      );
    } finally {
      deletingInProgress.current = null;
      setDeletingId(null);
    }
  };

  const confirmDelete = (serviceItem: AdministratorManagedService) => {
    if (deletingInProgress.current) {
      return;
    }
    Alert.alert(
      'Eliminar servicio',
      `¿Eliminar ${serviceItem.name}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void deleteService(serviceItem) },
      ],
    );
  };

  const updateDraft = <K extends keyof ServiceDraft>(field: K, value: ServiceDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <Screen wide>
      <View style={styles.content}>
        <AdministratorPageHeader
          title="Administrar servicios"
          subtitle="Crea, consulta, actualiza y elimina servicios para los autolavados disponibles."
          onBack={() => router.back()}
        />
        {success ? <Text style={styles.success}>{success}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando servicios…</Text>
          </View>
        ) : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadData()} /> : null}
        {!loading && !error && autolavados.length === 0 ? (
          <Text style={styles.message}>No hay autolavados disponibles. Para crear un servicio necesitas un autolavado.</Text>
        ) : null}

        {!loading && !error ? (
          <PrimaryButton label={showForm ? 'Ocultar formulario de servicio' : 'Agregar servicio'} onPress={showForm ? closeForm : startCreate} />
        ) : null}

        {showForm ? (
          <ServiceForm
            autolavados={autolavados}
            draft={draft}
            editing={Boolean(editingId)}
            error={formError}
            saving={saving}
            onCancel={closeForm}
            onChange={updateDraft}
            onSave={() => void saveService()}
          />
        ) : null}

        {!loading && !error && services.length === 0 ? (
          <Text style={styles.message}>No hay servicios disponibles.</Text>
        ) : null}
        {!loading && !error
          ? services.map((serviceItem) => (
              <ServiceCard
                key={serviceItem.id}
                autolavados={autolavados}
                deleting={deletingId === serviceItem.id}
                item={serviceItem}
                onDelete={() => confirmDelete(serviceItem)}
                onEdit={() => startEdit(serviceItem)}
              />
            ))
          : null}
      </View>
    </Screen>
  );
}

function serviceInputFromDraft(draft: ServiceDraft): AdministratorServiceInput {
  return {
    autolavadoId: draft.autolavadoId.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    price: Number(draft.price),
    durationMinutes: Number(draft.durationMinutes),
    active: draft.active,
  };
}

function validateServiceDraft(draft: ServiceDraft): string | null {
  if (!draft.autolavadoId.trim()) {
    return 'Selecciona un autolavado.';
  }
  if (!draft.name.trim()) {
    return 'Ingresa el nombre del servicio.';
  }
  if (!draft.description.trim()) {
    return 'Ingresa la descripción del servicio.';
  }
  if (!draft.price.trim()) {
    return 'Ingresa el precio del servicio.';
  }
  if (!draft.durationMinutes.trim()) {
    return 'Ingresa una duración positiva para el servicio.';
  }
  return validateServiceInput(serviceInputFromDraft(draft));
}

function validateServiceInput(input: AdministratorServiceInput): string | null {
  if (!input.autolavadoId) {
    return 'Selecciona un autolavado.';
  }
  if (!input.name) {
    return 'Ingresa el nombre del servicio.';
  }
  if (!input.description) {
    return 'Ingresa la descripción del servicio.';
  }
  if (!Number.isFinite(input.price) || input.price < 0 || input.price > MAX_SERVICE_PRICE) {
    return 'Ingresa un precio de servicio no negativo.';
  }
  if (Math.abs(input.price * 100 - Math.round(input.price * 100)) > 1e-8) {
    return 'El precio del servicio puede tener como máximo dos decimales.';
  }
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0 || !Number.isInteger(input.durationMinutes)) {
    return 'Ingresa una duración entera positiva para el servicio.';
  }
  if (typeof input.active !== 'boolean') {
    return 'Selecciona la disponibilidad del servicio.';
  }
  return null;
}

function ServiceForm({
  autolavados,
  draft,
  editing,
  error,
  saving,
  onCancel,
  onChange,
  onSave,
}: {
  autolavados: AdministratorAutolavado[];
  draft: ServiceDraft;
  editing: boolean;
  error: string | null;
  saving: boolean;
  onCancel(): void;
  onChange<K extends keyof ServiceDraft>(field: K, value: ServiceDraft[K]): void;
  onSave(): void;
}) {
  return (
    <View style={styles.formCard}>
      <Text style={styles.sectionTitle}>{editing ? 'Editar servicio' : 'Agregar servicio'}</Text>
      <Text style={styles.fieldLabel}>Autolavado</Text>
      <View style={styles.options}>
        {autolavados.map((autolavado) => (
          <AdministratorChoiceButton
            key={autolavado.id}
            label={autolavado.name}
            selected={draft.autolavadoId === autolavado.id}
            onPress={() => onChange('autolavadoId', autolavado.id)}
          />
        ))}
      </View>
      <TextField label="Nombre del servicio" value={draft.name} onChangeText={(value) => onChange('name', value)} />
      <TextField label="Descripción" value={draft.description} onChangeText={(value) => onChange('description', value)} />
      <TextField
        keyboardType="number-pad"
        label="Precio"
        value={draft.price}
        onChangeText={(value) => onChange('price', value)}
      />
      <TextField
        keyboardType="number-pad"
        label="Duración en minutos"
        value={draft.durationMinutes}
        onChangeText={(value) => onChange('durationMinutes', value)}
      />
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.fieldLabel}>Servicio disponible</Text>
          <Text style={styles.switchHint}>
            {draft.active ? 'Los clientes pueden reservarlo.' : 'No aparecerá en el catálogo de clientes.'}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Servicio disponible"
          onValueChange={(value) => onChange('active', value)}
          trackColor={{ false: colors.border, true: colors.softBlue }}
          thumbColor={draft.active ? colors.primary : colors.muted}
          value={draft.active}
        />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <PrimaryButton label={editing ? 'Guardar cambios' : 'Guardar servicio'} loading={saving} onPress={onSave} />
      <AdministratorSecondaryButton label="Cancelar" onPress={onCancel} disabled={saving} />
    </View>
  );
}

function ServiceCard({
  autolavados,
  deleting,
  item,
  onDelete,
  onEdit,
}: {
  autolavados: AdministratorAutolavado[];
  deleting: boolean;
  item: AdministratorManagedService;
  onDelete(): void;
  onEdit(): void;
}) {
  const autolavado = autolavados.find((candidate) => candidate.id === item.autolavadoId);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.detailText}>{autolavado?.name ?? 'Autolavado no encontrado'}</Text>
      <Text style={styles.detailText}>{item.description}</Text>
      <Text style={styles.detailText}>Precio: ${item.price.toFixed(2)}</Text>
      <Text style={styles.detailText}>Duración: {item.durationMinutes} minutos</Text>
      <Text style={styles.detailText}>Disponibilidad: {item.active ? 'Disponible' : 'No disponible'}</Text>
      <View style={styles.cardActions}>
        <AdministratorSecondaryButton label={`Editar ${item.name}`} onPress={onEdit} disabled={deleting} />
        <AdministratorDestructiveButton
          label={deleting ? 'Eliminando…' : `Eliminar ${item.name}`}
          onPress={onDelete}
          disabled={deleting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  title: { color: colors.text, fontSize: 27, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  sectionTitle: { color: colors.navy, fontSize: 22, fontWeight: '800' },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  success: { color: colors.primaryDark, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  switchCopy: { flex: 1, gap: spacing.xs },
  switchHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  formCard: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  card: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surfaceSubtle, elevation: 1, shadowColor: colors.navy, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  cardTitle: { color: colors.navy, fontSize: 19, fontWeight: '800' },
  detailText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  cardActions: { gap: spacing.sm },
});

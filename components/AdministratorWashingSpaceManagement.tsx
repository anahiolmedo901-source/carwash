import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
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
  AdministratorService,
  AdministratorWashingSpace,
} from '../types/administrator';
import { SPACE_STATUSES, type SpaceStatus } from '../types/realtime';

const SPACE_STATUS_LABELS: Record<SpaceStatus, string> = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  ocupado: 'Ocupado',
  mantenimiento: 'En mantenimiento',
};

interface SpaceDraft {
  autolavadoId: string;
  name: string;
  status: SpaceStatus;
  active: boolean;
}

const EMPTY_DRAFT: SpaceDraft = {
  autolavadoId: '',
  name: '',
  status: 'disponible',
  active: true,
};

interface AdministratorWashingSpaceManagementProps {
  service?: AdministratorService;
}

export default function AdministratorWashingSpaceManagement({
  service = defaultAdministratorService,
}: AdministratorWashingSpaceManagementProps) {
  const [spaces, setSpaces] = useState<AdministratorWashingSpace[]>([]);
  const [autolavados, setAutolavados] = useState<AdministratorAutolavado[]>([]);
  const [draft, setDraft] = useState<SpaceDraft>(EMPTY_DRAFT);
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
      const [nextSpaces, nextAutolavados] = await Promise.all([
        service.listWashingSpaces(),
        service.listAutolavados(),
      ]);
      setSpaces(nextSpaces);
      setAutolavados(nextAutolavados);
      return true;
    } catch (loadError) {
      setError(`No se pudieron cargar los espacios de lavado: ${getAdministratorErrorMessage(loadError, 'La solicitud falló.')}`);
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

  const startEdit = (space: AdministratorWashingSpace) => {
    setDraft({
      autolavadoId: space.autolavadoId,
      name: space.name,
      status: space.status,
      active: space.active,
    });
    setEditingId(space.id);
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

  const saveSpace = async () => {
    if (savingInProgress.current) {
      return;
    }

    setFormError(null);
    setSuccess(null);
    const validationError = validateSpaceInput(draft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    savingInProgress.current = true;
    setSaving(true);
    const currentEditingId = editingId;
    try {
      if (currentEditingId) {
        await service.updateWashingSpace(currentEditingId, draft);
      } else {
        await service.createWashingSpace(draft);
      }
      closeForm();
      const refreshed = await loadData();
      setSuccess(refreshed
        ? currentEditingId ? 'Espacio de lavado actualizado correctamente.' : 'Espacio de lavado creado correctamente.'
        : 'El espacio de lavado se guardó, pero no se pudo actualizar la lista.');
    } catch (saveError) {
      setFormError(`No se pudo guardar el espacio de lavado: ${getAdministratorErrorMessage(saveError, 'La solicitud falló.')}`);
    } finally {
      savingInProgress.current = false;
      setSaving(false);
    }
  };

  const deleteSpace = async (space: AdministratorWashingSpace) => {
    if (deletingInProgress.current) {
      return;
    }

    deletingInProgress.current = space.id;
    setDeletingId(space.id);
    setError(null);
    setSuccess(null);
    try {
      const deleted = await service.deleteWashingSpace(space.id);
      if (!deleted) {
        setError('El espacio de lavado no se eliminó.');
        return;
      }
      const refreshed = await loadData();
      setSuccess(refreshed
        ? 'Espacio de lavado eliminado correctamente.'
        : 'El espacio de lavado se eliminó, pero no se pudo actualizar la lista.');
    } catch (deleteError) {
      setError(
        `No se pudo eliminar el espacio de lavado: ${getAdministratorErrorMessage(deleteError, 'La solicitud falló.')}`,
      );
    } finally {
      deletingInProgress.current = null;
      setDeletingId(null);
    }
  };

  const confirmDelete = (space: AdministratorWashingSpace) => {
    if (deletingInProgress.current) {
      return;
    }
    Alert.alert(
      'Eliminar espacio de lavado',
      'Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void deleteSpace(space) },
      ],
    );
  };

  const updateDraft = <K extends keyof SpaceDraft>(field: K, value: SpaceDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const selectAutolavado = (autolavadoId: string) => {
    setDraft((current) => ({ ...current, autolavadoId }));
  };

  return (
    <Screen wide>
      <View style={styles.content}>
        <AdministratorPageHeader
          title="Administrar espacios de lavado"
          subtitle="Crea, consulta, actualiza y elimina espacios de lavado sin modificar el historial de reservaciones."
          onBack={() => router.back()}
        />
        {success ? <Text style={styles.success}>{success}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando espacios de lavado…</Text>
          </View>
        ) : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadData()} /> : null}
        {!loading && !error && autolavados.length === 0 ? (
          <Text style={styles.message}>No hay autolavados disponibles. Para crear un espacio de lavado necesitas un autolavado.</Text>
        ) : null}

        {!loading && !error ? (
          <PrimaryButton label={showForm ? 'Ocultar formulario de espacio de lavado' : 'Agregar espacio de lavado'} onPress={showForm ? closeForm : startCreate} />
        ) : null}

        {showForm ? (
          <WashingSpaceForm
            autolavados={autolavados}
            draft={draft}
            editing={Boolean(editingId)}
            error={formError}
            saving={saving}
            onCancel={closeForm}
            onChange={updateDraft}
            onSelectAutolavado={selectAutolavado}
            onSave={() => void saveSpace()}
          />
        ) : null}

        {!loading && !error && spaces.length === 0 ? (
          <Text style={styles.message}>No hay espacios de lavado disponibles.</Text>
        ) : null}
        {!loading && !error
          ? spaces.map((space, index) => (
              <WashingSpaceCard
                key={space.id}
                autolavados={autolavados}
                deleting={deletingId === space.id}
                index={index + 1}
                item={space}
                onDelete={() => confirmDelete(space)}
                onEdit={() => startEdit(space)}
              />
            ))
          : null}
      </View>
    </Screen>
  );
}

function validateSpaceInput(draft: SpaceDraft): string | null {
  if (!draft.autolavadoId) {
    return 'Selecciona un autolavado.';
  }
  if (!draft.name.trim()) {
    return 'Ingresa el nombre del espacio de lavado.';
  }
  if (!SPACE_STATUSES.includes(draft.status)) {
    return 'Selecciona un estado válido para el espacio de lavado.';
  }
  if (typeof draft.active !== 'boolean') {
    return 'Selecciona si el espacio de lavado está activo.';
  }
  return null;
}

function WashingSpaceForm({
  autolavados,
  draft,
  editing,
  error,
  saving,
  onCancel,
  onChange,
  onSelectAutolavado,
  onSave,
}: {
  autolavados: AdministratorAutolavado[];
  draft: SpaceDraft;
  editing: boolean;
  error: string | null;
  saving: boolean;
  onCancel(): void;
  onChange<K extends keyof SpaceDraft>(field: K, value: SpaceDraft[K]): void;
  onSelectAutolavado(autolavadoId: string): void;
  onSave(): void;
}) {
  return (
    <View style={styles.formCard}>
      <Text style={styles.sectionTitle}>{editing ? 'Editar espacio de lavado' : 'Agregar espacio de lavado'}</Text>
      <Text style={styles.fieldLabel}>Autolavado</Text>
      <View style={styles.options}>
        {autolavados.map((autolavado) => (
          <AdministratorChoiceButton
            key={autolavado.id}
            label={autolavado.name}
            selected={draft.autolavadoId === autolavado.id}
            onPress={() => onSelectAutolavado(autolavado.id)}
          />
        ))}
      </View>
      <TextField
        label="Nombre del espacio de lavado"
        value={draft.name}
        onChangeText={(value) => onChange('name', value)}
      />
      <Text style={styles.fieldLabel}>Activo</Text>
      <View style={styles.options}>
        <AdministratorChoiceButton
          label="Activo"
          selected={draft.active}
          onPress={() => onChange('active', true)}
        />
        <AdministratorChoiceButton
          label="Inactivo"
          selected={!draft.active}
          onPress={() => onChange('active', false)}
        />
      </View>
      <Text style={styles.fieldLabel}>Estado</Text>
      <View style={styles.options}>
        {SPACE_STATUSES.map((status) => (
          <AdministratorChoiceButton
            key={status}
            label={SPACE_STATUS_LABELS[status]}
            selected={draft.status === status}
            onPress={() => onChange('status', status)}
          />
        ))}
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <PrimaryButton label={editing ? 'Guardar cambios' : 'Guardar espacio de lavado'} loading={saving} onPress={onSave} />
      <AdministratorSecondaryButton label="Cancelar" onPress={onCancel} disabled={saving} />
    </View>
  );
}

function WashingSpaceCard({
  autolavados,
  deleting,
  index,
  item,
  onDelete,
  onEdit,
}: {
  autolavados: AdministratorAutolavado[];
  deleting: boolean;
  index: number;
  item: AdministratorWashingSpace;
  onDelete(): void;
  onEdit(): void;
}) {
  const autolavado = autolavados.find((candidate) => candidate.id === item.autolavadoId);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Espacio de lavado {index}: {item.name}</Text>
      <Text style={styles.detailText}>{autolavado?.name ?? 'Autolavado no encontrado'}</Text>
      <Text style={styles.detailText}>Estado: {SPACE_STATUS_LABELS[item.status]}</Text>
      <Text style={styles.detailText}>Activo: {item.active ? 'Sí' : 'No'}</Text>
      <View style={styles.cardActions}>
        <AdministratorSecondaryButton label={`Editar espacio de lavado ${index}`} onPress={onEdit} disabled={deleting} />
        <AdministratorDestructiveButton
          label={deleting ? 'Eliminando…' : `Eliminar espacio de lavado ${index}`}
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
  formCard: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  card: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surfaceSubtle, elevation: 1, shadowColor: colors.navy, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  cardTitle: { color: colors.navy, fontSize: 19, fontWeight: '800' },
  detailText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  cardActions: { gap: spacing.sm },
});

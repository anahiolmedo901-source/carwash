import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  AdministratorPageHeader,
  AdministratorSecondaryButton,
  getAdministratorErrorMessage,
} from './AdministratorUI';
import { PrimaryButton } from './PrimaryButton';
import { Screen } from './Screen';
import { TextField } from './TextField';
import { colors, spacing } from '../constants/theme';
import { administratorService as defaultAdministratorService } from '../services/administratorService';
import type { AdministratorRating, AdministratorService } from '../types/administrator';

interface AdministratorRatingManagementProps {
  service?: AdministratorService;
}

export default function AdministratorRatingManagement({
  service = defaultAdministratorService,
}: AdministratorRatingManagementProps) {
  const [ratings, setRatings] = useState<AdministratorRating[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRatings(await service.listRatings());
    } catch (loadError) {
      setError(`No se pudieron cargar las calificaciones: ${getAdministratorErrorMessage(loadError, 'La solicitud falló.')}`);
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRatings = ratings.filter((rating) => {
    if (!normalizedQuery) {
      return true;
    }
    return [
      rating.autolavadoName,
      rating.serviceName,
      rating.customerFirstName,
      rating.customerLastName,
      rating.comment ?? '',
      String(rating.rating),
    ].join(' ').toLowerCase().includes(normalizedQuery);
  });
  const selectedRating = ratings.find((rating) => rating.id === selectedId) ?? null;
  const averageRating = ratings.length === 0
    ? 0
    : ratings.reduce((total, rating) => total + rating.rating, 0) / ratings.length;

  return (
    <Screen wide>
      <View style={styles.content}>
        <AdministratorPageHeader
          title="Calificaciones y feedback"
          subtitle="Consulta la percepción de los clientes por servicio y autolavado."
          onBack={() => router.back()}
        />

        <View style={styles.summaryGrid}>
          <SummaryCard label="Promedio" value={`${averageRating.toFixed(2)} / 5`} />
          <SummaryCard label="Opiniones" value={String(ratings.length)} />
        </View>

        <TextField
          label="Buscar feedback"
          placeholder="Cliente, autolavado, servicio o comentario"
          value={query}
          onChangeText={setQuery}
        />

        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando calificaciones…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadData()} /> : null}
        {!loading && !error && visibleRatings.length === 0 ? (
          <Text style={styles.message}>No hay calificaciones que coincidan con la búsqueda.</Text>
        ) : null}

        {!loading && !error ? visibleRatings.map((rating) => (
          <RatingCard
            key={rating.id}
            item={rating}
            selected={selectedId === rating.id}
            onOpen={() => setSelectedId(rating.id)}
          />
        )) : null}

        {selectedRating ? (
          <RatingDetail item={selectedRating} onClose={() => setSelectedId(null)} />
        ) : null}
      </View>
    </Screen>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function RatingCard({
  item,
  selected,
  onOpen,
}: {
  item: AdministratorRating;
  selected: boolean;
  onOpen(): void;
}) {
  return (
    <View style={[styles.card, selected && styles.selectedCard]}>
      <Text style={styles.cardTitle}>{item.rating} / 5</Text>
      <Text style={styles.detailText}>{item.autolavadoName} · {item.serviceName}</Text>
      <Text style={styles.detailText}>Cliente: {item.customerFirstName} {item.customerLastName}</Text>
      <Text style={styles.detailText}>{item.comment ?? 'Sin comentario escrito.'}</Text>
      <AdministratorSecondaryButton label="Revisar feedback" onPress={onOpen} />
    </View>
  );
}

function RatingDetail({ item, onClose }: { item: AdministratorRating; onClose(): void }) {
  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHeading}>
        <Text style={styles.sectionTitle}>Detalle de feedback</Text>
        <AdministratorSecondaryButton label="Cerrar" onPress={onClose} />
      </View>
      <Text style={styles.detailText}>Calificación: {item.rating} / 5</Text>
      <Text style={styles.detailText}>Cliente: {item.customerFirstName} {item.customerLastName}</Text>
      <Text style={styles.detailText}>Autolavado: {item.autolavadoName}</Text>
      <Text style={styles.detailText}>Servicio: {item.serviceName}</Text>
      <Text style={styles.detailText}>Reservación: {item.reservationDate} {item.reservationTime.slice(0, 5)}</Text>
      <Text style={styles.detailText}>Comentario: {item.comment ?? 'Sin comentario escrito.'}</Text>
      <Text style={styles.detailText}>Registrada: {item.createdAt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  title: { color: colors.text, fontSize: 27, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  summaryGrid: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: { flex: 1, minHeight: 112, justifyContent: 'space-between', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: '#B8D8EE', borderRadius: 20, backgroundColor: colors.softBlue },
  summaryLabel: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  summaryValue: { color: colors.navy, fontSize: 25, fontWeight: '900' },
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
});

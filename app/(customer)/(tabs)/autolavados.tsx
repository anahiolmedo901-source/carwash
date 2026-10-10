import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { Screen } from '../../../components/Screen';
import { colors, radii, shadows, spacing } from '../../../constants/theme';
import { resolveAutolavadoImage } from '../../../utils/autolavadoImage';
import { autolavadoService } from '../../../services/autolavadoService';
import type { AutolavadoListItem, AutolavadoService } from '../../../types/autolavado';
import { router } from 'expo-router';

interface CarWashesRouteProps {
  service?: AutolavadoService;
}

export default function CarWashesRoute({ service = autolavadoService }: CarWashesRouteProps) {
  const { width } = useWindowDimensions();
  const [autolavados, setAutolavados] = useState<AutolavadoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const cardWidth: DimensionValue = width >= 760 ? '48.5%' : '100%';

  const loadAutolavados = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const loadedAutolavados = await service.listAutolavados();
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setAutolavados(loadedAutolavados);
    } catch {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setError('No se pudieron cargar los autolavados.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [service]);

  useEffect(() => {
    void loadAutolavados();
  }, [loadAutolavados]);

  return (
    <Screen wide>
      <View style={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>ENCUENTRA TU LUGAR</Text>
            <Text style={styles.title}>Autolavados</Text>
            <Text style={styles.subtitle}>Elige dónde cuidar tu auto y reserva en pocos pasos.</Text>
          </View>
          {!loading && !error ? <View style={styles.countPill}><Text style={styles.count}>{autolavados.length}</Text><Text style={styles.countLabel}>lugares</Text></View> : null}
        </View>
        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando autolavados…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadAutolavados()} /> : null}
        {!loading && !error && autolavados.length === 0 ? (
          <Text style={styles.message}>No hay autolavados disponibles.</Text>
        ) : null}
        {!loading && !error ? (
          <View style={styles.grid}>
            {autolavados.map((autolavado) => (
              <Pressable
                key={autolavado.id}
                accessibilityRole="button"
                accessibilityLabel={`Ver detalles de ${autolavado.name}`}
                onPress={() => router.push({ pathname: '/autolavado/[id]', params: { id: autolavado.id } })}
                style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.cardPressed]}
              >
                <View style={styles.imageFrame}>
                  <Image
                    accessibilityLabel={`Imagen de ${autolavado.name}`}
                    source={resolveAutolavadoImage(autolavado.imageUrl, autolavado.id)}
                    style={styles.image}
                  />
                  <View style={styles.ratingPill}><Text style={styles.star}>★</Text><Text style={styles.rating}>{autolavado.rating.toFixed(1)}</Text></View>
                </View>
                <View style={styles.cardContent}>
                   <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>{autolavado.name}</Text><Ionicons name="chevron-forward" size={20} color={colors.primary} /></View>
                  <Text style={styles.detailText}>{autolavado.address}</Text>
                  <Text style={styles.detailText}>Horario: {autolavado.hours}</Text>
                  <Text style={styles.detailText}>Calificación: {autolavado.rating.toFixed(1)}</Text>
                  <Text style={styles.reviewText}>{autolavado.reviewCount} reseñas</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  header: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 3 },
  title: { color: colors.navy, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 21, marginTop: spacing.xs, maxWidth: 560 },
  countPill: { alignItems: 'center', minWidth: 70, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.md, backgroundColor: colors.softBlue },
  count: { color: colors.primaryDark, fontSize: 20, fontWeight: '900' },
  countLabel: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' },
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { overflow: 'hidden', borderRadius: radii.lg, backgroundColor: colors.surface, ...shadows.card, shadowOpacity: 0.06 },
  cardPressed: { borderWidth: 1, borderColor: colors.primary, opacity: 0.92 },
  imageFrame: { position: 'relative' },
  image: { width: '100%', height: 190, backgroundColor: colors.softBlue },
  ratingPill: { alignItems: 'center', flexDirection: 'row', gap: 4, position: 'absolute', right: spacing.sm, bottom: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surface },
  star: { color: colors.accent, fontSize: 13 },
  rating: { color: colors.navy, fontSize: 12, fontWeight: '800' },
  cardContent: { gap: spacing.xs, padding: spacing.lg },
  cardTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  cardTitle: { color: colors.navy, flex: 1, fontSize: 19, fontWeight: '800' },
  cardArrow: { color: colors.primary, fontSize: 22, fontWeight: '500' },
  detailText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  reviewText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700', marginTop: spacing.xs },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '../../../components/BackButton';
import { resolveAutolavadoImage } from '../../../utils/autolavadoImage';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { Screen } from '../../../components/Screen';
import { colors, radii, shadows, spacing } from '../../../constants/theme';
import { autolavadoService } from '../../../services/autolavadoService';
import type { AutolavadoDetail, AutolavadoService, Servicio } from '../../../types/autolavado';

interface AutolavadoDetailRouteProps {
  service?: AutolavadoService;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export default function AutolavadoDetailRoute({ service = autolavadoService }: AutolavadoDetailRouteProps) {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(rawId);
  const [detail, setDetail] = useState<AutolavadoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadDetail = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    if (!id) {
      setError('No se especificó el autolavado solicitado.');
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
      return;
    }

    try {
      const loadedDetail = await service.getAutolavado(id);
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setDetail(loadedDetail);
    } catch {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setError('No se pudieron cargar los detalles del autolavado.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [id, service]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  return (
    <Screen>
      <View style={styles.content}>
        <BackButton fallback="/autolavados" />
        <Text style={styles.kicker}>CONOCE EL LUGAR</Text>
        <Text style={styles.title}>Detalle del autolavado</Text>
        {loading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando detalles del autolavado…</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && error ? <PrimaryButton label="Reintentar" onPress={() => void loadDetail()} /> : null}
        {!loading && !error && !detail ? (
          <Text style={styles.message}>No se encontró el autolavado solicitado.</Text>
        ) : null}
        {!loading && !error && detail ? <AutolavadoContent detail={detail} /> : null}
      </View>
    </Screen>
  );
}

function AutolavadoContent({ detail }: { detail: AutolavadoDetail }) {
  return (
    <>
      <View style={styles.card}>
        <Image accessibilityLabel={`Imagen de ${detail.name}`} source={resolveAutolavadoImage(detail.imageUrl, detail.id)} style={styles.image} />
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{detail.name}</Text>
          <Text style={styles.description}>{detail.description}</Text>
          <Text style={styles.detailText}>{detail.address}</Text>
          <Text style={styles.detailText}>Horario: {detail.hours}</Text>
          <Text style={styles.detailText}>Calificación: {formatRating(detail.rating)}</Text>
          {detail.reviewCount !== null ? <Text style={styles.detailText}>{detail.reviewCount} reseñas</Text> : null}
        </View>
      </View>
      <View style={styles.servicesHeader}>
        <View>
          <Text style={styles.sectionKicker}>LO QUE OFRECE</Text>
          <Text style={styles.sectionTitle}>Servicios</Text>
        </View>
        <Text style={styles.serviceCount}>{detail.services.length} opciones</Text>
      </View>
      {detail.services.length === 0 ? (
        <Text style={styles.message}>Este autolavado no tiene servicios disponibles.</Text>
      ) : (
        detail.services.map((service) => <ServiceCard key={service.id} autolavado={detail} service={service} />)
      )}
    </>
  );
}

function ServiceCard({ autolavado, service }: { autolavado: AutolavadoDetail; service: Servicio }) {
  const openReservation = () => {
    router.push({
      pathname: '/reservar',
      params: {
        autolavadoId: autolavado.id,
        autolavadoName: autolavado.name,
        serviceId: service.id,
        serviceName: service.name,
      },
    });
  };

  return (
    <View style={styles.serviceCard}>
      <Text style={styles.serviceTitle}>{service.name}</Text>
      <Text style={styles.detailText}>{service.description}</Text>
      <Text style={styles.detailText}>Precio: ${formatPrice(service.price)}</Text>
      <Text style={styles.detailText}>Duración aproximada: {formatPrice(service.approximateDurationMinutes)} min</Text>
      <PrimaryButton label="Reservar" onPress={openReservation} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: -spacing.xs },
  title: { color: colors.navy, fontSize: 29, fontWeight: '800', letterSpacing: -0.5 },
  servicesHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  sectionKicker: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 3 },
  sectionTitle: { color: colors.navy, fontSize: 22, fontWeight: '800' },
  serviceCount: { color: colors.muted, fontSize: 12, fontWeight: '700', paddingBottom: 2 },
  messageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  backButtonText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  card: { overflow: 'hidden', borderRadius: radii.xl, backgroundColor: colors.surface, ...shadows.card, shadowOpacity: 0.06 },
  image: { width: '100%', height: 190, backgroundColor: colors.softBlue },
  cardContent: { gap: spacing.sm, padding: spacing.lg },
  cardTitle: { color: colors.navy, fontSize: 22, fontWeight: '800' },
  description: { color: colors.text, fontSize: 16, lineHeight: 24 },
  detailText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  serviceCard: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface, ...shadows.card, shadowOpacity: 0.045 },
  serviceTitle: { color: colors.navy, fontSize: 19, fontWeight: '800' },
});

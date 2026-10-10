import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '../../../components/BackButton';
import { PhotoCapture } from '../../../components/PhotoCapture';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { Screen } from '../../../components/Screen';
import { colors, spacing } from '../../../constants/theme';
import { photoService, toDataUri, type PhotoMoment } from '../../../services/photoService';
import { getUserFacingErrorMessage } from '../../../utils/userFacingError';

type Photos = Record<PhotoMoment, string | null>;

const LABELS: Record<PhotoMoment, string> = { antes: 'Antes del servicio', despues: 'Después del servicio' };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function VehiclePhotosRoute() {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(rawId);
  // "diagnostico" es la prueba de cámara del perfil: no está ligada a una reservación.
  const persistent = !!id && id !== 'diagnostico';

  const [photos, setPhotos] = useState<Photos>({ antes: null, despues: null });
  const [capturing, setCapturing] = useState<PhotoMoment | null>(null);
  const [loading, setLoading] = useState(persistent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    if (!persistent || !id) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const saved = await photoService.listPhotos(id);
      if (requestId !== loadRequestRef.current) {
        return;
      }
      const next: Photos = { antes: null, despues: null };
      saved.forEach((photo) => {
        next[photo.moment] = photo.uri;
      });
      setPhotos(next);
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setError(getUserFacingErrorMessage(loadError, 'No se pudieron cargar las fotografías.'));
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [id, persistent]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCaptured = async (photo: { uri: string; base64: string }, moment: PhotoMoment) => {
    setCapturing(null);
    setError(null);
    setNotice(null);
    if (!persistent || !id) {
      setPhotos((current) => ({ ...current, [moment]: photo.uri }));
      setNotice('Prueba de cámara: esta fotografía no se guarda.');
      return;
    }
    setSaving(true);
    try {
      await photoService.savePhoto(id, moment, photo.base64);
      setPhotos((current) => ({ ...current, [moment]: toDataUri(photo.base64) }));
      setNotice('Fotografía guardada correctamente.');
    } catch (saveError) {
      setError(getUserFacingErrorMessage(saveError, 'No se pudo guardar la fotografía.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <BackButton fallback="/reservaciones" />
        <Text style={styles.title}>Fotografías del vehículo</Text>

        {capturing ? (
          <PhotoCapture moment={capturing} onCancel={() => setCapturing(null)} onCaptured={(photo, moment) => void handleCaptured(photo, moment)} />
        ) : (
          <>
            {loading ? (
              <View style={styles.row}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.message}>Cargando fotografías…</Text>
              </View>
            ) : null}
            {saving ? (
              <View style={styles.row}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.message}>Guardando fotografía…</Text>
              </View>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.success}>{notice}</Text> : null}
            {error && !loading && persistent ? <PrimaryButton label="Reintentar" onPress={() => void load()} /> : null}

            {(['antes', 'despues'] as const).map((moment) => (
              <View key={moment} style={styles.card}>
                <Text style={styles.cardTitle}>{LABELS[moment]}</Text>
                {photos[moment] ? (
                  <Image source={{ uri: photos[moment] as string }} style={styles.photo} accessibilityLabel={`Fotografía ${moment}`} />
                ) : (
                  <Text style={styles.message}>Aún no hay fotografía.</Text>
                )}
                <PrimaryButton
                  label={photos[moment] ? 'Volver a tomar' : 'Tomar fotografía'}
                  onPress={() => setCapturing(moment)}
                  disabled={saving || loading}
                />
              </View>
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  backButton: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.sm },
  backButtonText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  title: { color: colors.text, fontSize: 27, fontWeight: '700' },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  photo: { width: '100%', height: 240, borderRadius: 16, backgroundColor: colors.surfaceSubtle },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: colors.success, fontSize: 15, fontWeight: '700' },
});

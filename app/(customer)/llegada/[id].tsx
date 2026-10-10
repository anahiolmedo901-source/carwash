import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '../../../components/BackButton';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { QrScanner } from '../../../components/QrScanner';
import { Screen } from '../../../components/Screen';
import { colors, spacing } from '../../../constants/theme';
import { arrivalService, type ArrivalContext } from '../../../services/arrivalService';
import { getCurrentCoordinates } from '../../../services/locationService';
import { startMotionSensor } from '../../../services/motionService';
import { distanceInMeters, formatDistance, isNearby, type Coordinates } from '../../../utils/geo';
import { describeMotion, isMoving } from '../../../utils/motion';
import { getUserFacingErrorMessage } from '../../../utils/userFacingError';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ArrivalRoute() {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(rawId);

  const [context, setContext] = useState<ArrivalContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [moving, setMoving] = useState<boolean | null>(null);
  const [motionMessage, setMotionMessage] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scannedQr, setScannedQr] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const loadRequestRef = useRef(0);

  const loadContext = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    if (!id) {
      setLoadError('No se especificó la reservación.');
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
      return;
    }
    try {
      const result = await arrivalService.getArrivalContext(id);
      if (requestId !== loadRequestRef.current) {
        return;
      }
      if (!result) {
        setLoadError('No se encontró la reservación.');
      }
      setContext(result);
    } catch (error) {
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setLoadError(getUserFacingErrorMessage(error, 'No se pudo cargar la información de llegada.'));
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  // Acelerómetro: apoyo experimental para detectar movimiento durante la llegada.
  useEffect(() => {
    const handle = startMotionSensor('accelerometer', {
      onData: (vector) => setMoving(isMoving(vector)),
      onUnavailable: (message) => setMotionMessage(message),
      onError: (message) => setMotionMessage(message),
    });
    return () => handle.stop();
  }, []);

  const locate = async () => {
    setLocating(true);
    setLocationError(null);
    const result = await getCurrentCoordinates();
    if (result.ok) {
      setCoordinates(result.coordinates);
    } else {
      setLocationError(result.message);
    }
    setLocating(false);
  };

  const distance = coordinates && context?.coordinates ? distanceInMeters(coordinates, context.coordinates) : null;
  const nearby = distance !== null && context ? isNearby(distance, context.radiusMeters) : false;
  const canConfirm = !!context
    && context.status === 'confirmada'
    && (nearby || !!scannedQr)
    && moving !== true
    && !confirming
    && !confirmed;

  const confirm = async () => {
    if (!id || !canConfirm) {
      return;
    }
    setConfirming(true);
    setConfirmError(null);
    try {
      await arrivalService.confirmArrival({ reservationId: id, coordinates, qrCode: scannedQr });
      setConfirmed(true);
    } catch (error) {
      setConfirmError(getUserFacingErrorMessage(error, 'No se pudo registrar tu llegada.'));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <BackButton fallback="/reservaciones" />
        <Text style={styles.title}>Registrar llegada</Text>

        {loading ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>Cargando…</Text>
          </View>
        ) : null}
        {loadError ? <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text> : null}
        {!loading && loadError ? <PrimaryButton label="Reintentar" onPress={() => void loadContext()} /> : null}

        {!loading && context ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{context.autolavadoName}</Text>
              {context.status !== 'confirmada' && !confirmed ? (
                <Text style={styles.warning}>
                  {context.status === 'cliente_llego'
                    ? 'Tu llegada ya fue registrada.'
                    : 'Solo puedes registrar la llegada de una reservación confirmada y pagada.'}
                </Text>
              ) : null}

              <Text style={styles.section}>Ubicación (GPS)</Text>
              {context.coordinates ? null : (
                <Text style={styles.message}>Este autolavado aún no tiene coordenadas; usa el código QR.</Text>
              )}
              {distance !== null ? (
                <Text style={[styles.detail, nearby && styles.ok]}>
                  Distancia: {formatDistance(distance)} {nearby ? '· Estás cerca' : '· Aún estás lejos'}
                </Text>
              ) : null}
              {locationError ? <Text accessibilityRole="alert" style={styles.error}>{locationError}</Text> : null}
              <PrimaryButton label={coordinates ? 'Actualizar ubicación' : 'Obtener mi ubicación'} onPress={() => void locate()} loading={locating} />

              <Text style={styles.section}>Movimiento (acelerómetro)</Text>
              <Text style={styles.detail}>
                {motionMessage ?? (moving === null ? 'Esperando lectura…' : describeMotion(moving))}
              </Text>
              {moving === true ? (
                <Text style={styles.warning}>Detén el vehículo y mantén el teléfono quieto antes de confirmar la llegada.</Text>
              ) : null}

              <Text style={styles.section}>Código QR</Text>
              {scannedQr ? <Text style={[styles.detail, styles.ok]}>QR leído correctamente.</Text> : null}
              {scanning ? (
                <QrScanner
                  onScanned={(value) => {
                    setScannedQr(value);
                    setScanning(false);
                  }}
                  onCancel={() => setScanning(false)}
                />
              ) : (
                <PrimaryButton label={scannedQr ? 'Escanear de nuevo' : 'Escanear QR de la reservación'} onPress={() => setScanning(true)} />
              )}
            </View>

            {confirmError ? <Text accessibilityRole="alert" style={styles.error}>{confirmError}</Text> : null}
            {confirmed ? <Text style={styles.success}>Llegada registrada. El empleado ya fue notificado.</Text> : null}
            <PrimaryButton label="Confirmar llegada" onPress={() => void confirm()} disabled={!canConfirm} loading={confirming} />
            {!confirmed && context.status === 'confirmada' && !nearby && !scannedQr ? (
              <Text style={styles.message}>Para confirmar, acércate al autolavado (GPS) o escanea tu QR.</Text>
            ) : null}
          </>
        ) : null}
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
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  section: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: spacing.xs },
  detail: { color: colors.text, fontSize: 16, lineHeight: 23 },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  warning: { color: colors.warning, fontSize: 15, lineHeight: 22 },
  ok: { color: colors.success, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: colors.success, fontSize: 16, fontWeight: '700' },
});

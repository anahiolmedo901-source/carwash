import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BackButton } from '../../components/BackButton';
import { useCameraPermissions } from 'expo-camera';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../constants/theme';
import { getCurrentCoordinates } from '../../services/locationService';
import { startMotionSensor } from '../../services/motionService';
import {
  describeMotion,
  formatAxis,
  isMoving,
  radiansToDegrees,
  type Vector3,
} from '../../utils/motion';

function useSensor(kind: 'accelerometer' | 'gyroscope', enabled: boolean) {
  const [vector, setVector] = useState<Vector3 | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    setMessage(null);
    const handle = startMotionSensor(kind, {
      onData: setVector,
      onUnavailable: setMessage,
      onError: setMessage,
    });
    return () => handle.stop();
  }, [kind, enabled]);

  return { vector, message };
}

export default function SensorDiagnosticRoute() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [running, setRunning] = useState(true);
  const accelerometer = useSensor('accelerometer', running);
  const gyroscope = useSensor('gyroscope', running);

  const [locating, setLocating] = useState(false);
  const [locationText, setLocationText] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const readLocation = async () => {
    setLocating(true);
    setLocationError(null);
    const result = await getCurrentCoordinates();
    if (result.ok) {
      const { latitude, longitude } = result.coordinates;
      const accuracy = result.accuracyMeters === null ? '' : ` (±${Math.round(result.accuracyMeters)} m)`;
      setLocationText(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracy}`);
    } else {
      setLocationText(null);
      setLocationError(result.message);
    }
    setLocating(false);
  };

  const cameraStatus = !cameraPermission
    ? 'Comprobando…'
    : cameraPermission.granted
      ? 'Permiso concedido'
      : cameraPermission.canAskAgain
        ? 'Permiso pendiente'
        : 'Permiso denegado (actívalo en ajustes)';

  return (
    <Screen>
      <View style={styles.content}>
        <BackButton fallback="/" />
        <Text style={styles.title}>Diagnóstico de sensores</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>GPS / Ubicación</Text>
          {locationText ? <Text style={styles.detail}>{locationText}</Text> : null}
          {locationError ? <Text accessibilityRole="alert" style={styles.error}>{locationError}</Text> : null}
          <PrimaryButton label="Leer ubicación" onPress={() => void readLocation()} loading={locating} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cámara</Text>
          <Text style={styles.detail}>{cameraStatus}</Text>
          {cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain ? (
            <PrimaryButton label="Permitir cámara" onPress={() => void requestCameraPermission()} />
          ) : null}
          <PrimaryButton label="Probar fotografía" onPress={() => router.push({ pathname: '/fotos/[id]', params: { id: 'diagnostico' } })} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Acelerómetro</Text>
          {accelerometer.message ? <Text style={styles.error}>{accelerometer.message}</Text> : null}
          {accelerometer.vector ? (
            <>
              <Text style={styles.detail}>
                x {formatAxis(accelerometer.vector.x)} · y {formatAxis(accelerometer.vector.y)} · z {formatAxis(accelerometer.vector.z)} (g)
              </Text>
              <Text style={styles.detail}>{describeMotion(isMoving(accelerometer.vector))}</Text>
            </>
          ) : !accelerometer.message ? (
            <Text style={styles.message}>Esperando lectura…</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Giroscopio</Text>
          {gyroscope.message ? <Text style={styles.error}>{gyroscope.message}</Text> : null}
          {gyroscope.vector ? (
            <Text style={styles.detail}>
              x {formatAxis(radiansToDegrees(gyroscope.vector.x))} · y {formatAxis(radiansToDegrees(gyroscope.vector.y))} · z {formatAxis(radiansToDegrees(gyroscope.vector.z))} (°/s)
            </Text>
          ) : !gyroscope.message ? (
            <Text style={styles.message}>Esperando lectura…</Text>
          ) : null}
        </View>

        <PrimaryButton label={running ? 'Pausar sensores' : 'Reanudar sensores'} onPress={() => setRunning((value) => !value)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  backButton: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.sm },
  backButtonText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  title: { color: colors.text, fontSize: 27, fontWeight: '700' },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  detail: { color: colors.text, fontSize: 15, lineHeight: 22 },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});

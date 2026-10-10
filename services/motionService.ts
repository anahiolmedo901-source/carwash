import { Accelerometer, Gyroscope } from 'expo-sensors';
import { isValidVector, type Vector3 } from '../utils/motion';

export type MotionSensorKind = 'accelerometer' | 'gyroscope';

export interface MotionSensorHandle {
  stop(): void;
}

export interface MotionSensorCallbacks {
  onData(vector: Vector3): void;
  onUnavailable(message: string): void;
  onError(message: string): void;
}

const SENSOR_LABELS: Record<MotionSensorKind, string> = {
  accelerometer: 'acelerómetro',
  gyroscope: 'giroscopio',
};

const UPDATE_INTERVAL_MS = 250;

/**
 * Inicia la lectura de un sensor de movimiento. Comprueba disponibilidad,
 * valida cada lectura y devuelve un handle para detenerlo siempre.
 */
export function startMotionSensor(kind: MotionSensorKind, callbacks: MotionSensorCallbacks): MotionSensorHandle {
  const sensor = kind === 'accelerometer' ? Accelerometer : Gyroscope;
  let stopped = false;
  let subscription: { remove(): void } | null = null;

  const stop = () => {
    stopped = true;
    subscription?.remove();
    subscription = null;
  };

  void (async () => {
    try {
      const available = await sensor.isAvailableAsync();
      if (stopped) {
        return;
      }
      if (!available) {
        callbacks.onUnavailable(`El ${SENSOR_LABELS[kind]} no está disponible en este dispositivo.`);
        return;
      }
      sensor.setUpdateInterval(UPDATE_INTERVAL_MS);
      subscription = sensor.addListener((reading) => {
        if (!stopped && isValidVector(reading)) {
          callbacks.onData({ x: reading.x, y: reading.y, z: reading.z });
        }
      });
    } catch {
      if (!stopped) {
        callbacks.onError(`No se pudo leer el ${SENSOR_LABELS[kind]}.`);
      }
    }
  })();

  return { stop };
}

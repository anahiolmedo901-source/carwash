import * as Location from 'expo-location';
import type { Coordinates } from '../utils/geo';

export type LocationFailure =
  | 'permission-denied'
  | 'services-disabled'
  | 'unavailable';

export type LocationResult =
  | { ok: true; coordinates: Coordinates; accuracyMeters: number | null }
  | { ok: false; reason: LocationFailure; message: string };

export const LOCATION_MESSAGES: Record<LocationFailure, string> = {
  'permission-denied': 'Permiso de ubicación denegado. Actívalo en los ajustes del teléfono para calcular la distancia.',
  'services-disabled': 'El GPS está desactivado. Actívalo para obtener tu ubicación.',
  unavailable: 'No se pudo obtener tu ubicación. Inténtalo de nuevo en un lugar con mejor señal.',
};

function failure(reason: LocationFailure): LocationResult {
  return { ok: false, reason, message: LOCATION_MESSAGES[reason] };
}

/**
 * Solicita el permiso (si hace falta) y devuelve la posición actual.
 * Nunca lanza: todos los errores se devuelven como resultado tipado.
 */
export async function getCurrentCoordinates(): Promise<LocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return failure('permission-denied');
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      return failure('services-disabled');
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return failure('unavailable');
    }
    return {
      ok: true,
      coordinates: { latitude, longitude },
      accuracyMeters: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
    };
  } catch {
    return failure('unavailable');
  }
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Distancia (en metros) a la que se considera que el cliente ya está en el autolavado. */
export const ARRIVAL_RADIUS_METERS = 150;

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function isValidCoordinates(value: Coordinates | null | undefined): value is Coordinates {
  return (
    !!value &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  );
}

/** Distancia entre dos puntos usando la fórmula de Haversine, en metros. */
export function distanceInMeters(from: Coordinates, to: Coordinates): number {
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) {
    return 'Distancia no disponible';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function isNearby(distanceMeters: number, radiusMeters: number = ARRIVAL_RADIUS_METERS): boolean {
  return Number.isFinite(distanceMeters) && distanceMeters <= radiusMeters;
}

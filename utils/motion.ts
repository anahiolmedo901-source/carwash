export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** Aceleración de la gravedad en unidades "g" (expo-sensors reporta el acelerómetro en g). */
const GRAVITY = 1;

/** Variación (en g) respecto a la gravedad a partir de la cual se considera movimiento. */
export const MOVEMENT_THRESHOLD_G = 0.12;

export function isValidVector(value: Partial<Vector3> | null | undefined): value is Vector3 {
  return (
    !!value &&
    typeof value.x === 'number' && Number.isFinite(value.x) &&
    typeof value.y === 'number' && Number.isFinite(value.y) &&
    typeof value.z === 'number' && Number.isFinite(value.z)
  );
}

export function vectorMagnitude(vector: Vector3): number {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
}

/** Devuelve true cuando la magnitud se aleja de la gravedad más que el umbral (el teléfono se mueve). */
export function isMoving(vector: Vector3, threshold: number = MOVEMENT_THRESHOLD_G): boolean {
  if (!isValidVector(vector)) {
    return false;
  }
  return Math.abs(vectorMagnitude(vector) - GRAVITY) > threshold;
}

/** Velocidad angular del giroscopio (rad/s) convertida a grados por segundo. */
export function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function formatAxis(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '--';
}

export function describeMotion(moving: boolean): string {
  return moving ? 'En movimiento' : 'Quieto';
}

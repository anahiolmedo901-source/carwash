import { ARRIVAL_RADIUS_METERS, distanceInMeters, formatDistance, isNearby, isValidCoordinates } from '../utils/geo';

describe('geo', () => {
  const wash = { latitude: 32.6245, longitude: -115.4523 };

  it('devuelve 0 para el mismo punto', () => {
    expect(distanceInMeters(wash, wash)).toBeCloseTo(0, 5);
  });

  it('calcula ~111 km por grado de latitud', () => {
    const distance = distanceInMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(distance).toBeGreaterThan(110000);
    expect(distance).toBeLessThan(112500);
  });

  it('detecta cercanía dentro del radio de llegada', () => {
    const near = { latitude: wash.latitude + 0.0005, longitude: wash.longitude };
    expect(isNearby(distanceInMeters(wash, near))).toBe(true);
    const far = { latitude: wash.latitude + 0.01, longitude: wash.longitude };
    expect(isNearby(distanceInMeters(wash, far))).toBe(false);
    expect(ARRIVAL_RADIUS_METERS).toBe(150);
  });

  it('formatea distancias', () => {
    expect(formatDistance(42.4)).toBe('42 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(Number.NaN)).toBe('Distancia no disponible');
  });

  it('valida coordenadas', () => {
    expect(isValidCoordinates(wash)).toBe(true);
    expect(isValidCoordinates({ latitude: 200, longitude: 0 })).toBe(false);
    expect(isValidCoordinates(null)).toBe(false);
  });
});

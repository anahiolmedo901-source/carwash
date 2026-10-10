import { getCurrentCoordinates } from '../services/locationService';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}), { virtual: true });

const mockLocation = jest.requireMock('expo-location') as Record<string, jest.Mock>;

describe('locationService', () => {
  beforeEach(() => jest.resetAllMocks());

  it('devuelve coordenadas cuando todo funciona', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLocation.hasServicesEnabledAsync.mockResolvedValue(true);
    mockLocation.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 32.6, longitude: -115.4, accuracy: 12 } });
    await expect(getCurrentCoordinates()).resolves.toEqual({
      ok: true,
      coordinates: { latitude: 32.6, longitude: -115.4 },
      accuracyMeters: 12,
    });
  });

  it('informa permiso denegado sin lanzar', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const result = await getCurrentCoordinates();
    expect(result).toMatchObject({ ok: false, reason: 'permission-denied' });
  });

  it('informa GPS desactivado', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLocation.hasServicesEnabledAsync.mockResolvedValue(false);
    expect(await getCurrentCoordinates()).toMatchObject({ ok: false, reason: 'services-disabled' });
  });

  it('captura errores inesperados', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLocation.hasServicesEnabledAsync.mockResolvedValue(true);
    mockLocation.getCurrentPositionAsync.mockRejectedValue(new Error('boom'));
    expect(await getCurrentCoordinates()).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});

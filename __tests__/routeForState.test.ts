import { getRouteForAuthState } from '../utils/authRouting';
import type { AuthProfile } from '../types/auth';

const CUSTOMER_PROFILE: AuthProfile = {
  id: 'customer-123',
  nombre: 'Ana',
  apellido: 'Pérez',
  correo: 'ana@example.com',
  telefono: '+541112345678',
  rol: 'cliente',
};

describe('custom session route selection', () => {
  it('sends anonymous users to login and waits during session restoration', () => {
    expect(getRouteForAuthState({ status: 'signed-out' })).toBe('/(auth)/login');
    expect(getRouteForAuthState({ status: 'loading' })).toBeNull();
  });

  it('routes the authenticated customer to customer tabs only', () => {
    expect(
      getRouteForAuthState({
        status: 'signed-in',
        profile: CUSTOMER_PROFILE,
      }),
    ).toBe('/(customer)/(tabs)');
  });
});

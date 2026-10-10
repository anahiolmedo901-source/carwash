import { createAuthService } from '../services/authService';
import type { AuthServiceStorage } from '../services/authService';
import type { AuthProfile } from '../types/auth';
import { createTestEmail, createTestPassword, createTestPhone } from '../test-utils/testCredentials';
import { getRouteForAuthState } from '../utils/authRouting';

const SESSION_TOKEN = 'a'.repeat(64);
const TEST_PHONE = createTestPhone();
const TEST_PASSWORD = createTestPassword();

function createStorage(initialValue: string | null = null) {
  let value = initialValue;
  const storage: AuthServiceStorage = {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key, nextValue) => {
      value = nextValue;
    }),
    removeItem: jest.fn(async () => {
      value = null;
    }),
  };

  return { storage, getValue: () => value };
}

function createRpc(response: unknown) {
  return { rpc: jest.fn().mockResolvedValue(response) };
}

function authRow(rol: AuthProfile['rol']) {
  return {
    expires_at: '2026-10-11T12:00:00.000Z',
    user_id: rol === 'empleado' ? 'employee-123' : 'user-123',
    nombre: 'Ana',
    apellido: 'Pérez',
    correo: createTestEmail(),
    telefono: TEST_PHONE,
    rol,
  };
}

describe('employee-aware custom authentication', () => {
  it.each(['cliente', 'empleado', 'administrador'] as const)(
    'preserves the server-returned %s role without accepting a client role',
    async (rol) => {
      const { storage } = createStorage();
      const rpc = createRpc({ data: [{ ...authRow(rol), session_token: SESSION_TOKEN }], error: null });
      const service = createAuthService(storage, rpc as never);

      await expect(service.signIn({ telefono: TEST_PHONE, password: TEST_PASSWORD })).resolves.toMatchObject({
        rol,
      });
      expect(rpc.rpc).toHaveBeenCalledWith('carwash_login', {
        p_telefono: TEST_PHONE,
        p_password: TEST_PASSWORD,
      });
      expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('autolavado');
      expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('rol');
    },
  );

  it('preserves an employee role during server-validated session restoration', async () => {
    const { storage } = createStorage(SESSION_TOKEN);
    const rpc = createRpc({ data: [authRow('empleado')], error: null });
    const service = createAuthService(storage, rpc as never);

    await expect(service.restoreSession()).resolves.toMatchObject({
      id: 'employee-123',
      rol: 'empleado',
    });
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_restore_session', {
      p_session_token: SESSION_TOKEN,
    });
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('rejects an unsupported server role before storing a login token', async () => {
    const { storage, getValue } = createStorage();
    const rpc = createRpc({
      data: [{ ...authRow('cliente'), rol: 'unknown', session_token: SESSION_TOKEN }],
      error: null,
    });
    const service = createAuthService(storage, rpc as never);

    await expect(service.signIn({ telefono: TEST_PHONE, password: TEST_PASSWORD })).rejects.toThrow(
      'Invalid authentication role.',
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(getValue()).toBeNull();
  });
});

describe('employee-aware authentication routing', () => {
  const profile = (rol: AuthProfile['rol']): AuthProfile => ({
    id: `${rol}-123`,
    nombre: 'Ana',
    apellido: 'Pérez',
    correo: createTestEmail(),
    telefono: TEST_PHONE,
    rol,
  });

  it.each([
    ['cliente', '/(customer)/(tabs)'],
    ['empleado', '/(employee)'],
    ['administrador', '/(administrator)'],
  ] as const)('routes the authenticated %s to its existing role area', (rol, route) => {
    expect(getRouteForAuthState({ status: 'signed-in', profile: profile(rol) })).toBe(route);
  });

  it('keeps anonymous and restoring states unchanged', () => {
    expect(getRouteForAuthState({ status: 'signed-out' })).toBe('/(auth)/login');
    expect(getRouteForAuthState({ status: 'loading' })).toBeNull();
  });
});

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

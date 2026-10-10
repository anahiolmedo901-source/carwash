import { createAuthService, SESSION_TOKEN_STORAGE_KEY } from '../services/authService';
import type { AuthServiceStorage } from '../services/authService';
import { createTestEmail, createTestPassword, createTestPhone } from '../test-utils/testCredentials';

const SESSION_TOKEN = 'a'.repeat(64);
const TEST_PHONE = createTestPhone();
const TEST_PASSWORD = createTestPassword();
const AUTH_ROW = {
  expires_at: '2026-10-11T12:00:00.000Z',
  user_id: 'customer-123',
  nombre: 'Ana',
  apellido: 'Pérez',
  correo: createTestEmail(),
  telefono: TEST_PHONE,
  rol: 'cliente',
};
const LOGIN_ROW = { ...AUTH_ROW, session_token: SESSION_TOKEN };
const REGISTRATION_ROW = {
  user_id: 'customer-456',
  nombre: 'Bea',
  apellido: 'López',
  correo: 'bea@example.invalid',
  telefono: '+15552345678',
  rol: 'cliente',
};

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

function createRpc() {
  return { rpc: jest.fn() };
}

describe('custom phone authentication service', () => {
  it('sends phone and password only to the login RPC and stores only the opaque session token', async () => {
    const { storage, getValue } = createStorage();
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [LOGIN_ROW], error: null });
    const service = createAuthService(storage, rpc as never);

    await expect(service.signIn({ telefono: TEST_PHONE, password: TEST_PASSWORD })).resolves.toEqual({
      id: 'customer-123',
      nombre: 'Ana',
      apellido: 'Pérez',
      correo: AUTH_ROW.correo,
      telefono: TEST_PHONE,
      rol: 'cliente',
    });

    expect(rpc.rpc).toHaveBeenCalledWith('carwash_login', {
      p_telefono: TEST_PHONE,
      p_password: TEST_PASSWORD,
    });
    expect(storage.setItem).toHaveBeenCalledWith(SESSION_TOKEN_STORAGE_KEY, SESSION_TOKEN);
    expect(getValue()).toBe(SESSION_TOKEN);
    expect(getValue()).not.toContain(TEST_PASSWORD);
  });

  it('removes common phone presentation separators without guessing a country code', async () => {
    const { storage } = createStorage();
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [LOGIN_ROW], error: null });
    const service = createAuthService(storage, rpc as never);

    await service.signIn({ telefono: ' +1 (555) 234-5678 ', password: TEST_PASSWORD });

    expect(rpc.rpc).toHaveBeenCalledWith('carwash_login', {
      p_telefono: '+15552345678',
      p_password: TEST_PASSWORD,
    });
  });

  it.each(['missing phone match', 'ambiguous phone match'])('does not authenticate an %s', async () => {
    const { storage } = createStorage();
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({
      data: null,
      error: { code: '28000', message: 'Invalid phone or password.' },
    });
    const service = createAuthService(storage, rpc as never);

    await expect(service.signIn({ telefono: TEST_PHONE, password: TEST_PASSWORD })).rejects.toThrow(
      'Invalid phone or password.',
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('uses the same generic failure when the login RPC returns no matching row', async () => {
    const { storage } = createStorage();
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [], error: null });
    const service = createAuthService(storage, rpc as never);

    await expect(service.signIn({ telefono: TEST_PHONE, password: TEST_PASSWORD })).rejects.toThrow(
      'Invalid phone or password.',
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('sends normalized registration fields to the custom RPC without creating a session', async () => {
    const { storage } = createStorage();
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({
      data: [{ ...REGISTRATION_ROW, password_hash: 'must-not-be-exposed' }],
      error: null,
    });
    const service = createAuthService(storage, rpc as never);

    await expect(service.register({
      nombre: ' Bea ',
      apellido: ' López ',
      correo: 'BEA@EXAMPLE.INVALID ',
      telefono: ' +1 (555) 234-5678 ',
      password: TEST_PASSWORD,
    })).resolves.toEqual({
      id: REGISTRATION_ROW.user_id,
      nombre: REGISTRATION_ROW.nombre,
      apellido: REGISTRATION_ROW.apellido,
      correo: REGISTRATION_ROW.correo,
      telefono: REGISTRATION_ROW.telefono,
      rol: REGISTRATION_ROW.rol,
    });

    expect(rpc.rpc).toHaveBeenCalledWith('carwash_register', {
      p_nombre: 'Bea',
      p_apellido: 'López',
      p_correo: 'bea@example.invalid',
      p_telefono: '+15552345678',
      p_password: TEST_PASSWORD,
    });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('surfaces a stable registration RPC error without storing a token', async () => {
    const { storage } = createStorage();
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'A customer account already exists for this phone number.' },
    });
    const service = createAuthService(storage, rpc as never);

    await expect(service.register({
      nombre: 'Bea',
      apellido: 'López',
      correo: 'bea@example.invalid',
      telefono: TEST_PHONE,
      password: TEST_PASSWORD,
    })).rejects.toThrow('A customer account already exists for this phone number.');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('restores the real customer profile by validating the locally stored token', async () => {
    const { storage } = createStorage(SESSION_TOKEN);
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [AUTH_ROW], error: null });
    const service = createAuthService(storage, rpc as never);

    await expect(service.restoreSession()).resolves.toEqual({
      id: 'customer-123',
      nombre: 'Ana',
      apellido: 'Pérez',
      correo: AUTH_ROW.correo,
      telefono: TEST_PHONE,
      rol: 'cliente',
    });
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_restore_session', { p_session_token: SESSION_TOKEN });
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('clears an expired or revoked token when the server returns no session', async () => {
    const { storage, getValue } = createStorage(SESSION_TOKEN);
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [], error: null });
    const service = createAuthService(storage, rpc as never);

    await expect(service.restoreSession()).resolves.toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(SESSION_TOKEN_STORAGE_KEY);
    expect(getValue()).toBeNull();
  });

  it('preserves the token when restoration fails because the RPC is unavailable', async () => {
    const { storage, getValue } = createStorage(SESSION_TOKEN);
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: null, error: new Error('Network unavailable') });
    const service = createAuthService(storage, rpc as never);

    await expect(service.restoreSession()).rejects.toThrow('Network unavailable');
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(getValue()).toBe(SESSION_TOKEN);
  });

  it('revokes the server session before removing the local token on sign-out', async () => {
    const { storage, getValue } = createStorage(SESSION_TOKEN);
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: null, error: null });
    const service = createAuthService(storage, rpc as never);

    await expect(service.signOut()).resolves.toBeUndefined();

    expect(rpc.rpc).toHaveBeenCalledWith('carwash_revoke_session', { p_session_token: SESSION_TOKEN });
    expect(storage.removeItem).toHaveBeenCalledWith(SESSION_TOKEN_STORAGE_KEY);
    expect(getValue()).toBeNull();
  });

  it('keeps the local token if server-side revocation fails', async () => {
    const { storage, getValue } = createStorage(SESSION_TOKEN);
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: null, error: new Error('Network unavailable') });
    const service = createAuthService(storage, rpc as never);

    await expect(service.signOut()).rejects.toThrow('Network unavailable');
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(getValue()).toBe(SESSION_TOKEN);
  });
});

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

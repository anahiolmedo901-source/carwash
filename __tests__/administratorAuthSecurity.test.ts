import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuthService } from '../services/authService';
import type { AuthServiceStorage } from '../services/authService';
import type { AuthProfile } from '../types/auth';
import { createTestEmail, createTestPassword, createTestPhone } from '../test-utils/testCredentials';
import { getRouteForAuthState } from '../utils/authRouting';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261006000200_administrator_auth.sql',
);
const rootLayoutPath = join(process.cwd(), 'app/_layout.tsx');
const SESSION_TOKEN = 'a'.repeat(64);
const TEST_PHONE = createTestPhone();
const TEST_PASSWORD = createTestPassword();

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing database function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

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

function authRow(rol: AuthProfile['rol']) {
  return {
    expires_at: '2026-10-13T12:00:00.000Z',
    user_id: `${rol}-123`,
    nombre: 'Ana',
    apellido: 'Pérez',
    correo: createTestEmail(),
    telefono: TEST_PHONE,
    rol,
  };
}

describe('administrator authentication and protected routing', () => {
  it('logs in an administrator from the server-returned role and stores only the opaque token', async () => {
    const { storage, getValue } = createStorage();
    const rpc = {
      rpc: jest.fn().mockResolvedValue({
        data: [{ ...authRow('administrador'), session_token: SESSION_TOKEN }],
        error: null,
      }),
    };
    const service = createAuthService(storage, rpc as never);

    await expect(service.signIn({ telefono: TEST_PHONE, password: TEST_PASSWORD })).resolves.toMatchObject({
      id: 'administrador-123',
      rol: 'administrador',
    });

    expect(rpc.rpc).toHaveBeenCalledWith('carwash_login', {
      p_telefono: TEST_PHONE,
      p_password: TEST_PASSWORD,
    });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('rol');
    expect(storage.setItem).toHaveBeenCalledWith('@carwashnow/custom-session-token', SESSION_TOKEN);
    expect(getValue()).toBe(SESSION_TOKEN);
  });

  it('restores an administrator profile through server validation of the opaque token', async () => {
    const { storage } = createStorage(SESSION_TOKEN);
    const rpc = {
      rpc: jest.fn().mockResolvedValue({ data: [authRow('administrador')], error: null }),
    };
    const service = createAuthService(storage, rpc as never);

    await expect(service.restoreSession()).resolves.toMatchObject({
      id: 'administrador-123',
      rol: 'administrador',
    });
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_restore_session', {
      p_session_token: SESSION_TOKEN,
    });
  });

  it.each([
    ['cliente', '/(customer)/(tabs)'],
    ['empleado', '/(employee)'],
    ['administrador', '/(administrator)'],
  ] as const)('keeps %s on its role-specific route', (rol, route) => {
    const profile: AuthProfile = {
      ...authRow(rol),
      id: `${rol}-123`,
    };
    expect(getRouteForAuthState({ status: 'signed-in', profile })).toBe(route);
  });

  it('protects the administrator route with the root auth guard', () => {
    const rootLayout = readFileSync(rootLayoutPath, 'utf8');

    expect(rootLayout).toMatch(
      /<Stack\.Protected guard=\{hasRole\(state, 'administrador'\)\}>[\s\S]*?<Stack\.Screen name="\(administrator\)" \/>/,
    );
  });
});

describe('administrator authentication migration security contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('accepts only active administrator identities for the administrator helper', () => {
    const helper = readFunction(sql, 'carwash_current_administrator_id');

    expect(helper).toMatch(/usuario\.rol::text\s*=\s*'administrador'/i);
    expect(helper).toMatch(/usuario\.activo\s+IS\s+TRUE/i);
    expect(helper).toMatch(/stored_session\.revoked_at\s+IS\s+NULL/i);
    expect(helper).toMatch(/stored_session\.expires_at\s*>\s*pg_catalog\.clock_timestamp\(\)/i);
    expect(helper).toMatch(/RETURN\s+NULL/i);
    expect(helper).not.toMatch(/usuario\.rol::text\s*=\s*'(?:cliente|empleado)'/i);
    expect(helper).not.toMatch(/usuario\.rol::text\s+IN\s*\([^)]*'(?:cliente|empleado)'/i);
  });

  it('admits active administrators without adding a client role parameter', () => {
    const login = readFunction(sql, 'carwash_login');

    expect(login).toMatch(/v_activo\s+IS\s+TRUE/i);
    expect(login).toMatch(/v_rol\s+IN\s*\(\s*'cliente'\s*,\s*'empleado'\s*,\s*'administrador'\s*\)/i);
    expect(login).toMatch(/RETURN QUERY\s+SELECT\s+v_session_token[\s\S]*v_rol::text/i);
    expect(login).not.toMatch(/\bp_(?:rol|role|autolavado_id)\b/i);
  });

  it('restores all admitted roles through role-specific server helpers', () => {
    const restore = readFunction(sql, 'carwash_restore_session');

    expect(restore).toContain('public.carwash_current_user_id(p_session_token)');
    expect(restore).toContain('public.carwash_current_employee_id(p_session_token)');
    expect(restore).toContain('public.carwash_current_administrator_id(p_session_token)');
    expect(restore).toMatch(/usuario\.rol::text\s+IN\s*\(\s*'cliente'\s*,\s*'empleado'\s*,\s*'administrador'\s*\)/i);
    expect(restore).not.toMatch(/\bp_(?:rol|role|autolavado_id)\b/i);
  });

  it('keeps helper access private while exposing only login and restore entry points', () => {
    for (const name of ['carwash_current_administrator_id', 'carwash_login', 'carwash_restore_session']) {
      const routine = readFunction(sql, name);
      expect(routine).toMatch(/SECURITY DEFINER/i);
      expect(routine).toMatch(/SET search_path\s*=\s*''/i);
    }

    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.carwash_current_administrator_id\(text\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.carwash_login\(text, text\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.carwash_restore_session\(text\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_login\(text, text\) TO anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_restore_session\(text\) TO anon, authenticated/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_current_administrator_id\([^;]+ TO anon, authenticated/i);
  });
});

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

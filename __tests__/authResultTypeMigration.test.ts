import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261009000300_auth_result_type_compatibility.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing authentication function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('authentication result type compatibility migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('casts every restored profile field to the declared text result type', () => {
    const restore = readFunction(sql, 'carwash_restore_session');
    expect(restore).toMatch(/usuario\.id::text/);
    expect(restore).toMatch(/usuario\.nombre::text/);
    expect(restore).toMatch(/usuario\.apellido::text/);
    expect(restore).toMatch(/usuario\.correo::text/);
    expect(restore).toMatch(/usuario\.telefono::text/);
    expect(restore).toMatch(/usuario\.rol::text/);
  });

  it('casts every login result field to the declared return contract', () => {
    const login = readFunction(sql, 'carwash_login');
    expect(login).toMatch(/v_session_token::text/);
    expect(login).toMatch(/v_expires_at::timestamptz/);
    expect(login).toMatch(/v_user_id::text/);
    expect(login).toMatch(/v_nombre::text/);
    expect(login).toMatch(/v_apellido::text/);
    expect(login).toMatch(/v_correo::text/);
    expect(login).toMatch(/v_telefono::text/);
    expect(login).toMatch(/v_rol::text/);
  });
});

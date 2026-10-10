import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261006000100_employee_auth_assignments.sql',
);
const legacyAuthMigrationPath = join(
  process.cwd(),
  'supabase/migrations/20261004000100_custom_auth_and_vehicles.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing database function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('employee authentication and assignment migration contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const legacyAuthSql = readFileSync(legacyAuthMigrationPath, 'utf8');

  it('keeps the existing customer-only helper and adds a separate employee helper', () => {
    const customerHelper = readFunction(legacyAuthSql, 'carwash_current_user_id');
    const employeeHelper = readFunction(sql, 'carwash_current_employee_id');

    expect(customerHelper).toMatch(/usuario\.rol::text\s*=\s*'cliente'/i);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.carwash_current_user_id/i);
    expect(employeeHelper).toMatch(/usuario\.rol::text\s*=\s*'empleado'/i);
    expect(employeeHelper).toMatch(/usuario\.activo\s+IS\s+TRUE/i);
    expect(employeeHelper).toMatch(/stored_session\.revoked_at\s+IS\s+NULL/i);
    expect(employeeHelper).toMatch(/stored_session\.expires_at\s*>\s*pg_catalog\.clock_timestamp\(\)/i);
    expect(employeeHelper).toMatch(/RETURN\s+NULL/i);
  });

  it('allows only active customers and employees to log in and returns the actual role', () => {
    const login = readFunction(sql, 'carwash_login');

    expect(login).toMatch(/AND\s+v_activo\s+IS\s+TRUE/i);
    expect(login).toMatch(/AND\s+v_rol\s+IN\s*\(\s*'cliente'\s*,\s*'empleado'\s*\)/i);
    expect(login).toMatch(/RETURN QUERY\s+SELECT\s+v_session_token[\s\S]*v_rol::text/i);
    expect(login).not.toMatch(/v_rol\s*=\s*'administrador'/i);
    expect(login).not.toMatch(/'cliente'::text\s*;\s*$/im);
  });

  it('restores only customer or employee sessions through server-derived role checks', () => {
    const restore = readFunction(sql, 'carwash_restore_session');

    expect(restore).toContain('public.carwash_current_user_id(p_session_token)');
    expect(restore).toContain('public.carwash_current_employee_id(p_session_token)');
    expect(restore).toMatch(/usuario\.rol::text\s+IN\s*\(\s*'cliente'\s*,\s*'empleado'\s*\)/i);
    expect(restore).not.toMatch(/p_(?:rol|autolavado_id)/i);
  });

  it('creates multiple active assignment relationships without granting direct client table access', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.empleado_autolavados/i);
    expect(sql).toMatch(/empleado_id\s+%s\s+NOT NULL\s+REFERENCES public\.usuarios\(id\)/i);
    expect(sql).toMatch(/autolavado_id\s+%s\s+NOT NULL\s+REFERENCES public\.autolavados\(id\)/i);
    expect(sql).toMatch(/activo\s+boolean\s+NOT NULL\s+DEFAULT\s+true/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS carwash_empleado_autolavados_active_pair_idx/i);
    expect(sql).toMatch(/ON public\.empleado_autolavados\s*\(\s*empleado_id\s*,\s*autolavado_id\s*\)\s*WHERE activo IS TRUE/i);
    expect(sql).toMatch(/ALTER TABLE public\.empleado_autolavados ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY carwash_deny_client_access ON public\.empleado_autolavados AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.empleado_autolavados FROM PUBLIC, anon, authenticated/i);
    expect(sql).not.toMatch(/GRANT\s+[^;]*ON\s+TABLE\s+public\.empleado_autolavados/i);
  });

  it('pins all new routines to an empty search path and exposes only auth entry points', () => {
    for (const name of ['carwash_current_employee_id', 'carwash_login', 'carwash_restore_session']) {
      const routine = readFunction(sql, name);
      expect(routine).toMatch(/SECURITY DEFINER/i);
      expect(routine).toMatch(/SET search_path\s*=\s*''/i);
    }

    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.carwash_current_employee_id\(text\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.carwash_login\(text, text\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.carwash_restore_session\(text\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_login\(text, text\) TO anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_restore_session\(text\) TO anon, authenticated/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_current_employee_id\([^;]+ TO anon, authenticated/i);
  });

  it('does not give clients role or car-wash authority inputs', () => {
    expect(sql).not.toMatch(/\bp_(?:rol|role|autolavado_id)\b/i);
    expect(readFunction(sql, 'carwash_login')).toMatch(
      /FUNCTION public\.carwash_login\(p_telefono text, p_password text\)/i,
    );
    expect(readFunction(sql, 'carwash_restore_session')).toMatch(
      /FUNCTION public\.carwash_restore_session\(p_session_token text\)/i,
    );
    expect(readFunction(sql, 'carwash_current_employee_id')).toMatch(
      /FUNCTION public\.carwash_current_employee_id\(p_session_token text\)/i,
    );
  });
});

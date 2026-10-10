import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
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

describe('custom authentication and vehicle RPC SQL contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('creates the Supabase extensions schema and pgcrypto before using crypto functions', () => {
    const schemaSetup = sql.search(/CREATE SCHEMA IF NOT EXISTS extensions\s*;\s*CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions\s*;/i);
    const firstCryptoUse = sql.search(/extensions\.(?:crypt|gen_salt|digest|gen_random_bytes)\s*\(/i);

    expect(schemaSetup).toBeGreaterThanOrEqual(0);
    expect(firstCryptoUse).toBeGreaterThan(schemaSetup);
  });

  it('indexes the normalized phone expression used by login lookup', () => {
    const normalizedExpression = "pg_catalog.regexp_replace(pg_catalog.btrim(telefono::text), '[[:space:]().-]', '', 'g')";
    const compactSql = sql.replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').toLowerCase();
    const compactExpression = normalizedExpression.replace(/\s*([(),])\s*/g, '$1').toLowerCase();

    expect(compactSql).toContain(
      `create index if not exists carwash_usuarios_normalized_telefono_lookup_idx on public.usuarios((${compactExpression}));`,
    );
    expect(sql).toMatch(/pg_catalog\.regexp_replace\s*\(\s*pg_catalog\.btrim\(usuario\.telefono::text\)/i);
  });

  it('uses bcrypt hashes and a generic failure for missing, ambiguous, or invalid credentials', () => {
    const login = readFunction(sql, 'carwash_login');

    expect(login).toMatch(/extensions\.crypt\s*\(/i);
    expect(login).toMatch(/pg_catalog\.count\s*\(\s*\*\s*\)/i);
    expect(login).toMatch(/v_match_count\s*=\s*1/i);
    expect(login).toMatch(/RETURN\s*;/i);
    expect(login).not.toMatch(/RAISE\s+EXCEPTION[^;]*(?:phone|password)/i);
    expect(login).not.toMatch(/RETURNS TABLE\s*\([^)]*password_hash/is);
  });

  it('normalizes common phone separators and rejects ambiguous normalized matches', () => {
    const login = readFunction(sql, 'carwash_login');

    expect(login).toMatch(/regexp_replace\s*\(\s*pg_catalog\.btrim\s*\(\s*COALESCE\s*\(\s*p_telefono/i);
    expect(login).toMatch(/regexp_replace\s*\(\s*pg_catalog\.btrim\s*\(\s*usuario\.telefono::text/i);
    expect(login).toMatch(/=\s*v_normalized_phone/i);
    expect(login).toMatch(/v_match_count\s*=\s*1/i);
  });

  it('applies a bounded progressive cooldown to failures per phone and performs bcrypt work for generic invalid paths', () => {
    const login = readFunction(sql, 'carwash_login');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.carwash_login_attempts/i);
    expect(sql).toMatch(/failed_attempts integer NOT NULL DEFAULT 0 CHECK \(failed_attempts BETWEEN 0 AND 5\)/i);
    expect(login).toMatch(/carwash_login_attempts/i);
    expect(login).toMatch(/failed_attempts\s*=\s*LEAST\(v_failed_attempts\s*\+\s*1,\s*5\)/i);
    expect(login).toMatch(/pg_catalog\.pg_sleep\s*\(\s*LEAST\s*\(\s*8::double precision/i);
    expect(login).toMatch(/v_window_started_at\s*<=\s*v_now\s*-\s*INTERVAL\s+'15 minutes'/i);
    expect(login).toMatch(/extensions\.digest\s*\(\s*v_normalized_phone\s*,\s*'sha256'/i);
    expect(login.match(/extensions\.crypt\s*\(/gi)).toHaveLength(2);
    expect(login).toMatch(/extensions\.gen_salt\s*\(\s*'bf'\s*,\s*12\s*\)/i);
    expect(login).toMatch(/attempts\.updated_at\s*<\s*v_now\s*-\s*INTERVAL\s+'1 day'/i);
    expect(sql).not.toMatch(/password_prueba/i);
    expect(login).not.toMatch(/\bRAISE\s+(?:LOG|NOTICE|WARNING)\b/i);
    expect(login).not.toMatch(/\bRAISE\s+EXCEPTION\b[^;]*\bp_(?:telefono|password)\b/i);
    expect(login).not.toMatch(/v_locked_until|locked_until\s*>\s*v_now/i);
    const writes = login.match(/\b(?:INSERT INTO|UPDATE)\b[\s\S]*?;/gi) ?? [];
    expect(writes.every((statement) => !/\bp_password\b/i.test(statement))).toBe(true);
  });

  it('does not reject valid credentials solely because the per-phone failure counter is high', () => {
    const login = readFunction(sql, 'carwash_login');
    const attemptRowLock = login.indexOf('FOR UPDATE;');
    const passwordVerification = login.indexOf('v_password_valid := extensions.crypt');
    const failedCredentialBranch = login.indexOf('IF v_password_valid IS DISTINCT FROM TRUE THEN');
    const cooldown = login.indexOf('pg_catalog.pg_sleep');
    const failedCredentialReturn = login.indexOf('RETURN;', failedCredentialBranch);
    const successAttemptCleanup = login.indexOf('DELETE FROM public.carwash_login_attempts AS attempts', failedCredentialBranch);

    expect(attemptRowLock).toBeGreaterThanOrEqual(0);
    expect(passwordVerification).toBeGreaterThan(attemptRowLock);
    expect(login.slice(attemptRowLock, passwordVerification)).not.toMatch(/\bRETURN\s*;/i);
    expect(failedCredentialBranch).toBeGreaterThan(passwordVerification);
    expect(cooldown).toBeGreaterThan(failedCredentialBranch);
    expect(cooldown).toBeLessThan(failedCredentialReturn);
    expect(successAttemptCleanup).toBeGreaterThan(failedCredentialReturn);
    expect(login.slice(failedCredentialReturn, successAttemptCleanup)).toMatch(/END IF\s*;/i);
  });

  it('issues random opaque sessions, stores only their digest, bounds lifetime, validates expiry, and revokes logout', () => {
    expect(sql).toMatch(/extensions\.gen_random_bytes\s*\(\s*32\s*\)/i);
    expect(sql).toMatch(/extensions\.digest\s*\([^)]*'sha256'/i);
    expect(sql).toMatch(/INTERVAL\s+'7 days'/i);
    expect(sql).toMatch(/expires_at\s*>\s*pg_catalog\.clock_timestamp\(\)/i);
    expect(readFunction(sql, 'carwash_revoke_session')).toMatch(/revoked_at\s*=\s*pg_catalog\.clock_timestamp\(\)/i);
  });

  it('derives vehicle ownership from the validated token and never accepts a user id argument', () => {
    const names = [
      'carwash_list_vehicles',
      'carwash_get_vehicle',
      'carwash_create_vehicle',
      'carwash_update_vehicle',
      'carwash_delete_vehicle',
    ];

    for (const name of names) {
      const routine = readFunction(sql, name);
      expect(routine).toContain('carwash_current_user_id(p_session_token)');
      if (name === 'carwash_create_vehicle') {
        expect(routine).toMatch(/USING v_owner_id/i);
      } else if (name === 'carwash_update_vehicle') {
        expect(routine).toMatch(/vehicle\.usuario_id::text\s*=\s*\$8/i);
        expect(routine).toMatch(/p_vehicle_id, v_owner_id/i);
      } else {
        expect(routine).toMatch(/vehicle\.usuario_id::text\s*=\s*v_owner_id/i);
      }
    }
    expect(sql).not.toMatch(/\bp_usuario_id\b/i);
    expect(sql).toContain("'sedan', 'hatchback', 'suv', 'pickup', 'van', 'deportivo', 'otro'");
  });

  it('pins every security-definer routine to an empty search path and revokes direct table access', () => {
    const functions = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi) ?? [];
    expect(functions.length).toBeGreaterThanOrEqual(9);
    for (const routine of functions) {
      expect(routine).toMatch(/SECURITY DEFINER/i);
      expect(routine).toMatch(/SET search_path\s*=\s*''/i);
    }
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_login/i);

    for (const table of ['usuarios', 'carwash_sessions', 'carwash_login_attempts', 'vehiculos']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
      expect(sql).toMatch(new RegExp(`DROP POLICY IF EXISTS carwash_deny_client_access ON public\\.${table}`, 'i'));
      expect(sql).toMatch(new RegExp(
        `CREATE POLICY carwash_deny_client_access ON public\\.${table} AS RESTRICTIVE FOR ALL TO anon, authenticated USING \\(false\\) WITH CHECK \\(false\\)`,
        'i',
      ));
    }
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE[^;]*carwash_login_attempts[^;]*FROM PUBLIC, anon, authenticated/i);
  });
});

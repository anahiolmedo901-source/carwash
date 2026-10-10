import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261007000100_customer_registration.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing database function ${name}`);
  }
  const end = sql.indexOf('$$;', start);
  if (end < 0) {
    throw new Error(`Missing function terminator for ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, Math.min(end + 3, next < 0 ? Number.MAX_SAFE_INTEGER : next));
}

describe('customer registration migration security contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const registration = readFunction(sql, 'carwash_register');

  it('exposes only a public registration RPC with the existing custom-auth boundary', () => {
    expect(registration).toMatch(/RETURNS TABLE\s*\([\s\S]*user_id text[\s\S]*rol text/i);
    expect(registration).toMatch(/LANGUAGE plpgsql/i);
    expect(registration).toMatch(/SECURITY DEFINER/i);
    expect(registration).toMatch(/SET search_path\s*=\s*''/i);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.carwash_register\(text, text, text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.carwash_register\(text, text, text, text, text\)[\s\S]*TO anon, authenticated/i,
    );
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.usuarios[\s\S]*FROM PUBLIC, anon, authenticated/i);
  });

  it('validates required names, email, normalized phone, and password server-side', () => {
    expect(registration).toMatch(/v_nombre = ''/i);
    expect(registration).toMatch(/v_apellido = ''/i);
    expect(registration).toContain("v_correo !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'");
    expect(registration).toContain("v_normalized_phone !~ '^\\+?[0-9]{7,15}$'");
    expect(registration).toMatch(/pg_catalog\.char_length\(p_password\) < 8/i);
    expect(registration).toMatch(/p_password !~ '\[a-z\]'/i);
    expect(registration).toMatch(/p_password !~ '\[A-Z\]'/i);
    expect(registration).toMatch(/p_password !~ '\[0-9\]'/i);
    expect(registration).toMatch(/ERRCODE = '22023'/i);
  });

  it('serializes normalized-phone duplicate checks and returns a stable safe error', () => {
    expect(registration).toMatch(/pg_catalog\.pg_advisory_xact_lock\s*\(/i);
    expect(registration).toMatch(/pg_catalog\.hashtextextended\(v_normalized_phone, 0\)/i);
    expect(registration).toMatch(/SELECT EXISTS\s*\([\s\S]*usuario\.telefono::text[\s\S]*= v_normalized_phone/i);
    expect(registration).toMatch(/A customer account already exists for this phone number\./i);
    expect(registration).toMatch(/ERRCODE = '23505'/i);
  });

  it('owns customer role and active state, hashes with the login-compatible contract, and returns no secrets', () => {
    expect(registration).toMatch(/INSERT INTO public\.usuarios AS usuario\s*\([\s\S]*password_hash/i);
    expect(registration).toMatch(/'cliente',\s*TRUE,\s*extensions\.crypt\(p_password, extensions\.gen_salt\('bf', 12\)\)/i);
    const returnDeclaration = registration.slice(0, registration.indexOf('LANGUAGE plpgsql'));
    expect(returnDeclaration).not.toMatch(/password_hash/i);
    expect(registration).not.toMatch(/\bp_(?:rol|role|password_hash|session_token|auth_id|authorization_id)\b/i);
  });
});

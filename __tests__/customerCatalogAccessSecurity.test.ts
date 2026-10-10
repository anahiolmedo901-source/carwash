import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261006000300_administrator_reads_and_reservation_price_snapshot.sql',
);
const catalogServicePath = join(process.cwd(), 'services/autolavadoService.ts');

describe('customer catalog access regression contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const catalogService = readFileSync(catalogServicePath, 'utf8');

  it('preserves the existing dynamic customer detail reads with read-only catalog grants', () => {
    expect(catalogService).toMatch(/client\.from\(table\)\.select\('\*'\)/i);
    for (const table of ['autolavados', 'servicios', 'espacios_lavado']) {
      expect(catalogService).toContain(`'${table}'`);
      expect(sql).toMatch(new RegExp(
        `DROP POLICY IF EXISTS carwash_deny_client_access ON public\\.${table}[\\s\\S]*?CREATE POLICY carwash_public_catalog_read ON public\\.${table}\\s+AS PERMISSIVE FOR SELECT TO anon, authenticated USING \\(true\\)`,
        'i',
      ));
    }
    expect(sql).toMatch(/GRANT SELECT ON TABLE[\s\S]*public\.autolavados[\s\S]*public\.servicios[\s\S]*public\.espacios_lavado[\s\S]*TO anon, authenticated/i);
  });

  it('does not open catalog writes or direct access to sensitive tables', () => {
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)\b[^;]*ON\s+TABLE\s+public\.(?:autolavados|servicios|espacios_lavado)/i);
    expect(sql).not.toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.(?:usuarios|empleado_autolavados|reservaciones|pagos)\b/i);
    for (const table of ['usuarios', 'empleado_autolavados', 'reservaciones', 'pagos']) {
      expect(sql).toMatch(new RegExp(
        `CREATE POLICY carwash_deny_client_access ON public\\.${table}\\s+AS RESTRICTIVE FOR ALL TO anon, authenticated USING \\(false\\) WITH CHECK \\(false\\)`,
        'i',
      ));
    }
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE[\s\S]*public\.usuarios[\s\S]*public\.reservaciones[\s\S]*public\.pagos[\s\S]*FROM PUBLIC, anon, authenticated/i);
  });
});

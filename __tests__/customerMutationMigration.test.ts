import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261009000500_customer_mutation_compatibility.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing customer mutation function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('customer mutation compatibility migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('cancels only the owned reservation and verifies the update count', () => {
    const cancel = readFunction(sql, 'carwash_cancel_reservation');
    expect(cancel).toMatch(/reservation\.id::text\s*=\s*p_reservation_id/i);
    expect(cancel).toMatch(/reservation\.usuario_id::text\s*=\s*v_owner_id/i);
    expect(cancel).toMatch(/SET estado\s*=\s*'cancelada'/i);
    expect(cancel).toMatch(/GET DIAGNOSTICS\s+v_updated_count\s*=\s*ROW_COUNT/i);
    expect(cancel).toMatch(/v_updated_count\s*<>\s*1/);
  });

  it('does not physically delete vehicles before the final soft-delete migration', () => {
    const remove = readFunction(sql, 'carwash_delete_vehicle');
    expect(remove).toMatch(/SET activo\s*=\s*false/i);
    expect(remove).toMatch(/eliminado_en\s*=\s*pg_catalog\.clock_timestamp/i);
    expect(remove).not.toMatch(/DELETE\s+FROM\s+public\.vehiculos/i);
  });
});

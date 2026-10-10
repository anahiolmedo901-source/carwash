import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261009000600_vehicle_soft_delete.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing vehicle soft-delete function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('vehicle soft-delete migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds soft-delete state and hides inactive vehicles from owner queries', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS activo boolean/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS eliminado_en timestamptz/i);
    expect(readFunction(sql, 'carwash_list_vehicles')).toMatch(/vehicle\.activo\s+IS\s+TRUE/i);
    expect(readFunction(sql, 'carwash_get_vehicle')).toMatch(/vehicle\.activo\s+IS\s+TRUE/i);
    expect(readFunction(sql, 'carwash_update_vehicle')).toMatch(/vehicle\.activo\s+IS\s+TRUE/i);
  });

  it('blocks active reservations and updates only the owned vehicle', () => {
    const remove = readFunction(sql, 'carwash_delete_vehicle');
    expect(remove).toMatch(/vehicle\.usuario_id::text\s*=\s*v_owner_id/i);
    expect(remove).toMatch(/estado::text\s+IN\s*\([\s\S]*'pendiente'[\s\S]*'confirmada'[\s\S]*'cliente_llego'[\s\S]*'en_espera'[\s\S]*'en_lavado'/i);
    expect(remove).toMatch(/This vehicle has active reservations/i);
    expect(remove).toMatch(/SET activo\s*=\s*false/i);
    expect(remove).toMatch(/eliminado_en\s*=\s*pg_catalog\.clock_timestamp/i);
    expect(remove).not.toMatch(/DELETE\s+FROM\s+public\.vehiculos/i);
  });

  it('prevents new reservations from using a deactivated vehicle', () => {
    const guard = readFunction(sql, 'carwash_validate_active_vehicle');
    expect(guard).toMatch(/FROM public\.vehiculos AS vehicle/i);
    expect(guard).toMatch(/v_active\s+IS DISTINCT FROM\s+TRUE/i);
    expect(sql).toMatch(/CREATE TRIGGER carwash_reservaciones_active_vehicle_guard/i);
  });
});

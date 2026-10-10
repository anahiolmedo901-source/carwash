import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(process.cwd(), 'supabase/migrations/20261004000300_realtime_broadcast.sql');
const reservationMigrationPath = join(
  process.cwd(),
  'supabase/migrations/20261004000200_reservations.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing realtime database function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('Realtime Broadcast migration contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const reservationSql = readFileSync(reservationMigrationPath, 'utf8');

  it('hardens existing estado columns before reservation RPCs reference estado', () => {
    const firstReservationRpc = reservationSql.indexOf(
      'CREATE OR REPLACE FUNCTION public.carwash_available_spaces',
    );
    const firstStateReference = reservationSql.indexOf('.estado', firstReservationRpc);
    const preRpcSql = reservationSql.slice(0, firstStateReference);
    const stateColumn = reservationSql.indexOf(
      "ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'disponible'",
    );
    const stateDefault = reservationSql.indexOf(
      "ALTER COLUMN estado SET DEFAULT 'disponible'",
    );
    const stateNotNull = reservationSql.indexOf('ALTER COLUMN estado SET NOT NULL');
    const stateConstraint = reservationSql.indexOf(
      'ADD CONSTRAINT carwash_espacios_lavado_estado_check',
    );
    const ownedConstraintName = 'carwash_espacios_lavado_estado_check';
    const droppedConstraintNames = Array.from(
      preRpcSql.matchAll(
        /DROP\s+CONSTRAINT(?:\s+IF\s+EXISTS)?\s+([a-z0-9_]+)/gi,
      ),
      (match) => match[1].toLowerCase(),
    );

    expect(firstReservationRpc).toBeGreaterThanOrEqual(0);
    expect(firstStateReference).toBeGreaterThan(firstReservationRpc);
    expect(stateColumn).toBeGreaterThanOrEqual(0);
    expect(stateColumn).toBeLessThan(firstStateReference);
    expect(stateDefault).toBeGreaterThanOrEqual(0);
    expect(stateDefault).toBeLessThan(firstStateReference);
    expect(stateNotNull).toBeGreaterThanOrEqual(0);
    expect(stateNotNull).toBeLessThan(firstStateReference);
    expect(stateConstraint).toBeGreaterThanOrEqual(0);
    expect(stateConstraint).toBeLessThan(firstStateReference);
    expect(preRpcSql).toMatch(
      /ALTER TABLE public\.espacios_lavado\s+ALTER COLUMN estado SET DEFAULT 'disponible'[\s\S]*?ALTER COLUMN estado SET NOT NULL/i,
    );
    expect(preRpcSql).toMatch(
      new RegExp(
        `DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${ownedConstraintName}`,
        'i',
      ),
    );
    expect(droppedConstraintNames).toEqual([ownedConstraintName]);
    expect(preRpcSql).toMatch(
      /ADD CONSTRAINT carwash_espacios_lavado_estado_check[\s\S]*CHECK\s*\(estado\s+IN\s*\('disponible',\s*'reservado',\s*'ocupado',\s*'mantenimiento'\)\)/i,
    );
  });

  it('defines the exact four-state space status constraint without dropping unrelated constraints', () => {
    expect(sql).toMatch(/ALTER TABLE public\.espacios_lavado\s+ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'disponible'/i);
    expect(sql).toMatch(/CHECK\s*\(estado\s+IN\s*\('disponible',\s*'reservado',\s*'ocupado',\s*'mantenimiento'\)\)/i);
    expect(sql).not.toMatch(/DROP CONSTRAINT/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS updated_at timestamptz/i);
  });

  it('broadcasts only id, status, and updated_at through the minimal private SQL API', () => {
    const reservation = readFunction(sql, 'carwash_realtime_broadcast_reservation');
    const space = readFunction(sql, 'carwash_realtime_broadcast_space');

    for (const routine of [reservation, space]) {
      expect(routine).toMatch(/PERFORM\s+realtime\.send\s*\(/i);
      expect(routine).toMatch(/jsonb_build_object\s*\(\s*'id'[\s\S]*'status'[\s\S]*'updated_at'/i);
      expect(routine).toMatch(/'reservation_status'|'space_status'/i);
      expect(routine).toMatch(/true\s*\)/i);
      expect(routine).not.toMatch(/codigo_qr|qr|precio|vehiculo|credentials|row_to_json|to_jsonb\s*\(NEW\)/i);
    }
    expect(reservation).toMatch(/carwash:reservaciones:customer:/i);
    expect(reservation).toMatch(/NEW\.usuario_id::text/i);
    expect(space).toMatch(/carwash:espacios_lavado:autolavado:/i);
    expect(space).toMatch(/NEW\.autolavado_id::text/i);
  });

  it('fires on inserts and status changes, and maintains updated_at for status updates', () => {
    expect(sql).toMatch(/CREATE TRIGGER carwash_reservaciones_realtime_broadcast[\s\S]*AFTER INSERT OR UPDATE OF estado/i);
    expect(sql).toMatch(/CREATE TRIGGER carwash_espacios_lavado_realtime_broadcast[\s\S]*AFTER INSERT OR UPDATE OF estado/i);
    expect(sql).toMatch(/CREATE TRIGGER carwash_reservaciones_realtime_touch[\s\S]*BEFORE UPDATE OF estado/i);
    expect(sql).toMatch(/CREATE TRIGGER carwash_espacios_lavado_realtime_touch[\s\S]*BEFORE UPDATE OF estado/i);
    expect(readFunction(sql, 'carwash_realtime_touch_updated_at')).toMatch(/NEW\.updated_at\s*(?::=|=)\s*pg_catalog\.clock_timestamp\(\)/i);
  });

  it('authorizes exact private topics using the customer sub and a union autolavado claim', () => {
    expect(sql).not.toMatch(/ALTER TABLE\s+realtime\.messages/i);
    for (const policy of ['carwash_realtime_customer_read', 'carwash_realtime_autolavado_read']) {
      expect(sql).toMatch(new RegExp(
        `DROP POLICY IF EXISTS ${policy} ON realtime\\.messages`,
        'i',
      ));
      expect(sql).toMatch(new RegExp(
        `CREATE POLICY ${policy}[\\s\\S]*ON realtime\\.messages[\\s\\S]*FOR SELECT[\\s\\S]*TO authenticated`,
        'i',
      ));
    }
    expect(sql).toMatch(/auth\.jwt\(\)\s*->>\s*'sub'/i);
    expect(sql).toMatch(/auth\.jwt\(\)\s*->\s*'autolavado_ids'/i);
    expect(sql).toMatch(/jsonb_array_elements_text/i);
    expect(sql).not.toMatch(/auth\.jwt\(\)\s*->>\s*'autolavado_id'/i);
    expect(sql).toMatch(/realtime\.topic\(\)[\s\S]*carwash:reservaciones:customer:/i);
    expect(sql).toMatch(/realtime\.topic\(\)[\s\S]*carwash:espacios_lavado:autolavado:/i);
    expect(sql).toMatch(/private\s+IS\s+TRUE/i);
    expect(sql).toMatch(/extension\s*=\s*'broadcast'/i);
    expect(sql).not.toMatch(/DROP POLICY IF EXISTS[^;]*ON public\.reservaciones/i);
    expect(sql).not.toMatch(/REVOKE ALL PRIVILEGES ON TABLE[\s\S]*reservaciones/i);
    expect(sql).not.toMatch(/reservaciones\.(?:espacio_lavado_id|hora)\b/i);
    expect(reservationSql).toMatch(/reservaciones[\s\S]*espacio_id[\s\S]*hora_inicio/i);
  });
});

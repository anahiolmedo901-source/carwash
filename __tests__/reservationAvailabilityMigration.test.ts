import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261009000400_reservation_availability_overlap.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing reservation function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('reservation availability overlap migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('checks availability using the full service interval', () => {
    const availability = readFunction(sql, 'carwash_available_spaces');
    expect(availability).toMatch(/v_hora_fin/);
    expect(availability).toMatch(/reservation\.hora_inicio\s*<\s*v_hora_fin/i);
    expect(availability).toMatch(/reservation\.hora_fin[\s\S]*existing_service\.duracion_minutos/i);
    expect(availability).toMatch(/public\.carwash_validate_reservation_slot/i);
  });

  it('serializes each wash/day before rejecting overlapping active reservations', () => {
    const overlap = readFunction(sql, 'carwash_reservation_overlap_guard');
    expect(overlap).toMatch(/pg_advisory_xact_lock/i);
    expect(overlap).toMatch(/carwash-reservation-day/i);
    expect(overlap).toMatch(/NEW\.hora_inicio\s*<\s*COALESCE/i);
    expect(overlap).toMatch(/NEW\.hora_fin[\s\S]*new_service\.duracion_minutos/i);
    expect(overlap).toMatch(/The selected time or washing space is occupied/i);
  });
});

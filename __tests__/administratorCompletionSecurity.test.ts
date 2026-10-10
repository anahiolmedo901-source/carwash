import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261007000200_administrator_completion.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing administrator completion function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('administrator completion migration contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('creates and locks down the ratings table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.calificaciones/i);
    expect(sql).toMatch(/puntuacion smallint NOT NULL CHECK \(puntuacion BETWEEN 1 AND 5\)/i);
    expect(sql).toMatch(/CONSTRAINT carwash_calificaciones_reservation_unique UNIQUE \(reservacion_id\)/i);
    expect(sql).toMatch(/ALTER TABLE public\.calificaciones ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY carwash_deny_client_access ON public\.calificaciones\s+AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.calificaciones FROM PUBLIC, anon, authenticated/i);
  });

  it('exposes service availability and rating metrics through protected RPCs', () => {
    const dashboard = readFunction(sql, 'carwash_administrator_dashboard');
    const services = readFunction(sql, 'carwash_administrator_list_services');
    const createService = readFunction(sql, 'carwash_administrator_create_service');
    const updateService = readFunction(sql, 'carwash_administrator_update_service');

    expect(dashboard).toMatch(/average_rating numeric/i);
    expect(dashboard).toMatch(/rating_count bigint/i);
    expect(dashboard).toMatch(/avg\(rating\.puntuacion::numeric\)/i);
    expect(services).toMatch(/activo boolean/i);
    expect(services).toMatch(/service\.activo/i);
    expect(createService).toMatch(/p_activo boolean/i);
    expect(createService).toMatch(/activo\)\s+VALUES[\s\S]*p_activo/i);
    expect(updateService).toMatch(/p_activo boolean/i);
    expect(updateService).toMatch(/activo = \$6/i);
  });

  it('enforces service availability at the reservation write boundary', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.carwash_validate_active_reservation_service\(\)/i);
    expect(sql).toMatch(/service\.activo IS TRUE/i);
    expect(sql).toMatch(/The selected service is not available\./i);
    expect(sql).toMatch(/CREATE TRIGGER carwash_reservaciones_active_service_guard\s+BEFORE INSERT OR UPDATE OF servicio_id ON public\.reservaciones/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.carwash_validate_active_reservation_service\(\)/i);
  });

  it('protects rating reads and reservation operations with the administrator helper', () => {
    for (const name of [
      'carwash_administrator_list_ratings',
      'carwash_administrator_update_reservation_status',
    ]) {
      const routine = readFunction(sql, name);
      expect(routine).toMatch(/SECURITY DEFINER/i);
      expect(routine).toMatch(/SET search_path\s*=\s*''/i);
      expect(routine).toContain('public.carwash_current_administrator_id(p_session_token)');
      expect(routine).toMatch(/ERRCODE\s*=\s*'42501'/i);
    }
    const status = readFunction(sql, 'carwash_administrator_update_reservation_status');
    expect(status).toMatch(/The reservation status transition is not allowed/i);
    expect(status).toMatch(/estado = \(\$1\)/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_administrator_list_ratings\(text\)\s+TO anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_administrator_update_reservation_status\(text, text, text\)\s+TO anon, authenticated/i);
  });
});

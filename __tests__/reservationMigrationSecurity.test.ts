import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261004000200_reservations.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing reservation database function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('reservation migration security and atomicity contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('treats active NULL-space reservations as wildcard conflicts', () => {
    const availability = readFunction(sql, 'carwash_available_spaces');
    const create = readFunction(sql, 'carwash_create_reservation');
    const createConflict = create.match(
      /IF EXISTS \(\s*SELECT 1[\s\S]*?FROM public\.reservaciones AS reservation[\s\S]*?AND reservation\.estado::text IN \([\s\S]*?\)[\s\S]*?\)\s*THEN/i,
    )?.[0] ?? '';
    const availableSpaceFilter = availability.match(
      /AND NOT EXISTS \(\s*SELECT 1\s+FROM public\.reservaciones AS reservation[\s\S]*?AND reservation\.estado::text IN \([\s\S]*?\)\s*\)/i,
    )?.[0] ?? '';

    expect(createConflict).toMatch(/v_requested_space_id\s+IS\s+NULL/i);
    expect(createConflict).toMatch(/reservation\.espacio_id\s+IS\s+NULL/i);
    expect(createConflict).toMatch(/reservation\.espacio_id::text\s*=\s*v_requested_space_id/i);
    expect(availableSpaceFilter).toMatch(/reservation\.espacio_id\s+IS\s+NULL/i);
    expect(availableSpaceFilter).toMatch(/reservation\.espacio_id::text\s*=\s*space\.id::text/i);
  });

  it('counts unavailable applicable spaces as capacity and only accepts disponible spaces', () => {
    const availability = readFunction(sql, 'carwash_available_spaces');
    const create = readFunction(sql, 'carwash_create_reservation');
    const availabilityCount = availability.match(
      /SELECT\s+pg_catalog\.count\(\*\)::integer[\s\S]*?FROM public\.espacios_lavado AS space[\s\S]*?;/i,
    )?.[0] ?? '';
    const availableRows = availability.match(
      /RETURN QUERY\s+SELECT true,\s+true,\s+space\.id::text[\s\S]*?GET DIAGNOSTICS/i,
    )?.[0] ?? '';
    const createCount = create.match(
      /SELECT\s+pg_catalog\.count\(\*\)::integer[\s\S]*?FROM public\.espacios_lavado AS space[\s\S]*?;/i,
    )?.[0] ?? '';
    expect(availabilityCount).not.toMatch(/space\.estado/i);
    expect(availabilityCount).toMatch(/space\.activo\s+IS\s+TRUE/i);
    expect(availableRows).toMatch(/space\.estado::text\s*=\s*'disponible'/i);
    expect(createCount).not.toMatch(/space\.estado/i);
    expect(createCount).toMatch(/space\.activo\s+IS\s+TRUE/i);
    expect(create).toMatch(/v_space_status\s+IS DISTINCT FROM\s+'disponible'/i);
    expect(create).toMatch(/IF v_space_count\s*>\s*0 AND v_requested_space_id IS NULL/i);
    expect(create).toMatch(/IF v_space_count\s*=\s*0 AND v_requested_space_id IS NOT NULL/i);
  });

  it('documents the assumed reservation table and generated QR default', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.reservaciones/i);
    expect(sql).toMatch(/usuario_id[\s\S]*vehiculo_id[\s\S]*autolavado_id[\s\S]*servicio_id/i);
    expect(sql).toMatch(/espacio_id[\s\S]*fecha[\s\S]*hora_inicio[\s\S]*hora_fin[\s\S]*estado/i);
    expect(sql).toMatch(/codigo_qr\s+text\s+NULL\s+DEFAULT[^;]*(?:gen_random_bytes|digest)/i);
    expect(sql).toMatch(/ALTER TABLE public\.reservaciones[\s\S]*ALTER COLUMN codigo_qr DROP NOT NULL/i);
    expect(sql).toMatch(/COMMENT ON TABLE public\.reservaciones/i);
    expect(sql).not.toMatch(/(?:space|linked_space)\.servicio_id/i);
    expect(sql).toMatch(/reservation\.espacio_id::text\s+AS\s+espacio_lavado_id/i);
    expect(sql).toMatch(/reservation\.hora_inicio\s+AS\s+hora/i);
  });

  it('exposes only the required security-definer RPCs with an empty search path', () => {
    const names = [
      'carwash_available_spaces',
      'carwash_create_reservation',
      'carwash_list_reservations',
      'carwash_get_reservation',
      'carwash_cancel_reservation',
    ];
    for (const name of names) {
      const routine = readFunction(sql, name);
      expect(routine).toMatch(/SECURITY DEFINER/i);
      expect(routine).toMatch(/SET search_path\s*=\s*''/i);
      expect(routine).toContain('carwash_current_user_id(p_session_token)');
    }
    expect(sql).toMatch(/ALTER TABLE public\.reservaciones ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY carwash_deny_client_access ON public\.reservaciones AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE[^;]*public\.reservaciones[^;]*FROM PUBLIC, anon, authenticated/i);
  });

  it('validates ownership, relationships, exact active states, and atomic conflict locking', () => {
    const availability = readFunction(sql, 'carwash_available_spaces');
    const create = readFunction(sql, 'carwash_create_reservation');
    expect(availability).toMatch(/service\.autolavado_id::text\s*=\s*p_autolavado_id/i);
    expect(create).toMatch(/v_service_autolavado_id\s+IS DISTINCT FROM\s+p_autolavado_id/i);
    expect(availability).not.toMatch(/(?:space|linked_space)\.servicio_id/i);
    expect(create).not.toMatch(/(?:space|linked_space)\.servicio_id/i);
    expect(create).toMatch(/vehicle\.usuario_id::text\s*=\s*v_owner_id/i);
    expect(create).toMatch(/autolavado/i);
    expect(create).toMatch(/servicio/i);
    expect(create).toMatch(/espacio_id/i);
    expect(create).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS carwash_reservaciones_active_slot_idx/i);
    expect(sql).toMatch(/WHERE estado::text IN\s*\('pendiente',\s*'confirmada',\s*'cliente_llego',\s*'en_espera',\s*'en_lavado'\)/i);
    expect(create).toMatch(/pendiente.*confirmada.*cliente_llego.*en_espera.*en_lavado/is);
    expect(create).toMatch(/finalizada|cancelada/is);
    expect(create).toMatch(/fecha/i);
    expect(create).toMatch(/hora/i);

    expect(create).toMatch(/SELECT service\.autolavado_id::text[\s\S]*INTO v_service_autolavado_id[\s\S]*FOR UPDATE/i);
    expect(create).toMatch(/v_service_autolavado_id\s+IS DISTINCT FROM\s+p_autolavado_id/i);
    expect(create).toMatch(/SELECT space\.autolavado_id::text[\s\S]*INTO v_space_autolavado_id[\s\S]*FOR UPDATE/i);
    expect(create).toMatch(/v_space_autolavado_id\s+IS DISTINCT FROM\s+p_autolavado_id/i);
    expect(create).toMatch(/reservation\.codigo_qr::text/i);
    expect(create).not.toMatch(/COALESCE\s*\(\s*reservation\.codigo_qr/i);

    const insert = create.match(/INSERT INTO public\.reservaciones[\s\S]*?;/i)?.[0] ?? '';
    expect(insert).toBeTruthy();
    expect(insert).not.toMatch(/codigo_qr/i);
    expect(create).toMatch(/codigo_qr/i);
  });

  it('keeps nullable QR values unchanged in every customer reservation projection', () => {
    for (const name of ['carwash_create_reservation', 'carwash_list_reservations', 'carwash_get_reservation']) {
      expect(readFunction(sql, name)).toMatch(/reservation\.codigo_qr::text/i);
      expect(readFunction(sql, name)).not.toMatch(/COALESCE\s*\(\s*reservation\.codigo_qr/i);
    }
  });

  it('keeps cancellation server-side, idempotent for cancelled rows, and rejects later states', () => {
    const cancel = readFunction(sql, 'carwash_cancel_reservation');
    expect(cancel).toMatch(/estado\s*=\s*'cancelada'/i);
    expect(cancel).toMatch(/pendiente.*confirmada/is);
    expect(cancel).toMatch(/cliente_llego|en_espera|en_lavado|finalizada/is);
    expect(cancel).toMatch(/UPDATE public\.reservaciones/i);
    expect(cancel).toMatch(/RETURN QUERY/i);
  });

  it('serializes the owned cancellation row and checks that the transition succeeded', () => {
    const cancel = readFunction(sql, 'carwash_cancel_reservation');
    const statusRead = cancel.match(
      /SELECT\s+reservation\.estado::text[\s\S]*?INTO\s+v_current_status[\s\S]*?FROM\s+public\.reservaciones[\s\S]*?WHERE[\s\S]*?reservation\.usuario_id::text\s*=\s*v_owner_id[\s\S]*?;/i,
    )?.[0] ?? '';
    const updateStart = cancel.indexOf('UPDATE public.reservaciones');
    const successReturnStart = cancel.indexOf(
      'RETURN QUERY SELECT * FROM public.carwash_get_reservation',
      updateStart,
    );
    const transition = cancel.slice(
      updateStart,
      successReturnStart < 0 ? undefined : successReturnStart,
    );

    const hasOwnedRowLock = /FOR UPDATE/i.test(statusRead);
    const hasAtomicConditionalUpdate = /UPDATE[\s\S]*?WHERE[\s\S]*?estado::text\s+IN[\s\S]*?RETURNING/i.test(
      transition,
    );
    expect(hasOwnedRowLock || hasAtomicConditionalUpdate).toBe(true);

    const rowCountVariable = transition.match(
      /GET DIAGNOSTICS\s+(\w+)\s*=\s*ROW_COUNT/i,
    )?.[1];
    const checksRowCount = rowCountVariable
      ? new RegExp(
          `IF\\s+${rowCountVariable}\\s*=\\s*0\\s+THEN[\\s\\S]*?RAISE EXCEPTION`,
          'i',
        ).test(transition)
      : false;
    const checksFound = /IF\s+NOT\s+FOUND\s+THEN[\s\S]*?RAISE EXCEPTION/i.test(transition);
    const returningVariable = transition.match(
      /UPDATE[\s\S]*?RETURNING[\s\S]*?INTO\s+(\w+)/i,
    )?.[1];
    const checksReturning = returningVariable
      ? new RegExp(
          `IF\\s+${returningVariable}\\s+IS\\s+NULL[\\s\\S]*?RAISE EXCEPTION`,
          'i',
        ).test(transition)
      : false;
    expect(checksRowCount || checksFound || checksReturning).toBe(true);
  });

  it('grants execution to the client roles but no direct table privileges', () => {
    for (const name of [
      'carwash_available_spaces',
      'carwash_create_reservation',
      'carwash_list_reservations',
      'carwash_get_reservation',
      'carwash_cancel_reservation',
    ]) {
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+ TO anon, authenticated`, 'i'));
    }
  });
});

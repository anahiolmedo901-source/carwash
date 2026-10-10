import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261005000100_payments.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing payment database function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('payment migration security and atomicity contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('formalizes pagos without replacing an existing table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.pagos/i);
    expect(sql).toMatch(/reservacion_id[\s\S]*REFERENCES public\.reservaciones\(id\)/i);
    expect(sql).toMatch(/usuario_id[\s\S]*REFERENCES public\.usuarios\(id\)/i);
    expect(sql).toMatch(/monto\s+numeric\s*\(\s*12\s*,\s*2\s*\)/i);
    expect(sql).toMatch(/fecha_pago\s+timestamptz(?:\s+NULL)?/i);
    expect(sql).toMatch(/carwash_pagos_fecha_pago_check[\s\S]*fecha_pago IS NOT NULL[\s\S]*fecha_pago IS NULL/i);
    expect(sql).toMatch(/created_at\s+timestamptz/i);
    expect(sql).toMatch(/ALTER TABLE public\.pagos[\s\S]*ADD COLUMN IF NOT EXISTS/i);
    expect(sql).not.toMatch(/DROP TABLE public\.pagos/i);
    expect(sql).not.toMatch(/DROP COLUMN[\s\S]*public\.pagos/i);
  });

  it('hardens compatibility columns with honest defaults and nullability checks', () => {
    const compatibilityStart = sql.indexOf('-- Add absent columns');
    const compatibilityEnd = sql.indexOf('$payment_schema$;', compatibilityStart);
    const compatibility = sql.slice(compatibilityStart, compatibilityEnd);

    expect(compatibility).toMatch(/ADD COLUMN IF NOT EXISTS reservacion_id %s NOT NULL/i);
    expect(compatibility).toMatch(/ADD COLUMN IF NOT EXISTS usuario_id %s NOT NULL/i);
    expect(compatibility).toMatch(/ADD COLUMN IF NOT EXISTS monto numeric\(12,2\) NOT NULL/i);
    expect(compatibility).toMatch(/ADD COLUMN IF NOT EXISTS metodo_pago text NOT NULL/i);
    expect(compatibility).toMatch(/ADD COLUMN IF NOT EXISTS estado text[\s,]/i);
    expect(compatibility).toMatch(/ADD COLUMN IF NOT EXISTS created_at timestamptz[\s;)]/i);
    expect(sql).toMatch(/ALTER TABLE public\.pagos[\s\S]*ALTER COLUMN reservacion_id SET NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN usuario_id SET NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN monto SET NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN metodo_pago SET NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN estado SET DEFAULT 'pendiente'/i);
    expect(sql).toMatch(/ALTER COLUMN estado SET NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN created_at SET DEFAULT pg_catalog\.clock_timestamp\(\)/i);
    expect(sql).toMatch(/ALTER COLUMN created_at SET NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN fecha_pago DROP NOT NULL/i);
  });

  it('replaces only app-owned payment constraints and validates legacy rows', () => {
    const appOwnedConstraints = [
      'carwash_pagos_reservacion_fk',
      'carwash_pagos_usuario_fk',
      'carwash_pagos_monto_check',
      'carwash_pagos_metodo_check',
      'carwash_pagos_estado_check',
      'carwash_pagos_fecha_pago_check',
    ];

    for (const name of appOwnedConstraints) {
      expect(sql).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${name}`, 'i'));
    }
    expect(sql).not.toMatch(/\bNOT VALID\b/i);

    const droppedConstraints = [...sql.matchAll(/DROP CONSTRAINT IF EXISTS\s+([a-z0-9_]+)/gi)]
      .map((match) => match[1]);
    expect(droppedConstraints.every((name) => name.startsWith('carwash_pagos_'))).toBe(true);
    expect(sql).toMatch(/ADD CONSTRAINT carwash_pagos_reservacion_fk[\s\S]*FOREIGN KEY/i);
    expect(sql).toMatch(/ADD CONSTRAINT carwash_pagos_usuario_fk[\s\S]*FOREIGN KEY/i);
    expect(sql).toMatch(/ADD CONSTRAINT carwash_pagos_monto_check[\s\S]*CHECK/i);
    expect(sql).toMatch(/ADD CONSTRAINT carwash_pagos_metodo_check[\s\S]*CHECK/i);
    expect(sql).toMatch(/ADD CONSTRAINT carwash_pagos_estado_check[\s\S]*CHECK/i);
    expect(sql).toMatch(/ADD CONSTRAINT carwash_pagos_fecha_pago_check[\s\S]*CHECK/i);
  });

  it('contains exact status, method, and sandbox outcome constraints', () => {
    expect(sql).toMatch(/estado\s+text\s+NOT NULL[\s\S]*'pendiente'[\s\S]*'procesando'[\s\S]*'pagado'[\s\S]*'rechazado'[\s\S]*'cancelado'[\s\S]*'reembolsado'/i);
    expect(sql).toMatch(/metodo_pago\s+text\s+NOT NULL[\s\S]*'tarjeta_credito'[\s\S]*'tarjeta_debito'[\s\S]*'mercado_pago'[\s\S]*'efectivo'[\s\S]*'otro'/i);
    expect(readFunction(sql, 'carwash_process_sandbox_payment')).toMatch(
      /approved[\s\S]*pending[\s\S]*rejected[\s\S]*cancelled[\s\S]*refunded/i,
    );
  });

  it('keeps the begin RPC owner-scoped and derives user and amount from the database', () => {
    const begin = readFunction(sql, 'carwash_begin_payment');

    expect(begin).toContain('carwash_current_user_id(p_session_token)');
    expect(begin).toMatch(/reservation\.usuario_id::text\s*=\s*v_owner_id/i);
    expect(begin).toMatch(/service\.precio/i);
    expect(begin).toMatch(/INSERT INTO public\.pagos/i);
    expect(begin).toMatch(/USING\s+p_reservation_id,\s*v_reservation_owner_id,\s*v_amount/i);
    expect(begin).toMatch(/v_owner_id/);
    expect(begin).not.toMatch(/p_usuario_id|p_monto|p_estado|p_referencia_externa/i);
  });

  it('locks payment and reservation and atomically confirms both for approved outcomes', () => {
    const process = readFunction(sql, 'carwash_process_sandbox_payment');

    expect(process).toContain('carwash_current_user_id(p_session_token)');
    expect(process).toMatch(/SELECT[\s\S]*FROM public\.pagos[\s\S]*FOR UPDATE/i);
    expect(process).toMatch(/SELECT[\s\S]*FROM public\.reservaciones[\s\S]*FOR UPDATE/i);
    expect(process).toMatch(/v_target_status\s*:=\s*'pagado'/i);
    expect(process).toMatch(/UPDATE public\.pagos[\s\S]*SET estado\s*=\s*\(\$1\)/i);
    expect(process).toMatch(/v_paid_at\s*:=\s*pg_catalog\.clock_timestamp/i);
    expect(process).toMatch(/referencia_externa/i);
    expect(process).toMatch(/UPDATE public\.reservaciones[\s\S]*estado\s*=\s*'confirmada'/i);
    expect(process).toMatch(/p_outcome\s*=\s*'approved'/i);
    expect(process).toMatch(/v_current_status\s*=\s*'pagado'/i);
  });

  it('prevents non-approved outcomes from confirming a reservation', () => {
    const process = readFunction(sql, 'carwash_process_sandbox_payment');
    const nonApprovedStart = process.indexOf("IF p_outcome <> 'approved' THEN");
    const nonApprovedEnd = process.indexOf('RETURN QUERY', nonApprovedStart);
    const nonApproved = process.slice(nonApprovedStart, nonApprovedEnd < 0 ? undefined : nonApprovedEnd);

    expect(nonApproved).toBeTruthy();
    expect(nonApproved).not.toMatch(/estado\s*=\s*'confirmada'/i);
    expect(nonApproved).toMatch(/UPDATE public\.pagos/i);
  });

  it('returns owner-scoped payment detail and history with reservation summaries', () => {
    const get = readFunction(sql, 'carwash_get_payment');
    const list = readFunction(sql, 'carwash_list_payments');

    for (const routine of [get, list]) {
      expect(routine).toContain('carwash_current_user_id(p_session_token)');
      expect(routine).toMatch(/reservation\.usuario_id::text\s*=\s*v_owner_id/i);
      expect(routine).toMatch(/wash\.nombre/i);
      expect(routine).toMatch(/service\.nombre/i);
      expect(routine).toMatch(/reservation\.fecha/i);
      expect(routine).toMatch(/reservation\.hora_inicio/i);
      expect(routine).not.toMatch(/reservation\.hora\b/i);
      expect(routine).toMatch(/reservation\.estado/i);
    }
  });

  it('denies direct table access and exposes only explicit security-definer RPCs', () => {
    expect(sql).toMatch(/ALTER TABLE public\.pagos ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY carwash_deny_client_access ON public\.pagos AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.pagos FROM PUBLIC, anon, authenticated/i);

    for (const name of [
      'carwash_begin_payment',
      'carwash_process_sandbox_payment',
      'carwash_get_payment',
      'carwash_list_payments',
    ]) {
      const routine = readFunction(sql, name);
      expect(routine).toMatch(/SECURITY DEFINER/i);
      expect(routine).toMatch(/SET search_path\s*=\s*''/i);
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+ TO anon, authenticated`, 'i'));
    }
  });

  it('never names sensitive payment data in the migration contract', () => {
    expect(sql).not.toMatch(/\b(?:cvv|pan|card_number|cardnumber|expiry|bank_account|bank_details|password|secret)\b/i);
    expect(sql).not.toMatch(/p_(?:usuario_id|monto|estado|referencia_externa)/i);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261006000300_administrator_reads_and_reservation_price_snapshot.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing administrator database function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('administrator reads and reservation price snapshot migration contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('is a forward migration after administrator authentication and backfills before constraints', () => {
    expect(migrationPath).toContain('20261006000300');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS precio_snapshot numeric\(12,2\)/i);
    expect(sql).toMatch(/UPDATE public\.reservaciones[\s\S]*SET precio_snapshot\s*=\s*service\.precio/i);
    expect(sql).toMatch(/ALTER TABLE public\.reservaciones[\s\S]*ADD CONSTRAINT carwash_reservaciones_precio_snapshot_check/i);
    expect(sql).toMatch(/ALTER COLUMN precio_snapshot SET NOT NULL/i);
    expect(sql).toMatch(/precio_snapshot\s*>=\s*0/i);
    expect(sql).toMatch(/precio_snapshot\s*=\s*pg_catalog\.round\(precio_snapshot::numeric, 2\)/i);
  });

  it('protects every administrator read RPC with the opaque administrator helper', () => {
    const names = [
      'carwash_administrator_dashboard',
      'carwash_administrator_list_autolavados',
      'carwash_administrator_list_employees',
      'carwash_administrator_list_reservations',
    ];

    for (const name of names) {
      const routine = readFunction(sql, name);
      expect(routine).toMatch(/SECURITY DEFINER/i);
      expect(routine).toMatch(/SET search_path\s*=\s*''/i);
      expect(routine).toContain('public.carwash_current_administrator_id(p_session_token)');
      expect(routine).not.toMatch(/\bp_(?:rol|role|user_id|usuario_id|autolavado_id|servicio_id|estado|status|precio|monto)\b/i);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(text\\) FROM PUBLIC, anon, authenticated`, 'i'));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(text\\) TO anon, authenticated`, 'i'));
    }
  });

  it('derives empty-safe dashboard metrics from database date and status semantics', () => {
    const dashboard = readFunction(sql, 'carwash_administrator_dashboard');

    expect(dashboard).toMatch(/reservation\.fecha\s*=\s*CURRENT_DATE/i);
    expect(dashboard).toMatch(/reservation\.estado::text\s*<>\s*'cancelada'/i);
    expect(dashboard).toMatch(/payment\.estado::text\s*=\s*'pagado'/i);
    expect(dashboard).toMatch(/payment\.fecha_pago::date\s*=\s*CURRENT_DATE/i);
    expect(dashboard).toMatch(/reservation\.estado::text\s*=\s*'finalizada'/i);
    expect(dashboard).toMatch(/count\(DISTINCT reservation\.vehiculo_id\)/i);
    expect(dashboard).toMatch(/reservation\.estado::text\s*=\s*'en_lavado'/i);
    expect(dashboard).toMatch(/COALESCE\([\s\S]*sum\(payment\.monto::numeric\)[\s\S]*0::numeric/i);
    expect(dashboard).not.toMatch(/p_(?:fecha|status|monto|metric|value)/i);
  });

  it('keeps administrator projections explicit and redacts credential, token, QR, and payment-secret fields', () => {
    const autolavados = readFunction(sql, 'carwash_administrator_list_autolavados');
    const employees = readFunction(sql, 'carwash_administrator_list_employees');
    const reservations = readFunction(sql, 'carwash_administrator_list_reservations');

    expect(autolavados).toMatch(/RETURNS TABLE\s*\([\s\S]*\bid text[\s\S]*\bnombre text/i);
    expect(employees).toMatch(/employee\.nombre[\s\S]*employee\.apellido[\s\S]*employee\.correo[\s\S]*employee\.telefono/i);
    expect(employees).toMatch(/assignment\.id[\s\S]*assignment\.activo/i);
    expect(reservations).toMatch(/vehicle\.placas[\s\S]*customer\.nombre[\s\S]*customer\.correo/i);
    expect(reservations).toMatch(/reservation\.precio_snapshot/i);
    expect(reservations).toMatch(/latest_payment\.estado/i);
    expect(reservations).toMatch(/reservation\.espacio_id::text\s+AS\s+espacio_lavado_id/i);
    expect(reservations).toMatch(/reservation\.hora_inicio\s+AS\s+hora/i);
    expect(reservations).toMatch(/service\.duracion_minutos::numeric\s+AS\s+duracion_aproximada/i);
    expect(sql).not.toMatch(/(?:space|linked_space)\.servicio_id/i);

    for (const routine of [autolavados, employees, reservations]) {
      expect(routine).not.toMatch(/\bpassword_hash\b|\btoken_hash\b|\brevoked_at\b|\bexpires_at\b|\bcodigo_qr\b|\breferencia_externa\b|\b(?:cvv|pan|card_number|secret)\b/i);
      expect(routine).not.toMatch(/RETURNS\s+SETOF\s+public\./i);
    }
  });

  it('captures the service price at creation and uses the snapshot for customer reads and payment start', () => {
    const create = readFunction(sql, 'carwash_create_reservation');
    const list = readFunction(sql, 'carwash_list_reservations');
    const get = readFunction(sql, 'carwash_get_reservation');
    const beginPayment = readFunction(sql, 'carwash_begin_payment');

    expect(create).toMatch(/INSERT INTO public\.reservaciones[\s\S]*precio_snapshot/i);
    expect(create).toMatch(/USING[\s\S]*v_estado, v_price/i);
    expect(create).toMatch(/reservation\.precio_snapshot::numeric/i);
    expect(create).toMatch(/service\.precio::numeric/i);
    expect(list).toMatch(/reservation\.precio_snapshot::numeric/i);
    expect(get).toMatch(/reservation\.precio_snapshot::numeric/i);
    expect(beginPayment).toMatch(/reservation\.precio_snapshot::numeric/i);
    expect(beginPayment).not.toMatch(/service\.precio/i);
    expect(beginPayment).toContain('public.carwash_current_user_id(p_session_token)');
    expect(beginPayment).not.toMatch(/p_(?:monto|precio|estado|usuario_id)/i);
  });

  it('locks and rechecks service and space ownership before reservation insertion', () => {
    const create = readFunction(sql, 'carwash_create_reservation');

    expect(create).toMatch(/SELECT service\.autolavado_id::text,[\s\S]*service\.precio::numeric[\s\S]*INTO v_service_autolavado_id, v_price[\s\S]*FOR UPDATE/i);
    expect(create).toMatch(/v_service_autolavado_id\s+IS DISTINCT FROM\s+p_autolavado_id/i);
    expect(create).toMatch(/SELECT space\.autolavado_id::text,[\s\S]*space\.activo,[\s\S]*space\.estado::text[\s\S]*INTO v_space_autolavado_id, v_space_active, v_space_status[\s\S]*FOR UPDATE/i);
    expect(create).toMatch(/v_space_autolavado_id\s+IS DISTINCT FROM\s+p_autolavado_id/i);
    expect(create.indexOf('FOR UPDATE')).toBeLessThan(create.indexOf('INSERT INTO public.reservaciones'));
  });

  it('keeps catalog access separate from the protected administrator source boundary', () => {
    expect(sql).toMatch(/ALTER TABLE public\.autolavados ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE public\.servicios ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE public\.espacios_lavado ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY carwash_public_catalog_read ON public\.autolavados\s+AS PERMISSIVE FOR SELECT TO anon, authenticated USING \(true\)/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE[\s\S]*public\.autolavados[\s\S]*public\.servicios[\s\S]*public\.espacios_lavado[\s\S]*TO anon, authenticated/i);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE[\s\S]*public\.reservaciones[\s\S]*public\.pagos[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)\b[^;]*ON\s+TABLE\s+public\.(?:autolavados|servicios|espacios_lavado)/i);
    expect(sql).not.toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.(?:usuarios|empleado_autolavados|reservaciones|pagos)\b/i);
  });
});

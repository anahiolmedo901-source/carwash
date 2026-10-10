import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261006000400_administrator_catalog_crud.sql',
);

function readFunction(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) {
    throw new Error(`Missing administrator CRUD function ${name}`);
  }
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('administrator service and washing-space CRUD migration contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  const serviceFunctions = [
    'carwash_administrator_list_services',
    'carwash_administrator_create_service',
    'carwash_administrator_update_service',
    'carwash_administrator_delete_service',
  ];
  const spaceFunctions = [
    'carwash_administrator_list_washing_spaces',
    'carwash_administrator_create_washing_space',
    'carwash_administrator_update_washing_space',
    'carwash_administrator_delete_washing_space',
  ];

  it('protects every CRUD RPC with the existing opaque administrator helper', () => {
    for (const name of [...serviceFunctions, ...spaceFunctions]) {
      const routine = readFunction(sql, name);
      expect(routine).toMatch(/SECURITY DEFINER/i);
      expect(routine).toMatch(/SET search_path\s*=\s*''/i);
      expect(routine).toContain('public.carwash_current_administrator_id(p_session_token)');
      expect(routine).toMatch(/ERRCODE\s*=\s*'42501'/i);
      expect(routine).not.toMatch(/\bp_(?:rol|role|user_id|usuario_id)\b/i);
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+ FROM PUBLIC, anon, authenticated`,
        'i',
      ));
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+ TO anon, authenticated`,
        'i',
      ));
    }
  });

  it('returns only explicit service and washing-space catalog columns', () => {
    const listServices = readFunction(sql, 'carwash_administrator_list_services');
    const listSpaces = readFunction(sql, 'carwash_administrator_list_washing_spaces');

    expect(listServices).toMatch(
      /RETURNS TABLE\s*\([\s\S]*\bid text[\s\S]*\bautolavado_id text[\s\S]*\bnombre text[\s\S]*\bdescripcion text[\s\S]*\bprecio numeric[\s\S]*\bduracion_aproximada numeric/i,
    );
    expect(listServices).toMatch(/service\.duracion_minutos::numeric\s+AS\s+duracion_aproximada/i);
    expect(listSpaces).toMatch(
      /RETURNS TABLE\s*\([\s\S]*\bid text[\s\S]*\bautolavado_id text[\s\S]*\bnombre text[\s\S]*\bestado text[\s\S]*\bactivo boolean/i,
    );
    for (const routine of [listServices, listSpaces]) {
      expect(routine).not.toMatch(/\b(?:password_hash|token_hash|codigo_qr|referencia_externa|secret|cvv|pan)\b/i);
      expect(routine).not.toMatch(/RETURNS\s+SETOF\s+public\./i);
    }
  });

  it('validates relationships, monetary precision, duration, and existing status values', () => {
    const createService = readFunction(sql, 'carwash_administrator_create_service');
    const updateService = readFunction(sql, 'carwash_administrator_update_service');
    const createSpace = readFunction(sql, 'carwash_administrator_create_washing_space');
    const updateSpace = readFunction(sql, 'carwash_administrator_update_washing_space');

    for (const routine of [createService, updateService]) {
      expect(routine).toMatch(/pg_catalog\.btrim\(p_(?:autolavado_id|nombre|descripcion)/i);
      expect(routine).toMatch(/p_precio\s*>\s*9999999999\.99/i);
      expect(routine).toMatch(/p_precio\s*<>\s*pg_catalog\.round\(p_precio::numeric, 2\)/i);
      expect(routine).toMatch(/p_duracion_aproximada\s*<=\s*0/i);
      expect(routine).toMatch(/FROM public\.autolavados/i);
    }
    for (const routine of [createSpace, updateSpace]) {
      expect(routine).toMatch(/v_estado\s+NOT IN\s*\('disponible',\s*'reservado',\s*'ocupado',\s*'mantenimiento'\)/i);
      expect(routine).toMatch(/FROM public\.autolavados/i);
      expect(routine).toMatch(/p_nombre|v_nombre/i);
      expect(routine).toMatch(/p_activo/i);
    }
    expect(createSpace).not.toMatch(/public\.servicios|servicio_id/i);
    expect(updateSpace).not.toMatch(/public\.servicios|servicio_id/i);
  });

  it('rejects referenced service and washing-space deletes with stable conflicts', () => {
    const deleteService = readFunction(sql, 'carwash_administrator_delete_service');
    const deleteSpace = readFunction(sql, 'carwash_administrator_delete_washing_space');

    expect(deleteService).toMatch(/FROM public\.reservaciones[\s\S]*reservation\.servicio_id::text/i);
    expect(deleteService).not.toMatch(/space\.servicio_id|espacio_lavado.*servicio_id/i);
    expect(deleteService).toMatch(/ERRCODE\s*=\s*'23503'/i);
    expect(deleteSpace).toMatch(/FROM public\.reservaciones[\s\S]*reservation\.espacio_id::text/i);
    expect(deleteSpace).toMatch(/foreign_key_violation/i);
    expect(deleteSpace).toMatch(/operational records/i);
    expect(deleteSpace).toMatch(/ERRCODE\s*=\s*'23503'/i);
  });

  it('rejects cross-car-wash relinking only when existing history references the record', () => {
    const updateService = readFunction(sql, 'carwash_administrator_update_service');
    const updateSpace = readFunction(sql, 'carwash_administrator_update_washing_space');

    expect(updateService).toMatch(/SELECT service\.autolavado_id::text[\s\S]*FOR UPDATE/i);
    expect(updateService).toMatch(/v_current_autolavado_id\s+IS DISTINCT FROM\s+v_autolavado_id/i);
    expect(updateService.indexOf('FOR UPDATE')).toBeLessThan(updateService.indexOf('v_current_autolavado_id IS DISTINCT FROM'));
    expect(updateService.indexOf('FOR UPDATE')).toBeLessThan(updateService.indexOf('UPDATE public.servicios'));
    expect(updateService).toMatch(/reservation\.servicio_id::text\s*=\s*v_servicio_id/i);
    expect(updateService).not.toMatch(/space\.servicio_id/i);
    expect(updateService).toMatch(/The service relationship cannot change[\s\S]*ERRCODE\s*=\s*'23503'/i);
    expect(updateService).toMatch(/SET autolavado_id[\s\S]*nombre = \$2[\s\S]*precio = \$4[\s\S]*duracion_minutos = \$5/i);

    expect(updateSpace).toMatch(/SELECT space\.autolavado_id::text[\s\S]*FOR UPDATE/i);
    expect(updateSpace).toMatch(/v_current_autolavado_id\s+IS DISTINCT FROM\s+v_autolavado_id/i);
    expect(updateSpace.indexOf('FOR UPDATE')).toBeLessThan(updateSpace.indexOf('v_current_autolavado_id IS DISTINCT FROM'));
    expect(updateSpace.indexOf('FOR UPDATE')).toBeLessThan(updateSpace.indexOf('UPDATE public.espacios_lavado'));
    expect(updateSpace).not.toMatch(/v_current_servicio_id|v_servicio_id|space\.servicio_id/i);
    expect(updateSpace).toMatch(/reservation\.espacio_id::text\s*=\s*v_espacio_id/i);
    expect(updateSpace).toMatch(/foreign_key\.confrelid\s*=\s*'public\.espacios_lavado'::pg_catalog\.regclass/i);
    expect(updateSpace).toMatch(/The washing space relationship cannot change[\s\S]*ERRCODE\s*=\s*'23503'/i);
    expect(updateSpace).toMatch(/SET autolavado_id[\s\S]*nombre = \$2[\s\S]*estado = \(\$3\)[\s\S]*activo = \$4/i);
  });

  it('keeps catalog reads public and mutations behind RPCs without direct table writes', () => {
    for (const table of ['servicios', 'espacios_lavado']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
      expect(sql).toMatch(new RegExp(
        `CREATE POLICY carwash_public_catalog_read ON public\\.${table}\\s+AS PERMISSIVE FOR SELECT TO anon, authenticated USING \\(true\\)`,
        'i',
      ));
    }
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE[\s\S]*public\.servicios[\s\S]*public\.espacios_lavado[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE[\s\S]*public\.servicios[\s\S]*public\.espacios_lavado[\s\S]*TO anon, authenticated/i);
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)\b[^;]*ON\s+TABLE\s+public\.(?:servicios|espacios_lavado)/i);
  });
});

/*
  Administrator service and washing-space CRUD boundary.

  Customer catalog reads remain SELECT-only. Every administrative operation
  derives identity from the opaque session through the existing administrator
  helper and returns only the columns required by the management service.
 */

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.espacios_lavado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carwash_public_catalog_read ON public.servicios;
CREATE POLICY carwash_public_catalog_read ON public.servicios
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS carwash_public_catalog_read ON public.espacios_lavado;
CREATE POLICY carwash_public_catalog_read ON public.espacios_lavado
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL PRIVILEGES ON TABLE
  public.servicios,
  public.espacios_lavado
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.servicios,
  public.espacios_lavado
TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.carwash_administrator_list_services(p_session_token text)
RETURNS TABLE (
  id text,
  autolavado_id text,
  nombre text,
  descripcion text,
  precio numeric,
  duracion_aproximada numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_administrator_id text;
BEGIN
  v_administrator_id := public.carwash_current_administrator_id(p_session_token);
  IF v_administrator_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired administrator session.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT service.id::text,
    service.autolavado_id::text,
    service.nombre::text,
    service.descripcion::text,
    service.precio::numeric,
    service.duracion_minutos::numeric AS duracion_aproximada
  FROM public.servicios AS service
  JOIN public.autolavados AS wash
    ON wash.id::text = service.autolavado_id::text
  ORDER BY wash.nombre::text, service.nombre::text, service.id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_list_washing_spaces(p_session_token text)
RETURNS TABLE (
  id text,
  autolavado_id text,
  nombre text,
  estado text,
  activo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_administrator_id text;
BEGIN
  v_administrator_id := public.carwash_current_administrator_id(p_session_token);
  IF v_administrator_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired administrator session.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT space.id::text,
    space.autolavado_id::text,
    space.nombre::text,
    space.estado::text,
    space.activo
  FROM public.espacios_lavado AS space
  JOIN public.autolavados AS wash
    ON wash.id::text = space.autolavado_id::text
  ORDER BY wash.nombre::text, space.id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_create_service(
  p_session_token text,
  p_autolavado_id text,
  p_nombre text,
  p_descripcion text,
  p_precio numeric,
  p_duracion_aproximada numeric
)
RETURNS TABLE (
  id text,
  autolavado_id text,
  nombre text,
  descripcion text,
  precio numeric,
  duracion_aproximada numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_administrator_id text;
  v_autolavado_id text;
  v_nombre text;
  v_descripcion text;
  v_autolavado_id_type text;
BEGIN
  v_administrator_id := public.carwash_current_administrator_id(p_session_token);
  IF v_administrator_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired administrator session.' USING ERRCODE = '42501';
  END IF;

  v_autolavado_id := NULLIF(pg_catalog.btrim(p_autolavado_id), '');
  v_nombre := NULLIF(pg_catalog.btrim(p_nombre), '');
  v_descripcion := NULLIF(pg_catalog.btrim(p_descripcion), '');
  IF v_autolavado_id IS NULL
    OR v_nombre IS NULL
    OR v_descripcion IS NULL
    OR p_precio IS NULL
    OR p_precio = 'NaN'::numeric
    OR p_precio < 0
    OR p_precio > 9999999999.99
    OR p_precio <> pg_catalog.round(p_precio::numeric, 2)
    OR p_duracion_aproximada IS NULL
    OR p_duracion_aproximada = 'NaN'::numeric
    OR p_duracion_aproximada <= 0
    OR p_duracion_aproximada <> pg_catalog.trunc(p_duracion_aproximada) THEN
    RAISE EXCEPTION 'Invalid service details.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.autolavados AS wash
    WHERE wash.id::text = v_autolavado_id
  ) THEN
    RAISE EXCEPTION 'The selected car wash does not exist.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_autolavado_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.servicios'::pg_catalog.regclass
    AND column_metadata.attname = 'autolavado_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_autolavado_id_type IS NULL THEN
    RAISE EXCEPTION 'The service relationship is unavailable.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format(
    'INSERT INTO public.servicios
      (autolavado_id, nombre, descripcion, precio, duracion_minutos, activo)
     VALUES (($1)::%1$s, $2, $3, $4, $5, true)
     RETURNING id::text, autolavado_id::text, nombre::text, descripcion::text,
        precio::numeric, duracion_minutos::numeric',
     v_autolavado_id_type
   ) USING v_autolavado_id, v_nombre, v_descripcion, p_precio, p_duracion_aproximada;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_update_service(
  p_session_token text,
  p_servicio_id text,
  p_autolavado_id text,
  p_nombre text,
  p_descripcion text,
  p_precio numeric,
  p_duracion_aproximada numeric
)
RETURNS TABLE (
  id text,
  autolavado_id text,
  nombre text,
  descripcion text,
  precio numeric,
  duracion_aproximada numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_administrator_id text;
  v_servicio_id text;
  v_autolavado_id text;
  v_nombre text;
  v_descripcion text;
  v_autolavado_id_type text;
  v_current_autolavado_id text;
  v_updated_count integer;
BEGIN
  v_administrator_id := public.carwash_current_administrator_id(p_session_token);
  IF v_administrator_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired administrator session.' USING ERRCODE = '42501';
  END IF;

  v_servicio_id := NULLIF(pg_catalog.btrim(p_servicio_id), '');
  v_autolavado_id := NULLIF(pg_catalog.btrim(p_autolavado_id), '');
  v_nombre := NULLIF(pg_catalog.btrim(p_nombre), '');
  v_descripcion := NULLIF(pg_catalog.btrim(p_descripcion), '');
  IF v_servicio_id IS NULL
    OR v_autolavado_id IS NULL
    OR v_nombre IS NULL
    OR v_descripcion IS NULL
    OR p_precio IS NULL
    OR p_precio = 'NaN'::numeric
    OR p_precio < 0
    OR p_precio > 9999999999.99
    OR p_precio <> pg_catalog.round(p_precio::numeric, 2)
    OR p_duracion_aproximada IS NULL
    OR p_duracion_aproximada = 'NaN'::numeric
    OR p_duracion_aproximada <= 0
    OR p_duracion_aproximada <> pg_catalog.trunc(p_duracion_aproximada) THEN
    RAISE EXCEPTION 'Invalid service details.' USING ERRCODE = '22023';
  END IF;

  SELECT service.autolavado_id::text
  INTO v_current_autolavado_id
  FROM public.servicios AS service
  WHERE service.id::text = v_servicio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected service does not exist.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.autolavados AS wash
    WHERE wash.id::text = v_autolavado_id
  ) THEN
    RAISE EXCEPTION 'The selected car wash does not exist.' USING ERRCODE = '22023';
  END IF;

  -- SQLSTATE 23503 is the stable relationship-conflict contract. A service
  -- may still change name, description, price, or duration at its current
  -- car wash, but a referenced service cannot be moved across car washes.
  IF v_current_autolavado_id IS DISTINCT FROM v_autolavado_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.reservaciones AS reservation
        WHERE reservation.servicio_id::text = v_servicio_id
      )
    ) THEN
    RAISE EXCEPTION 'The service relationship cannot change while the service is referenced by existing reservations.' USING ERRCODE = '23503';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_autolavado_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.servicios'::pg_catalog.regclass
    AND column_metadata.attname = 'autolavado_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_autolavado_id_type IS NULL THEN
    RAISE EXCEPTION 'The service relationship is unavailable.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format(
    'UPDATE public.servicios AS service
     SET autolavado_id = ($1)::%1$s,
       nombre = $2,
       descripcion = $3,
       precio = $4,
        duracion_minutos = $5
     WHERE service.id::text = $6
     RETURNING service.id::text, service.autolavado_id::text, service.nombre::text,
        service.descripcion::text, service.precio::numeric,
        service.duracion_minutos::numeric',
    v_autolavado_id_type
  ) USING v_autolavado_id, v_nombre, v_descripcion, p_precio,
    p_duracion_aproximada, v_servicio_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'The selected service does not exist.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_delete_service(
  p_session_token text,
  p_servicio_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_administrator_id text;
  v_servicio_id text;
  v_deleted_count integer;
  v_reference record;
  v_has_reference boolean;
BEGIN
  v_administrator_id := public.carwash_current_administrator_id(p_session_token);
  IF v_administrator_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired administrator session.' USING ERRCODE = '42501';
  END IF;

  v_servicio_id := NULLIF(pg_catalog.btrim(p_servicio_id), '');
  IF v_servicio_id IS NULL THEN
    RAISE EXCEPTION 'A service id is required.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.servicios AS service
    WHERE service.id::text = v_servicio_id
  ) THEN
    RAISE EXCEPTION 'The selected service does not exist.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.reservaciones AS reservation
    WHERE reservation.servicio_id::text = v_servicio_id
   ) THEN
    RAISE EXCEPTION 'The service is referenced by existing reservations.' USING ERRCODE = '23503';
  END IF;

  -- Check every single-column application foreign key before deleting. This
  -- also rejects operational references configured with a cascading action.
  FOR v_reference IN
    SELECT schema_metadata.nspname AS schema_name,
      relation_metadata.relname AS table_name,
      column_metadata.attname AS column_name
    FROM pg_catalog.pg_constraint AS foreign_key
    JOIN pg_catalog.pg_class AS relation_metadata
      ON relation_metadata.oid = foreign_key.conrelid
    JOIN pg_catalog.pg_namespace AS schema_metadata
      ON schema_metadata.oid = relation_metadata.relnamespace
    JOIN pg_catalog.unnest(foreign_key.conkey) WITH ORDINALITY AS key_columns(attnum, key_position)
      ON true
    JOIN pg_catalog.pg_attribute AS column_metadata
      ON column_metadata.attrelid = foreign_key.conrelid
      AND column_metadata.attnum = key_columns.attnum
    WHERE foreign_key.contype = 'f'
      AND foreign_key.confrelid = 'public.servicios'::pg_catalog.regclass
      AND schema_metadata.nspname = 'public'
      AND pg_catalog.array_length(foreign_key.conkey, 1) = 1
  LOOP
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I AS referencing_row WHERE referencing_row.%I::text = $1)',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.column_name
    ) INTO v_has_reference USING v_servicio_id;
    IF v_has_reference THEN
      RAISE EXCEPTION 'The service is referenced by existing records.' USING ERRCODE = '23503';
    END IF;
  END LOOP;

  BEGIN
    DELETE FROM public.servicios AS service
    WHERE service.id::text = v_servicio_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'The service is referenced by existing records.' USING ERRCODE = '23503';
  END;

  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'The selected service does not exist.' USING ERRCODE = '22023';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_create_washing_space(
  p_session_token text,
  p_autolavado_id text,
  p_nombre text,
  p_estado text,
  p_activo boolean
)
RETURNS TABLE (
  id text,
  autolavado_id text,
  nombre text,
  estado text,
  activo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_administrator_id text;
  v_autolavado_id text;
  v_nombre text;
  v_estado text;
  v_autolavado_id_type text;
  v_estado_type text;
BEGIN
  v_administrator_id := public.carwash_current_administrator_id(p_session_token);
  IF v_administrator_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired administrator session.' USING ERRCODE = '42501';
  END IF;

  v_autolavado_id := NULLIF(pg_catalog.btrim(p_autolavado_id), '');
  v_nombre := NULLIF(pg_catalog.btrim(p_nombre), '');
  v_estado := NULLIF(pg_catalog.btrim(p_estado), '');
  IF v_autolavado_id IS NULL
    OR v_nombre IS NULL
    OR v_estado IS NULL
    OR p_activo IS NULL
    OR v_estado NOT IN ('disponible', 'reservado', 'ocupado', 'mantenimiento') THEN
    RAISE EXCEPTION 'Invalid washing space details.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.autolavados AS wash
    WHERE wash.id::text = v_autolavado_id
  ) THEN
    RAISE EXCEPTION 'The selected car wash does not exist.' USING ERRCODE = '22023';
  END IF;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_autolavado_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.espacios_lavado'::pg_catalog.regclass
    AND column_metadata.attname = 'autolavado_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_estado_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.espacios_lavado'::pg_catalog.regclass
    AND column_metadata.attname = 'estado'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_autolavado_id_type IS NULL OR v_estado_type IS NULL THEN
    RAISE EXCEPTION 'The washing space relationship is unavailable.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format(
    'INSERT INTO public.espacios_lavado (autolavado_id, nombre, estado, activo)
     VALUES (($1)::%1$s, $2, ($3)::%2$s, $4)
     RETURNING id::text, autolavado_id::text, nombre::text, estado::text, activo',
    v_autolavado_id_type,
    v_estado_type
  ) USING v_autolavado_id, v_nombre, v_estado, p_activo;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_update_washing_space(
  p_session_token text,
  p_espacio_id text,
  p_autolavado_id text,
  p_nombre text,
  p_estado text,
  p_activo boolean
)
RETURNS TABLE (
  id text,
  autolavado_id text,
  nombre text,
  estado text,
  activo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_administrator_id text;
  v_espacio_id text;
  v_autolavado_id text;
  v_nombre text;
  v_estado text;
  v_autolavado_id_type text;
  v_estado_type text;
  v_current_autolavado_id text;
  v_relationship_changed boolean;
  v_reference record;
  v_has_reference boolean;
  v_updated_count integer;
BEGIN
  v_administrator_id := public.carwash_current_administrator_id(p_session_token);
  IF v_administrator_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired administrator session.' USING ERRCODE = '42501';
  END IF;

  v_espacio_id := NULLIF(pg_catalog.btrim(p_espacio_id), '');
  v_autolavado_id := NULLIF(pg_catalog.btrim(p_autolavado_id), '');
  v_nombre := NULLIF(pg_catalog.btrim(p_nombre), '');
  v_estado := NULLIF(pg_catalog.btrim(p_estado), '');
  IF v_espacio_id IS NULL
    OR v_autolavado_id IS NULL
    OR v_nombre IS NULL
    OR v_estado IS NULL
    OR p_activo IS NULL
    OR v_estado NOT IN ('disponible', 'reservado', 'ocupado', 'mantenimiento') THEN
    RAISE EXCEPTION 'Invalid washing space details.' USING ERRCODE = '22023';
  END IF;

  SELECT space.autolavado_id::text
  INTO v_current_autolavado_id
  FROM public.espacios_lavado AS space
  WHERE space.id::text = v_espacio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected washing space does not exist.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.autolavados AS wash
    WHERE wash.id::text = v_autolavado_id
  ) THEN
    RAISE EXCEPTION 'The selected car wash does not exist.' USING ERRCODE = '22023';
  END IF;
  v_relationship_changed := v_current_autolavado_id IS DISTINCT FROM v_autolavado_id;
  -- SQLSTATE 23503 is the stable relationship-conflict contract. A referenced
  -- space may still change name, status, or active state, but its car-wash
  -- relationship is fixed.
  IF v_relationship_changed AND EXISTS (
    SELECT 1
    FROM public.reservaciones AS reservation
     WHERE reservation.espacio_id::text = v_espacio_id
  ) THEN
    RAISE EXCEPTION 'The washing space relationship cannot change while the space is referenced by existing reservations or operational records.' USING ERRCODE = '23503';
  END IF;

  IF v_relationship_changed THEN
    -- Check every single-column application foreign key so an operational
    -- reference cannot be silently moved or cleared by this update.
    FOR v_reference IN
      SELECT schema_metadata.nspname AS schema_name,
        relation_metadata.relname AS table_name,
        column_metadata.attname AS column_name
      FROM pg_catalog.pg_constraint AS foreign_key
      JOIN pg_catalog.pg_class AS relation_metadata
        ON relation_metadata.oid = foreign_key.conrelid
      JOIN pg_catalog.pg_namespace AS schema_metadata
        ON schema_metadata.oid = relation_metadata.relnamespace
      JOIN pg_catalog.unnest(foreign_key.conkey) WITH ORDINALITY AS key_columns(attnum, key_position)
        ON true
      JOIN pg_catalog.pg_attribute AS column_metadata
        ON column_metadata.attrelid = foreign_key.conrelid
        AND column_metadata.attnum = key_columns.attnum
      WHERE foreign_key.contype = 'f'
        AND foreign_key.confrelid = 'public.espacios_lavado'::pg_catalog.regclass
        AND schema_metadata.nspname = 'public'
        AND pg_catalog.array_length(foreign_key.conkey, 1) = 1
    LOOP
      EXECUTE pg_catalog.format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I AS referencing_row WHERE referencing_row.%I::text = $1)',
        v_reference.schema_name,
        v_reference.table_name,
        v_reference.column_name
      ) INTO v_has_reference USING v_espacio_id;
      IF v_has_reference THEN
        RAISE EXCEPTION 'The washing space relationship cannot change while the space is referenced by existing reservations or operational records.' USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_autolavado_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.espacios_lavado'::pg_catalog.regclass
    AND column_metadata.attname = 'autolavado_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_estado_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.espacios_lavado'::pg_catalog.regclass
    AND column_metadata.attname = 'estado'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_autolavado_id_type IS NULL OR v_estado_type IS NULL THEN
    RAISE EXCEPTION 'The washing space relationship is unavailable.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format(
    'UPDATE public.espacios_lavado AS space
     SET autolavado_id = ($1)::%1$s,
       nombre = $2,
       estado = ($3)::%2$s,
       activo = $4
     WHERE space.id::text = $5
     RETURNING space.id::text, space.autolavado_id::text, space.nombre::text,
       space.estado::text, space.activo',
    v_autolavado_id_type,
    v_estado_type
  ) USING v_autolavado_id, v_nombre, v_estado, p_activo, v_espacio_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'The selected washing space does not exist.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_delete_washing_space(
  p_session_token text,
  p_espacio_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_administrator_id text;
  v_espacio_id text;
  v_deleted_count integer;
  v_reference record;
  v_has_reference boolean;
BEGIN
  v_administrator_id := public.carwash_current_administrator_id(p_session_token);
  IF v_administrator_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired administrator session.' USING ERRCODE = '42501';
  END IF;

  v_espacio_id := NULLIF(pg_catalog.btrim(p_espacio_id), '');
  IF v_espacio_id IS NULL THEN
    RAISE EXCEPTION 'A washing space id is required.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.espacios_lavado AS space
    WHERE space.id::text = v_espacio_id
  ) THEN
    RAISE EXCEPTION 'The selected washing space does not exist.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.reservaciones AS reservation
    WHERE reservation.espacio_id::text = v_espacio_id
  ) THEN
    RAISE EXCEPTION 'The washing space is referenced by existing reservations or operational records.' USING ERRCODE = '23503';
  END IF;

  -- Check every single-column application foreign key before deleting. This
  -- rejects operational references even when their foreign key would cascade.
  FOR v_reference IN
    SELECT schema_metadata.nspname AS schema_name,
      relation_metadata.relname AS table_name,
      column_metadata.attname AS column_name
    FROM pg_catalog.pg_constraint AS foreign_key
    JOIN pg_catalog.pg_class AS relation_metadata
      ON relation_metadata.oid = foreign_key.conrelid
    JOIN pg_catalog.pg_namespace AS schema_metadata
      ON schema_metadata.oid = relation_metadata.relnamespace
    JOIN pg_catalog.unnest(foreign_key.conkey) WITH ORDINALITY AS key_columns(attnum, key_position)
      ON true
    JOIN pg_catalog.pg_attribute AS column_metadata
      ON column_metadata.attrelid = foreign_key.conrelid
      AND column_metadata.attnum = key_columns.attnum
    WHERE foreign_key.contype = 'f'
      AND foreign_key.confrelid = 'public.espacios_lavado'::pg_catalog.regclass
      AND schema_metadata.nspname = 'public'
      AND pg_catalog.array_length(foreign_key.conkey, 1) = 1
  LOOP
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I AS referencing_row WHERE referencing_row.%I::text = $1)',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.column_name
    ) INTO v_has_reference USING v_espacio_id;
    IF v_has_reference THEN
      RAISE EXCEPTION 'The washing space is referenced by existing reservations or operational records.' USING ERRCODE = '23503';
    END IF;
  END LOOP;

  BEGIN
    DELETE FROM public.espacios_lavado AS space
    WHERE space.id::text = v_espacio_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- Any operational table with a foreign key to this space is history and
      -- must block the delete instead of being removed by a cascade.
      RAISE EXCEPTION 'The washing space is referenced by existing reservations or operational records.' USING ERRCODE = '23503';
  END;

  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'The selected washing space does not exist.' USING ERRCODE = '22023';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_administrator_list_services(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_list_washing_spaces(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_create_service(text, text, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_update_service(text, text, text, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_delete_service(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_create_washing_space(text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_update_washing_space(text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_delete_washing_space(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_administrator_list_services(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_list_washing_spaces(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_create_service(text, text, text, text, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_update_service(text, text, text, text, text, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_delete_service(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_create_washing_space(text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_update_washing_space(text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_delete_washing_space(text, text) TO anon, authenticated;

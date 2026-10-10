/*
  Reservation schema contract

  This migration assumes that the existing database provides:
  - public.usuarios(id)
  - public.vehiculos(id, usuario_id, marca, modelo, placas)
  - public.autolavados(id, nombre)
  - public.servicios(id, autolavado_id, nombre, precio, duracion_minutos)
  - public.espacios_lavado(id, autolavado_id, nombre, estado, activo)
  - public.reservaciones(..., espacio_id, fecha, hora_inicio, hora_fin, ...)

  Reservation foreign-key column types are discovered from those existing tables
  before the new table is created. The app is intentionally limited to the RPC
  projection below and never receives a client-authoritative usuario_id input.
*/

DO $reservation_schema$
DECLARE
  v_usuario_id_type text;
  v_vehiculo_id_type text;
  v_autolavado_id_type text;
  v_servicio_id_type text;
  v_espacio_id_type text;
BEGIN
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_usuario_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.usuarios'::pg_catalog.regclass
    AND column_metadata.attname = 'id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_vehiculo_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.vehiculos'::pg_catalog.regclass
    AND column_metadata.attname = 'id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_autolavado_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.autolavados'::pg_catalog.regclass
    AND column_metadata.attname = 'id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_servicio_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.servicios'::pg_catalog.regclass
    AND column_metadata.attname = 'id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_espacio_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.espacios_lavado'::pg_catalog.regclass
    AND column_metadata.attname = 'id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_usuario_id_type IS NULL
    OR v_vehiculo_id_type IS NULL
    OR v_autolavado_id_type IS NULL
    OR v_servicio_id_type IS NULL
    OR v_espacio_id_type IS NULL THEN
    RAISE EXCEPTION 'Reservation relationships require conventional id columns on the existing tables.';
  END IF;

  EXECUTE pg_catalog.format($sql$
    CREATE TABLE IF NOT EXISTS public.reservaciones (
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      usuario_id %s NOT NULL REFERENCES public.usuarios(id),
      vehiculo_id %s NOT NULL REFERENCES public.vehiculos(id),
      autolavado_id %s NOT NULL REFERENCES public.autolavados(id),
      servicio_id %s NOT NULL REFERENCES public.servicios(id),
       espacio_id %s REFERENCES public.espacios_lavado(id),
       fecha date NOT NULL,
       hora_inicio time without time zone NOT NULL,
       hora_fin time without time zone,
       estado varchar NOT NULL DEFAULT 'pendiente' CHECK (
        estado IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado', 'finalizada', 'cancelada')
       ),
       codigo_qr text NULL DEFAULT pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
       notas text,
      created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
    )
  $sql$, v_usuario_id_type, v_vehiculo_id_type, v_autolavado_id_type, v_servicio_id_type, v_espacio_id_type);
END;
$reservation_schema$;

-- The authoritative reservation RPCs reference the space state. Establish and
-- repair the complete column contract before those functions are defined.
ALTER TABLE public.espacios_lavado
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'disponible';

ALTER TABLE public.espacios_lavado
  ALTER COLUMN estado SET DEFAULT 'disponible',
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.reservaciones
  ALTER COLUMN codigo_qr DROP NOT NULL,
  ALTER COLUMN codigo_qr SET DEFAULT pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');

DO $space_status_constraint$
BEGIN
  -- Replace only the application-owned constraint. NULL or unsupported
  -- existing values make SET NOT NULL or ADD CONSTRAINT fail for operator cleanup.
  ALTER TABLE public.espacios_lavado
    DROP CONSTRAINT IF EXISTS carwash_espacios_lavado_estado_check;
  ALTER TABLE public.espacios_lavado
    ADD CONSTRAINT carwash_espacios_lavado_estado_check
    CHECK (estado IN ('disponible', 'reservado', 'ocupado', 'mantenimiento'));
END;
$space_status_constraint$;

COMMENT ON TABLE public.reservaciones IS
  'Reservation contract: owned vehicle, car wash, service, optional applicable space_id, local fecha/hora_inicio, exact status, and nullable codigo_qr with a database default for new rows.';

CREATE UNIQUE INDEX IF NOT EXISTS carwash_reservaciones_active_slot_idx
  ON public.reservaciones (
    (autolavado_id::text),
     (COALESCE(espacio_id::text, '__autolavado__')),
     fecha,
     hora_inicio
  )
  WHERE estado::text IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado');

ALTER TABLE public.reservaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carwash_deny_client_access ON public.reservaciones;
CREATE POLICY carwash_deny_client_access ON public.reservaciones AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL PRIVILEGES ON TABLE public.reservaciones FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.carwash_available_spaces(
  p_session_token text,
  p_autolavado_id text,
  p_servicio_id text,
  p_fecha text,
  p_hora text
)
RETURNS TABLE (
  has_spaces boolean,
  available boolean,
  espacio_lavado_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_fecha date;
  v_hora time without time zone;
  v_space_count integer;
  v_returned_count integer;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_autolavado_id IS NULL OR pg_catalog.btrim(p_autolavado_id) = ''
    OR p_servicio_id IS NULL OR pg_catalog.btrim(p_servicio_id) = ''
    OR p_fecha IS NULL OR p_fecha !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR p_hora IS NULL OR p_hora !~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' THEN
    RAISE EXCEPTION 'Invalid reservation date or time.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_fecha := p_fecha::date;
    v_hora := p_hora::time without time zone;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid reservation date or time.' USING ERRCODE = '22023';
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.autolavados AS wash WHERE wash.id::text = p_autolavado_id
  ) THEN
    RAISE EXCEPTION 'The selected car wash does not exist.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.servicios AS service
    WHERE service.id::text = p_servicio_id
      AND service.autolavado_id::text = p_autolavado_id
  ) THEN
    RAISE EXCEPTION 'The selected service is not available at this car wash.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_space_count
  FROM public.espacios_lavado AS space
  WHERE space.autolavado_id::text = p_autolavado_id
    AND space.activo IS TRUE;

  IF v_space_count = 0 THEN
    RETURN QUERY
    SELECT false,
      NOT EXISTS (
        SELECT 1
        FROM public.reservaciones AS reservation
        WHERE reservation.autolavado_id::text = p_autolavado_id
          AND reservation.fecha = v_fecha
          AND reservation.hora_inicio = v_hora
          AND reservation.estado::text IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado')
      ),
      NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true,
    true,
    space.id::text
  FROM public.espacios_lavado AS space
  WHERE space.autolavado_id::text = p_autolavado_id
    AND space.activo IS TRUE
    AND space.estado::text = 'disponible'
    AND NOT EXISTS (
        SELECT 1
        FROM public.reservaciones AS reservation
        WHERE reservation.autolavado_id::text = p_autolavado_id
          AND (
            reservation.espacio_id IS NULL
            OR reservation.espacio_id::text = space.id::text
          )
          AND reservation.fecha = v_fecha
          AND reservation.hora_inicio = v_hora
          AND reservation.estado::text IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado')
    );

  GET DIAGNOSTICS v_returned_count = ROW_COUNT;
  IF v_returned_count = 0 THEN
    RETURN QUERY SELECT true, false, NULL::text;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_create_reservation(
  p_session_token text,
  p_autolavado_id text,
  p_servicio_id text,
  p_vehiculo_id text,
  p_fecha text,
  p_hora text,
  p_espacio_lavado_id text
)
RETURNS TABLE (
  id text,
  vehiculo_id text,
  autolavado_id text,
  servicio_id text,
  espacio_lavado_id text,
  fecha date,
  hora time without time zone,
  estado text,
  codigo_qr text,
  autolavado_nombre text,
  servicio_nombre text,
  precio numeric,
  duracion_aproximada numeric,
  vehiculo_marca text,
  vehiculo_modelo text,
  vehiculo_placas text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_fecha date;
  v_hora time without time zone;
  v_estado text := 'pendiente';
  v_requested_space_id text;
  v_space_count integer;
  v_reservation_id text;
  v_service_autolavado_id text;
  v_space_autolavado_id text;
  v_space_active boolean;
  v_space_status text;
  v_usuario_id_type text;
  v_vehiculo_id_type text;
  v_autolavado_id_type text;
  v_servicio_id_type text;
  v_espacio_id_type text;
  v_estado_type text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_autolavado_id IS NULL OR pg_catalog.btrim(p_autolavado_id) = ''
    OR p_servicio_id IS NULL OR pg_catalog.btrim(p_servicio_id) = ''
    OR p_vehiculo_id IS NULL OR pg_catalog.btrim(p_vehiculo_id) = ''
    OR p_fecha IS NULL OR p_fecha !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR p_hora IS NULL OR p_hora !~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' THEN
    RAISE EXCEPTION 'Invalid reservation details.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_fecha := p_fecha::date;
    v_hora := p_hora::time without time zone;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid reservation date or time.' USING ERRCODE = '22023';
  END;
  v_requested_space_id := NULLIF(pg_catalog.btrim(p_espacio_lavado_id), '');

  -- Only pendiente is created here; all seven statuses remain explicitly allowed by the table contract.
  IF v_estado NOT IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado', 'finalizada', 'cancelada')
    OR v_estado IN ('finalizada', 'cancelada') THEN
    RAISE EXCEPTION 'Invalid reservation status.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.autolavados AS wash WHERE wash.id::text = p_autolavado_id
  ) THEN
    RAISE EXCEPTION 'The selected car wash does not exist.' USING ERRCODE = '22023';
  END IF;
  SELECT service.autolavado_id::text
  INTO v_service_autolavado_id
  FROM public.servicios AS service
  WHERE service.id::text = p_servicio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected service is not available at this car wash.' USING ERRCODE = '22023';
  END IF;
  IF v_service_autolavado_id IS DISTINCT FROM p_autolavado_id THEN
    RAISE EXCEPTION 'The selected service is not available at this car wash.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.vehiculos AS vehicle
    WHERE vehicle.id::text = p_vehiculo_id
      AND vehicle.usuario_id::text = v_owner_id
  ) THEN
    RAISE EXCEPTION 'The selected vehicle is not owned by the current customer.' USING ERRCODE = '42501';
  END IF;

  IF v_requested_space_id IS NOT NULL THEN
    SELECT space.autolavado_id::text,
      space.activo,
      space.estado::text
    INTO v_space_autolavado_id, v_space_active, v_space_status
    FROM public.espacios_lavado AS space
    WHERE space.id::text = v_requested_space_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_space_autolavado_id IS DISTINCT FROM p_autolavado_id
      OR v_space_active IS DISTINCT FROM TRUE
      OR v_space_status IS DISTINCT FROM 'disponible' THEN
      RAISE EXCEPTION 'The selected washing space is not applicable.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_space_count
  FROM public.espacios_lavado AS space
  WHERE space.autolavado_id::text = p_autolavado_id
    AND space.activo IS TRUE;

  IF v_space_count > 0 AND v_requested_space_id IS NULL THEN
    RAISE EXCEPTION 'A valid washing space is required for this car wash.' USING ERRCODE = '22023';
  END IF;
  IF v_space_count = 0 AND v_requested_space_id IS NOT NULL THEN
    RAISE EXCEPTION 'The selected car wash has no applicable washing space.' USING ERRCODE = '22023';
  END IF;
  -- Serialize the local autolavado/time slot, then the selected space when one exists.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat('carwash-reservation:', p_autolavado_id, ':', v_fecha::text, ':', v_hora::text),
      0
    )
  );
  IF v_requested_space_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat('carwash-reservation-space:', p_autolavado_id, ':', v_requested_space_id, ':', v_fecha::text, ':', v_hora::text),
        0
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reservaciones AS reservation
        WHERE reservation.autolavado_id::text = p_autolavado_id
          AND reservation.fecha = v_fecha
          AND reservation.hora_inicio = v_hora
          AND reservation.estado::text IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado')
          AND (
            v_requested_space_id IS NULL
            OR reservation.espacio_id IS NULL
            OR reservation.espacio_id::text = v_requested_space_id
          )
  ) THEN
    RAISE EXCEPTION 'The selected time or washing space is occupied.' USING ERRCODE = '23P01';
  END IF;

  PERFORM pg_catalog.set_config('carwash.actor_id', v_owner_id, true);
  PERFORM pg_catalog.set_config('carwash.actor_role', 'cliente', true);

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_usuario_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.reservaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'usuario_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_vehiculo_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.reservaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'vehiculo_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_autolavado_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.reservaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'autolavado_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_servicio_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.reservaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'servicio_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_espacio_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.reservaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'espacio_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_estado_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.reservaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'estado'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_usuario_id_type IS NULL OR v_vehiculo_id_type IS NULL OR v_autolavado_id_type IS NULL
    OR v_servicio_id_type IS NULL OR v_espacio_id_type IS NULL OR v_estado_type IS NULL THEN
    RAISE EXCEPTION 'public.reservaciones does not match the documented reservation contract.';
  END IF;

  EXECUTE pg_catalog.format(
    'INSERT INTO public.reservaciones
      (usuario_id, vehiculo_id, autolavado_id, servicio_id, espacio_id, fecha, hora_inicio, estado)
     VALUES (($1)::%1$s, ($2)::%2$s, ($3)::%3$s, ($4)::%4$s,
       CASE WHEN $5 IS NULL THEN NULL::%5$s ELSE ($5)::%5$s END,
       $6, $7, ($8)::%6$s)
     RETURNING id::text',
    v_usuario_id_type,
    v_vehiculo_id_type,
    v_autolavado_id_type,
    v_servicio_id_type,
    v_espacio_id_type,
    v_estado_type
  ) INTO v_reservation_id
  USING v_owner_id, p_vehiculo_id, p_autolavado_id, p_servicio_id,
    v_requested_space_id, v_fecha, v_hora, v_estado;

  RETURN QUERY
  SELECT reservation.id::text,
    reservation.vehiculo_id::text,
    reservation.autolavado_id::text,
    reservation.servicio_id::text,
    reservation.espacio_id::text AS espacio_lavado_id,
    reservation.fecha,
    reservation.hora_inicio AS hora,
    reservation.estado::text,
    reservation.codigo_qr::text,
    wash.nombre::text,
    service.nombre::text,
    service.precio::numeric,
    service.duracion_minutos::numeric AS duracion_aproximada,
    vehicle.marca::text,
    vehicle.modelo::text,
    vehicle.placas::text,
    reservation.created_at,
    reservation.updated_at
  FROM public.reservaciones AS reservation
  JOIN public.autolavados AS wash ON wash.id::text = reservation.autolavado_id::text
  JOIN public.servicios AS service ON service.id::text = reservation.servicio_id::text
  JOIN public.vehiculos AS vehicle ON vehicle.id::text = reservation.vehiculo_id::text
  WHERE reservation.id::text = v_reservation_id
    AND reservation.usuario_id::text = v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_list_reservations(p_session_token text)
RETURNS TABLE (
  id text,
  vehiculo_id text,
  autolavado_id text,
  servicio_id text,
  espacio_lavado_id text,
  fecha date,
  hora time without time zone,
  estado text,
  codigo_qr text,
  autolavado_nombre text,
  servicio_nombre text,
  precio numeric,
  duracion_aproximada numeric,
  vehiculo_marca text,
  vehiculo_modelo text,
  vehiculo_placas text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT reservation.id::text,
    reservation.vehiculo_id::text,
    reservation.autolavado_id::text,
    reservation.servicio_id::text,
    reservation.espacio_id::text AS espacio_lavado_id,
    reservation.fecha,
    reservation.hora_inicio AS hora,
    reservation.estado::text,
    reservation.codigo_qr::text,
    wash.nombre::text,
    service.nombre::text,
    service.precio::numeric,
    service.duracion_minutos::numeric AS duracion_aproximada,
    vehicle.marca::text,
    vehicle.modelo::text,
    vehicle.placas::text,
    reservation.created_at,
    reservation.updated_at
  FROM public.reservaciones AS reservation
  JOIN public.autolavados AS wash ON wash.id::text = reservation.autolavado_id::text
  JOIN public.servicios AS service ON service.id::text = reservation.servicio_id::text
  JOIN public.vehiculos AS vehicle ON vehicle.id::text = reservation.vehiculo_id::text
  WHERE reservation.usuario_id::text = v_owner_id
  ORDER BY reservation.fecha, reservation.hora_inicio, reservation.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_get_reservation(
  p_session_token text,
  p_reservation_id text
)
RETURNS TABLE (
  id text,
  vehiculo_id text,
  autolavado_id text,
  servicio_id text,
  espacio_lavado_id text,
  fecha date,
  hora time without time zone,
  estado text,
  codigo_qr text,
  autolavado_nombre text,
  servicio_nombre text,
  precio numeric,
  duracion_aproximada numeric,
  vehiculo_marca text,
  vehiculo_modelo text,
  vehiculo_placas text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT reservation.id::text,
    reservation.vehiculo_id::text,
    reservation.autolavado_id::text,
    reservation.servicio_id::text,
    reservation.espacio_id::text AS espacio_lavado_id,
    reservation.fecha,
    reservation.hora_inicio AS hora,
    reservation.estado::text,
    reservation.codigo_qr::text,
    wash.nombre::text,
    service.nombre::text,
    service.precio::numeric,
    service.duracion_minutos::numeric AS duracion_aproximada,
    vehicle.marca::text,
    vehicle.modelo::text,
    vehicle.placas::text,
    reservation.created_at,
    reservation.updated_at
  FROM public.reservaciones AS reservation
  JOIN public.autolavados AS wash ON wash.id::text = reservation.autolavado_id::text
  JOIN public.servicios AS service ON service.id::text = reservation.servicio_id::text
  JOIN public.vehiculos AS vehicle ON vehicle.id::text = reservation.vehiculo_id::text
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_cancel_reservation(
  p_session_token text,
  p_reservation_id text
)
RETURNS TABLE (
  id text,
  vehiculo_id text,
  autolavado_id text,
  servicio_id text,
  espacio_lavado_id text,
  fecha date,
  hora time without time zone,
  estado text,
  codigo_qr text,
  autolavado_nombre text,
  servicio_nombre text,
  precio numeric,
  duracion_aproximada numeric,
  vehiculo_marca text,
  vehiculo_modelo text,
  vehiculo_placas text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_current_status text;
  v_updated_count integer;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  SELECT reservation.estado::text
  INTO v_current_status
  FROM public.reservaciones AS reservation
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'The reservation could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_current_status = 'cancelada' THEN
    -- Idempotent cancellation returns the preserved record and database-generated QR.
    RETURN QUERY SELECT * FROM public.carwash_get_reservation(p_session_token, p_reservation_id);
    RETURN;
  END IF;
  IF v_current_status IN ('cliente_llego', 'en_espera', 'en_lavado', 'finalizada') THEN
    RAISE EXCEPTION 'This reservation cannot be cancelled.' USING ERRCODE = '22023';
  END IF;
  IF v_current_status NOT IN ('pendiente', 'confirmada') THEN
    RAISE EXCEPTION 'This reservation cannot be cancelled.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('carwash.actor_id', v_owner_id, true);
  PERFORM pg_catalog.set_config('carwash.actor_role', 'cliente', true);

  UPDATE public.reservaciones AS reservation
  SET estado = 'cancelada', updated_at = pg_catalog.clock_timestamp()
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id
    AND reservation.estado::text IN ('pendiente', 'confirmada');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'The reservation could not be cancelled.' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY SELECT * FROM public.carwash_get_reservation(p_session_token, p_reservation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_available_spaces(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_create_reservation(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_list_reservations(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_get_reservation(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_cancel_reservation(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_available_spaces(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_create_reservation(text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_list_reservations(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_get_reservation(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_cancel_reservation(text, text) TO anon, authenticated;

/*
  Administrator completion boundary.

  This migration adds service availability, ratings, administrator reservation
  status transitions, and independent rating projections. Direct access to
  operational and rating data remains denied; clients use explicit RPCs.
*/

ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS activo boolean;

UPDATE public.servicios
SET activo = true
WHERE activo IS NULL;

ALTER TABLE public.servicios
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN activo SET NOT NULL;

DROP POLICY IF EXISTS carwash_public_catalog_read ON public.servicios;
CREATE POLICY carwash_public_catalog_read ON public.servicios
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (activo IS TRUE);

DROP POLICY IF EXISTS carwash_public_catalog_read ON public.espacios_lavado;
CREATE POLICY carwash_public_catalog_read ON public.espacios_lavado
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (activo IS TRUE);

-- Catalog visibility is not sufficient protection because the customer
-- reservation RPC accepts an opaque service id. Enforce availability at the
-- write boundary so a hidden service cannot be reserved by a crafted request.
CREATE OR REPLACE FUNCTION public.carwash_validate_active_reservation_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.servicios AS service
    WHERE service.id::text = NEW.servicio_id::text
      AND service.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'The selected service is not available.' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carwash_reservaciones_active_service_guard ON public.reservaciones;
CREATE TRIGGER carwash_reservaciones_active_service_guard
  BEFORE INSERT OR UPDATE OF servicio_id ON public.reservaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.carwash_validate_active_reservation_service();

REVOKE ALL ON FUNCTION public.carwash_validate_active_reservation_service()
  FROM PUBLIC, anon, authenticated;

DO $calificaciones_schema$
DECLARE
  v_reservation_id_type text;
  v_user_id_type text;
  v_autolavado_id_type text;
BEGIN
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_reservation_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.reservaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_user_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.usuarios'::pg_catalog.regclass
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

  IF v_reservation_id_type IS NULL
    OR v_user_id_type IS NULL
    OR v_autolavado_id_type IS NULL THEN
    RAISE EXCEPTION 'Ratings require id columns on reservaciones, usuarios, and autolavados.';
  END IF;

  EXECUTE pg_catalog.format($sql$
    CREATE TABLE IF NOT EXISTS public.calificaciones (
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      reservacion_id %1$s NOT NULL REFERENCES public.reservaciones(id),
      usuario_id %2$s NOT NULL REFERENCES public.usuarios(id),
      autolavado_id %3$s NOT NULL REFERENCES public.autolavados(id),
      puntuacion smallint NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
      comentario text,
      created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
      CONSTRAINT carwash_calificaciones_reservation_unique UNIQUE (reservacion_id),
      CONSTRAINT carwash_calificaciones_comment_length_check CHECK (
        comentario IS NULL OR pg_catalog.char_length(comentario) <= 2000
      )
    )
  $sql$, v_reservation_id_type, v_user_id_type, v_autolavado_id_type);
END;
$calificaciones_schema$;

COMMENT ON TABLE public.calificaciones IS
  'Customer feedback attached to one completed reservation and its car wash.';

CREATE INDEX IF NOT EXISTS carwash_calificaciones_autolavado_created_idx
  ON public.calificaciones (autolavado_id, created_at DESC);

CREATE INDEX IF NOT EXISTS carwash_calificaciones_created_idx
  ON public.calificaciones (created_at DESC);

ALTER TABLE public.calificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carwash_deny_client_access ON public.calificaciones;
CREATE POLICY carwash_deny_client_access ON public.calificaciones
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL PRIVILEGES ON TABLE public.calificaciones FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.carwash_administrator_dashboard(text);
DROP FUNCTION IF EXISTS public.carwash_administrator_list_services(text);
DROP FUNCTION IF EXISTS public.carwash_administrator_create_service(text, text, text, text, numeric, numeric);
DROP FUNCTION IF EXISTS public.carwash_administrator_update_service(text, text, text, text, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.carwash_administrator_dashboard(p_session_token text)
RETURNS TABLE (
  today_reservations bigint,
  collected_revenue numeric,
  completed_services bigint,
  vehicles_in_lavado bigint,
  average_rating numeric,
  rating_count bigint
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
  SELECT
    (
      SELECT pg_catalog.count(*)::bigint
      FROM public.reservaciones AS reservation
      WHERE reservation.fecha = CURRENT_DATE
        AND reservation.estado::text <> 'cancelada'
    ),
    COALESCE(
      (
        SELECT pg_catalog.sum(payment.monto::numeric)
        FROM public.pagos AS payment
        WHERE payment.estado::text = 'pagado'
          AND payment.fecha_pago::date = CURRENT_DATE
      ),
      0::numeric
    ),
    (
      SELECT pg_catalog.count(*)::bigint
      FROM public.reservaciones AS reservation
      WHERE reservation.fecha = CURRENT_DATE
        AND reservation.estado::text = 'finalizada'
    ),
    (
      SELECT pg_catalog.count(DISTINCT reservation.vehiculo_id)::bigint
      FROM public.reservaciones AS reservation
      WHERE reservation.estado::text = 'en_lavado'
    ),
    COALESCE(
      (
        SELECT pg_catalog.round(pg_catalog.avg(rating.puntuacion::numeric), 2)
        FROM public.calificaciones AS rating
      ),
      0::numeric
    ),
    (
      SELECT pg_catalog.count(*)::bigint
      FROM public.calificaciones AS rating
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_list_services(p_session_token text)
RETURNS TABLE (
  id text,
  autolavado_id text,
  nombre text,
  descripcion text,
  precio numeric,
  duracion_aproximada numeric,
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
  SELECT service.id::text,
    service.autolavado_id::text,
    service.nombre::text,
    service.descripcion::text,
    service.precio::numeric,
    service.duracion_minutos::numeric AS duracion_aproximada,
    service.activo
  FROM public.servicios AS service
  JOIN public.autolavados AS wash
    ON wash.id::text = service.autolavado_id::text
  ORDER BY wash.nombre::text, service.nombre::text, service.id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_create_service(
  p_session_token text,
  p_autolavado_id text,
  p_nombre text,
  p_descripcion text,
  p_precio numeric,
  p_duracion_aproximada numeric,
  p_activo boolean
)
RETURNS TABLE (
  id text,
  autolavado_id text,
  nombre text,
  descripcion text,
  precio numeric,
  duracion_aproximada numeric,
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
    OR p_duracion_aproximada <> pg_catalog.trunc(p_duracion_aproximada)
    OR p_activo IS NULL THEN
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
     VALUES (($1)::%1$s, $2, $3, $4, $5, $6)
     RETURNING id::text, autolavado_id::text, nombre::text, descripcion::text,
       precio::numeric, duracion_minutos::numeric, activo',
    v_autolavado_id_type
  ) USING v_autolavado_id, v_nombre, v_descripcion, p_precio,
    p_duracion_aproximada, p_activo;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_update_service(
  p_session_token text,
  p_servicio_id text,
  p_autolavado_id text,
  p_nombre text,
  p_descripcion text,
  p_precio numeric,
  p_duracion_aproximada numeric,
  p_activo boolean
)
RETURNS TABLE (
  id text,
  autolavado_id text,
  nombre text,
  descripcion text,
  precio numeric,
  duracion_aproximada numeric,
  activo boolean
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
    OR p_duracion_aproximada <> pg_catalog.trunc(p_duracion_aproximada)
    OR p_activo IS NULL THEN
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

  IF v_current_autolavado_id IS DISTINCT FROM v_autolavado_id
    AND EXISTS (
      SELECT 1
      FROM public.reservaciones AS reservation
      WHERE reservation.servicio_id::text = v_servicio_id
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
       duracion_minutos = $5,
       activo = $6
     WHERE service.id::text = $7
     RETURNING service.id::text, service.autolavado_id::text, service.nombre::text,
       service.descripcion::text, service.precio::numeric,
       service.duracion_minutos::numeric, service.activo',
    v_autolavado_id_type
  ) USING v_autolavado_id, v_nombre, v_descripcion, p_precio,
    p_duracion_aproximada, p_activo, v_servicio_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'The selected service does not exist.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_list_ratings(p_session_token text)
RETURNS TABLE (
  id text,
  reservacion_id text,
  reservacion_fecha date,
  reservacion_hora time without time zone,
  autolavado_id text,
  autolavado_nombre text,
  servicio_nombre text,
  cliente_nombre text,
  cliente_apellido text,
  puntuacion smallint,
  comentario text,
  created_at timestamptz
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
  SELECT rating.id::text,
    reservation.id::text,
    reservation.fecha,
    reservation.hora_inicio,
    wash.id::text,
    wash.nombre::text,
    service.nombre::text,
    customer.nombre::text,
    customer.apellido::text,
    rating.puntuacion,
    rating.comentario::text,
    rating.created_at
  FROM public.calificaciones AS rating
  JOIN public.reservaciones AS reservation
    ON reservation.id::text = rating.reservacion_id::text
  JOIN public.usuarios AS customer
    ON customer.id::text = rating.usuario_id::text
  JOIN public.autolavados AS wash
    ON wash.id::text = rating.autolavado_id::text
  JOIN public.servicios AS service
    ON service.id::text = reservation.servicio_id::text
  ORDER BY rating.created_at DESC, rating.id::text DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_update_reservation_status(
  p_session_token text,
  p_reservation_id text,
  p_estado text
)
RETURNS TABLE (
  id text,
  estado text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_administrator_id text;
  v_reservation_id text;
  v_current_status text;
  v_space_id text;
  v_state_type text;
  v_space_state_type text;
  v_updated_at timestamptz;
  v_space_state text;
BEGIN
  v_administrator_id := public.carwash_current_administrator_id(p_session_token);
  IF v_administrator_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired administrator session.' USING ERRCODE = '42501';
  END IF;

  v_reservation_id := NULLIF(pg_catalog.btrim(p_reservation_id), '');
  IF v_reservation_id IS NULL
    OR p_estado IS NULL
    OR p_estado NOT IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado', 'finalizada', 'cancelada') THEN
    RAISE EXCEPTION 'Invalid reservation status details.' USING ERRCODE = '22023';
  END IF;

  SELECT reservation.estado::text,
    reservation.espacio_id::text
  INTO v_current_status, v_space_id
  FROM public.reservaciones AS reservation
  WHERE reservation.id::text = v_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected reservation does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF p_estado = 'confirmada' AND v_current_status = 'pendiente' THEN
    IF EXISTS (
      SELECT 1
      FROM public.pagos AS payment
      WHERE payment.reservacion_id::text = v_reservation_id
        AND payment.estado::text IN ('pendiente', 'procesando')
        AND payment.metodo_pago::text IN ('tarjeta_credito', 'tarjeta_debito')
    ) THEN
      RAISE EXCEPTION 'A card payment must be completed before this reservation can be confirmed.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF p_estado IS DISTINCT FROM v_current_status
    AND (
      (v_current_status = 'pendiente' AND p_estado NOT IN ('confirmada', 'cancelada'))
      OR (v_current_status = 'confirmada' AND p_estado NOT IN ('cliente_llego', 'cancelada'))
      OR (v_current_status = 'cliente_llego' AND p_estado NOT IN ('en_espera', 'en_lavado'))
      OR (v_current_status = 'en_espera' AND p_estado <> 'en_lavado')
      OR (v_current_status = 'en_lavado' AND p_estado <> 'finalizada')
      OR v_current_status IN ('finalizada', 'cancelada')
    ) THEN
    RAISE EXCEPTION 'The reservation status transition is not allowed.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_state_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.reservaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'estado'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_state_type IS NULL THEN
    RAISE EXCEPTION 'The reservation status column is unavailable.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('carwash.actor_id', v_administrator_id, true);
  PERFORM pg_catalog.set_config('carwash.actor_role', 'administrador', true);

  EXECUTE pg_catalog.format(
    'UPDATE public.reservaciones AS reservation
     SET estado = ($1)::%1$s,
       updated_at = pg_catalog.clock_timestamp()
     WHERE reservation.id::text = $2
     RETURNING reservation.updated_at',
    v_state_type
  ) INTO v_updated_at USING p_estado, v_reservation_id;

  IF v_space_id IS NOT NULL THEN
    v_space_state := CASE
      WHEN p_estado IN ('confirmada', 'cliente_llego', 'en_espera') THEN 'reservado'
      WHEN p_estado = 'en_lavado' THEN 'ocupado'
      WHEN p_estado IN ('finalizada', 'cancelada') THEN 'disponible'
      ELSE NULL
    END;

    IF v_space_state IS NOT NULL THEN
      SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
      INTO v_space_state_type
      FROM pg_catalog.pg_attribute AS column_metadata
      WHERE column_metadata.attrelid = 'public.espacios_lavado'::pg_catalog.regclass
        AND column_metadata.attname = 'estado'
        AND column_metadata.attnum > 0
        AND NOT column_metadata.attisdropped;

      IF v_space_state_type IS NOT NULL THEN
        EXECUTE pg_catalog.format(
          'UPDATE public.espacios_lavado AS space
           SET estado = ($1)::%1$s
           WHERE space.id::text = $2',
          v_space_state_type
        ) USING v_space_state, v_space_id;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_reservation_id, p_estado, v_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_create_calificacion(
  p_session_token text,
  p_reservation_id text,
  p_puntuacion integer,
  p_comentario text
)
RETURNS TABLE (
  id text,
  reservacion_id text,
  autolavado_id text,
  puntuacion smallint,
  comentario text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_reservation_id text;
  v_autolavado_id text;
  v_comment text;
  v_reservation_id_type text;
  v_user_id_type text;
  v_autolavado_id_type text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  v_reservation_id := NULLIF(pg_catalog.btrim(p_reservation_id), '');
  v_comment := NULLIF(pg_catalog.btrim(COALESCE(p_comentario, '')), '');
  IF v_reservation_id IS NULL
    OR p_puntuacion IS NULL
    OR p_puntuacion < 1
    OR p_puntuacion > 5
    OR (v_comment IS NOT NULL AND pg_catalog.char_length(v_comment) > 2000) THEN
    RAISE EXCEPTION 'Invalid rating details.' USING ERRCODE = '22023';
  END IF;

  SELECT reservation.autolavado_id::text
  INTO v_autolavado_id
  FROM public.reservaciones AS reservation
  WHERE reservation.id::text = v_reservation_id
    AND reservation.usuario_id::text = v_owner_id
    AND reservation.estado::text = 'finalizada'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only completed reservations owned by the current customer can be rated.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calificaciones AS rating
    WHERE rating.reservacion_id::text = v_reservation_id
  ) THEN
    RAISE EXCEPTION 'This reservation already has a rating.' USING ERRCODE = '23505';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_reservation_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.calificaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'reservacion_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_user_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.calificaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'usuario_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_autolavado_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.calificaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'autolavado_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_reservation_id_type IS NULL
    OR v_user_id_type IS NULL
    OR v_autolavado_id_type IS NULL THEN
    RAISE EXCEPTION 'The rating relationship is unavailable.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format(
    'INSERT INTO public.calificaciones
      (reservacion_id, usuario_id, autolavado_id, puntuacion, comentario)
     VALUES (($1)::%1$s, ($2)::%2$s, ($3)::%3$s, $4, $5)
     RETURNING id::text, reservacion_id::text, autolavado_id::text,
       puntuacion, comentario::text, created_at',
    v_reservation_id_type,
    v_user_id_type,
    v_autolavado_id_type
  ) USING v_reservation_id, v_owner_id, v_autolavado_id, p_puntuacion, v_comment;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_administrator_dashboard(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_list_services(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_create_service(text, text, text, text, numeric, numeric, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_update_service(text, text, text, text, text, numeric, numeric, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_list_ratings(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_update_reservation_status(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_create_calificacion(text, text, integer, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_administrator_dashboard(text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_list_services(text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_create_service(text, text, text, text, numeric, numeric, boolean)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_update_service(text, text, text, text, text, numeric, numeric, boolean)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_list_ratings(text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_update_reservation_status(text, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_create_calificacion(text, text, integer, text)
  TO anon, authenticated;

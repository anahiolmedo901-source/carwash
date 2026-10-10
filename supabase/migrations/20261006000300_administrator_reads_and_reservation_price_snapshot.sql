/*
  Administrator read boundary and reservation price snapshot.

  This migration follows administrator authentication and keeps all customer
  reservation and payment behavior behind the existing RPC contracts. Admin
  reads expose only explicit operational projections; no client-supplied role,
  identity, car-wash, status, price, or metric value is accepted.
*/

ALTER TABLE public.reservaciones
  ADD COLUMN IF NOT EXISTS precio_snapshot numeric(12,2);

-- Existing reservations keep the service amount that was authoritative before
-- the snapshot existed. Rows without a related service fail the later
-- constraints instead of being silently assigned an arbitrary amount.
UPDATE public.reservaciones AS reservation
SET precio_snapshot = service.precio::numeric
FROM public.servicios AS service
WHERE service.id::text = reservation.servicio_id::text
  AND reservation.precio_snapshot IS NULL;

ALTER TABLE public.reservaciones
  DROP CONSTRAINT IF EXISTS carwash_reservaciones_precio_snapshot_check;

ALTER TABLE public.reservaciones
  ADD CONSTRAINT carwash_reservaciones_precio_snapshot_check
  CHECK (
    precio_snapshot >= 0
    AND precio_snapshot <= 9999999999.99
    AND precio_snapshot = pg_catalog.round(precio_snapshot::numeric, 2)
  );

ALTER TABLE public.reservaciones
  ALTER COLUMN precio_snapshot SET NOT NULL;

COMMENT ON COLUMN public.reservaciones.precio_snapshot IS
  'Immutable monetary amount captured from servicios.precio when the reservation is created.';

-- The existing customer exploration service intentionally reads the dynamic
-- catalog tables with select('*'), so these public catalog objects retain a
-- narrowly-scoped read-only client path. Mutations and all sensitive source
-- tables remain server-controlled through the explicit RPC boundary below.
ALTER TABLE public.autolavados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.espacios_lavado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleado_autolavados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carwash_deny_client_access ON public.autolavados;
DROP POLICY IF EXISTS carwash_public_catalog_read ON public.autolavados;
CREATE POLICY carwash_public_catalog_read ON public.autolavados
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS carwash_deny_client_access ON public.servicios;
DROP POLICY IF EXISTS carwash_public_catalog_read ON public.servicios;
CREATE POLICY carwash_public_catalog_read ON public.servicios
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS carwash_deny_client_access ON public.espacios_lavado;
DROP POLICY IF EXISTS carwash_public_catalog_read ON public.espacios_lavado;
CREATE POLICY carwash_public_catalog_read ON public.espacios_lavado
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS carwash_deny_client_access ON public.usuarios;
CREATE POLICY carwash_deny_client_access ON public.usuarios
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS carwash_deny_client_access ON public.empleado_autolavados;
CREATE POLICY carwash_deny_client_access ON public.empleado_autolavados
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS carwash_deny_client_access ON public.reservaciones;
CREATE POLICY carwash_deny_client_access ON public.reservaciones
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS carwash_deny_client_access ON public.pagos;
CREATE POLICY carwash_deny_client_access ON public.pagos
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL PRIVILEGES ON TABLE
  public.autolavados,
  public.servicios,
  public.espacios_lavado,
  public.usuarios,
  public.empleado_autolavados,
  public.reservaciones,
  public.pagos
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.autolavados,
  public.servicios,
  public.espacios_lavado
TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.carwash_administrator_dashboard(p_session_token text)
  RETURNS TABLE (
  today_reservations bigint,
  collected_revenue numeric,
  completed_services bigint,
  vehicles_in_lavado bigint
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
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_list_autolavados(p_session_token text)
RETURNS TABLE (
  id text,
  nombre text
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
  SELECT wash.id::text, wash.nombre::text
  FROM public.autolavados AS wash
  ORDER BY wash.nombre::text, wash.id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_list_employees(p_session_token text)
RETURNS TABLE (
  id text,
  nombre text,
  apellido text,
  correo text,
  telefono text,
  activo boolean,
  asignacion_id text,
  autolavado_id text,
  autolavado_nombre text,
  asignacion_activa boolean
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
  SELECT employee.id::text,
    employee.nombre::text,
    employee.apellido::text,
    employee.correo::text,
    employee.telefono::text,
    employee.activo,
    assignment.id::text,
    wash.id::text,
    wash.nombre::text,
    assignment.activo
  FROM public.usuarios AS employee
  LEFT JOIN public.empleado_autolavados AS assignment
    ON assignment.empleado_id::text = employee.id::text
  LEFT JOIN public.autolavados AS wash
    ON wash.id::text = assignment.autolavado_id::text
  WHERE employee.rol::text = 'empleado'
  ORDER BY employee.apellido::text, employee.nombre::text, employee.id::text,
    assignment.id::text NULLS FIRST;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_administrator_list_reservations(p_session_token text)
RETURNS TABLE (
  id text,
  fecha date,
  hora time without time zone,
  estado text,
  vehiculo_id text,
  vehiculo_marca text,
  vehiculo_modelo text,
  vehiculo_placas text,
  autolavado_id text,
  autolavado_nombre text,
  servicio_id text,
  servicio_nombre text,
  espacio_lavado_id text,
  precio numeric,
  duracion_aproximada numeric,
  cliente_nombre text,
  cliente_apellido text,
  cliente_correo text,
  cliente_telefono text,
  payment_status text,
  payment_amount numeric,
  payment_paid_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
  SELECT reservation.id::text,
    reservation.fecha,
    reservation.hora_inicio AS hora,
    reservation.estado::text,
    reservation.vehiculo_id::text,
    vehicle.marca::text,
    vehicle.modelo::text,
    vehicle.placas::text,
    reservation.autolavado_id::text,
    wash.nombre::text,
    reservation.servicio_id::text,
    service.nombre::text,
    reservation.espacio_id::text AS espacio_lavado_id,
    reservation.precio_snapshot::numeric,
    service.duracion_minutos::numeric AS duracion_aproximada,
    customer.nombre::text,
    customer.apellido::text,
    customer.correo::text,
    customer.telefono::text,
    latest_payment.estado::text,
    latest_payment.monto::numeric,
    latest_payment.fecha_pago::timestamptz,
    reservation.created_at,
    reservation.updated_at
  FROM public.reservaciones AS reservation
  JOIN public.usuarios AS customer
    ON customer.id::text = reservation.usuario_id::text
  JOIN public.vehiculos AS vehicle
    ON vehicle.id::text = reservation.vehiculo_id::text
  JOIN public.autolavados AS wash
    ON wash.id::text = reservation.autolavado_id::text
  JOIN public.servicios AS service
    ON service.id::text = reservation.servicio_id::text
  LEFT JOIN LATERAL (
    SELECT payment.estado::text, payment.monto::numeric, payment.fecha_pago::timestamptz
    FROM public.pagos AS payment
    WHERE payment.reservacion_id::text = reservation.id::text
    ORDER BY payment.created_at DESC NULLS LAST, payment.id::text DESC
    LIMIT 1
  ) AS latest_payment ON true
  ORDER BY reservation.fecha, reservation.hora_inicio, reservation.created_at DESC;
END;
$$;

-- The reservation creation contract is copied forward so the authoritative
-- amount is captured in the same transaction as the reservation.
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
  v_price numeric;
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
  SELECT service.autolavado_id::text,
    service.precio::numeric
  INTO v_service_autolavado_id, v_price
  FROM public.servicios AS service
  WHERE service.id::text = p_servicio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected service is not available at this car wash.' USING ERRCODE = '22023';
  END IF;
  IF v_service_autolavado_id IS DISTINCT FROM p_autolavado_id THEN
    RAISE EXCEPTION 'The selected service is not available at this car wash.' USING ERRCODE = '22023';
  END IF;
  IF v_price IS NULL
    OR v_price < 0
    OR v_price > 9999999999.99
    OR v_price <> pg_catalog.round(v_price::numeric, 2) THEN
    RAISE EXCEPTION 'The selected service has an invalid price.' USING ERRCODE = '22023';
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
      (usuario_id, vehiculo_id, autolavado_id, servicio_id, espacio_id, fecha, hora_inicio, estado, precio_snapshot)
     VALUES (($1)::%1$s, ($2)::%2$s, ($3)::%3$s, ($4)::%4$s,
       CASE WHEN $5 IS NULL THEN NULL::%5$s ELSE ($5)::%5$s END,
       $6, $7, ($8)::%6$s, $9)
     RETURNING id::text',
    v_usuario_id_type,
    v_vehiculo_id_type,
    v_autolavado_id_type,
    v_servicio_id_type,
    v_espacio_id_type,
    v_estado_type
  ) INTO v_reservation_id
  USING v_owner_id, p_vehiculo_id, p_autolavado_id, p_servicio_id,
    v_requested_space_id, v_fecha, v_hora, v_estado, v_price;

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
    reservation.precio_snapshot::numeric,
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
    reservation.precio_snapshot::numeric,
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
    reservation.precio_snapshot::numeric,
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

-- Payment creation keeps all prior ownership, transition, and idempotency
-- behavior; only its authoritative amount source changes to the snapshot.
CREATE OR REPLACE FUNCTION public.carwash_begin_payment(
  p_session_token text,
  p_reservation_id text,
  p_metodo_pago text
)
RETURNS TABLE (
  id text,
  reservacion_id text,
  monto numeric,
  metodo_pago text,
  estado text,
  referencia_externa text,
  fecha_pago timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_reservation_owner_id text;
  v_reservation_status text;
  v_amount numeric;
  v_payment_id text;
  v_current_status text;
  v_payment_reservation_id_type text;
  v_payment_user_id_type text;
  v_payment_method_type text;
  v_payment_status_type text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_reservation_id IS NULL OR pg_catalog.btrim(p_reservation_id) = ''
    OR p_metodo_pago IS NULL
    OR p_metodo_pago NOT IN ('tarjeta_credito', 'tarjeta_debito', 'mercado_pago', 'efectivo', 'otro') THEN
    RAISE EXCEPTION 'Invalid payment details.' USING ERRCODE = '22023';
  END IF;

  SELECT reservation.usuario_id::text,
    reservation.estado::text,
    reservation.precio_snapshot::numeric
  INTO v_reservation_owner_id, v_reservation_status, v_amount
  FROM public.reservaciones AS reservation
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id
  FOR UPDATE OF reservation;

  IF NOT FOUND OR v_reservation_owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'The reservation could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_reservation_status NOT IN ('pendiente', 'confirmada') THEN
    RAISE EXCEPTION 'This reservation cannot receive a payment.' USING ERRCODE = '22023';
  END IF;

  SELECT payment.id::text, payment.estado::text
  INTO v_payment_id, v_current_status
  FROM public.pagos AS payment
  WHERE payment.reservacion_id::text = p_reservation_id
    AND payment.usuario_id::text = v_owner_id
  ORDER BY payment.created_at DESC NULLS LAST, payment.id::text DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND v_current_status = 'pagado' THEN
    IF v_reservation_status <> 'confirmada' THEN
      RAISE EXCEPTION 'The paid reservation is not confirmed.' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
      payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
      payment.fecha_pago::timestamptz, payment.created_at::timestamptz
    FROM public.pagos AS payment
    WHERE payment.id::text = v_payment_id
      AND payment.usuario_id::text = v_owner_id;
    RETURN;
  END IF;

  IF FOUND AND v_current_status IN ('pendiente', 'procesando') THEN
    IF v_current_status = 'pendiente' THEN
      SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
      INTO v_payment_method_type
      FROM pg_catalog.pg_attribute AS column_metadata
      WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
        AND column_metadata.attname = 'metodo_pago'
        AND column_metadata.attnum > 0
        AND NOT column_metadata.attisdropped;

      EXECUTE pg_catalog.format(
        'UPDATE public.pagos AS payment
         SET metodo_pago = ($1)::%s
         WHERE payment.id::text = $2 AND payment.usuario_id::text = $3',
        v_payment_method_type
      ) USING p_metodo_pago, v_payment_id, v_owner_id;
    END IF;

    RETURN QUERY
    SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
      payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
      payment.fecha_pago::timestamptz, payment.created_at::timestamptz
    FROM public.pagos AS payment
    WHERE payment.id::text = v_payment_id
      AND payment.usuario_id::text = v_owner_id;
    RETURN;
  END IF;

  IF v_reservation_status <> 'pendiente' THEN
    RAISE EXCEPTION 'The reservation is already confirmed without an open payment.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_reservation_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'reservacion_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_user_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'usuario_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_method_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'metodo_pago'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_status_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'estado'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_payment_reservation_id_type IS NULL OR v_payment_user_id_type IS NULL
    OR v_payment_method_type IS NULL OR v_payment_status_type IS NULL THEN
    RAISE EXCEPTION 'public.pagos does not match the documented payment contract.';
  END IF;

  EXECUTE pg_catalog.format(
    'INSERT INTO public.pagos
      (reservacion_id, usuario_id, monto, metodo_pago, estado)
     VALUES (($1)::%1$s, ($2)::%2$s, $3, ($4)::%3$s, ($5)::%4$s)
     RETURNING id::text',
    v_payment_reservation_id_type,
    v_payment_user_id_type,
    v_payment_method_type,
    v_payment_status_type
  ) INTO v_payment_id
  USING p_reservation_id, v_reservation_owner_id, v_amount, p_metodo_pago, 'pendiente';

  RETURN QUERY
  SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
    payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
    payment.fecha_pago::timestamptz, payment.created_at::timestamptz
  FROM public.pagos AS payment
  WHERE payment.id::text = v_payment_id
    AND payment.usuario_id::text = v_owner_id;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_administrator_dashboard(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_list_autolavados(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_list_employees(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_administrator_list_reservations(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_dashboard(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_list_autolavados(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_list_employees(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_administrator_list_reservations(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.carwash_create_reservation(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_list_reservations(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_get_reservation(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_cancel_reservation(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_begin_payment(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_create_reservation(text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_list_reservations(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_get_reservation(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_cancel_reservation(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_begin_payment(text, text, text) TO anon, authenticated;

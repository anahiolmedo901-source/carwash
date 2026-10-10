/*
  Customer mutation compatibility.

  Reasserts the owner-scoped cancellation and vehicle deletion boundaries for
  databases that already had older versions of these RPCs installed.
*/

ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS activo boolean,
  ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;

UPDATE public.vehiculos
SET activo = true
WHERE activo IS NULL;

ALTER TABLE public.vehiculos
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN activo SET NOT NULL;

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
  IF p_reservation_id IS NULL OR pg_catalog.btrim(p_reservation_id) = '' THEN
    RAISE EXCEPTION 'A reservation id is required.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat('carwash-reservation-mutation:', p_reservation_id),
      0
    )
  );

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
    RETURN QUERY
    SELECT reservation.id::text,
      reservation.vehiculo_id::text,
      reservation.autolavado_id::text,
      reservation.servicio_id::text,
      reservation.espacio_id::text,
      reservation.fecha,
      reservation.hora_inicio,
      reservation.estado::text,
      reservation.codigo_qr::text,
      wash.nombre::text,
      service.nombre::text,
      COALESCE(reservation.precio_snapshot::numeric, service.precio::numeric),
      service.duracion_minutos::numeric,
      vehicle.marca::text,
      vehicle.modelo::text,
      vehicle.placas::text,
      reservation.created_at::timestamptz,
      reservation.updated_at::timestamptz
    FROM public.reservaciones AS reservation
    JOIN public.autolavados AS wash ON wash.id::text = reservation.autolavado_id::text
    JOIN public.servicios AS service ON service.id::text = reservation.servicio_id::text
    JOIN public.vehiculos AS vehicle ON vehicle.id::text = reservation.vehiculo_id::text
    WHERE reservation.id::text = p_reservation_id
      AND reservation.usuario_id::text = v_owner_id;
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
  SET estado = 'cancelada',
    updated_at = pg_catalog.clock_timestamp()
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id
    AND reservation.estado::text IN ('pendiente', 'confirmada');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'The reservation could not be cancelled.' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY
  SELECT reservation.id::text,
    reservation.vehiculo_id::text,
    reservation.autolavado_id::text,
    reservation.servicio_id::text,
    reservation.espacio_id::text,
    reservation.fecha,
    reservation.hora_inicio,
    reservation.estado::text,
    reservation.codigo_qr::text,
    wash.nombre::text,
    service.nombre::text,
    COALESCE(reservation.precio_snapshot::numeric, service.precio::numeric),
    service.duracion_minutos::numeric,
    vehicle.marca::text,
    vehicle.modelo::text,
    vehicle.placas::text,
    reservation.created_at::timestamptz,
    reservation.updated_at::timestamptz
  FROM public.reservaciones AS reservation
  JOIN public.autolavados AS wash ON wash.id::text = reservation.autolavado_id::text
  JOIN public.servicios AS service ON service.id::text = reservation.servicio_id::text
  JOIN public.vehiculos AS vehicle ON vehicle.id::text = reservation.vehiculo_id::text
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_delete_vehicle(
  p_session_token text,
  p_vehicle_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_active boolean;
  v_updated_count integer;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_vehicle_id IS NULL OR pg_catalog.btrim(p_vehicle_id) = '' THEN
    RAISE EXCEPTION 'A vehicle id is required.' USING ERRCODE = '22023';
  END IF;

  SELECT vehicle.activo
  INTO v_active
  FROM public.vehiculos AS vehicle
  WHERE vehicle.id::text = p_vehicle_id
    AND vehicle.usuario_id::text = v_owner_id
  FOR UPDATE;

  IF NOT FOUND OR v_active IS DISTINCT FROM TRUE THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reservaciones AS reservation
    WHERE reservation.vehiculo_id::text = p_vehicle_id
      AND reservation.estado::text IN (
        'pendiente',
        'confirmada',
        'cliente_llego',
        'en_espera',
        'en_lavado'
      )
  ) THEN
    RAISE EXCEPTION
      'This vehicle has active reservations. Cancel them or wait until they finish before deleting it.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.vehiculos AS vehicle
  SET activo = false,
    eliminado_en = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  WHERE vehicle.id::text = p_vehicle_id
    AND vehicle.usuario_id::text = v_owner_id
    AND vehicle.activo IS TRUE;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_cancel_reservation(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_delete_vehicle(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_cancel_reservation(text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_delete_vehicle(text, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

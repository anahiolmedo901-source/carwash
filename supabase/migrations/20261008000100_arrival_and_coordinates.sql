/*
  Llegada del cliente (GPS + QR).

  - Agrega coordenadas opcionales a autolavados.
  - carwash_get_arrival_context: devuelve coordenadas, radio y estado de una
    reservación propia para calcular la distancia en el dispositivo.
  - carwash_confirm_arrival: valida sesión, propiedad, estado, QR y distancia
    en el servidor y pasa la reservación de 'confirmada' a 'cliente_llego'.
 */

ALTER TABLE public.autolavados
  ADD COLUMN IF NOT EXISTS latitud double precision,
  ADD COLUMN IF NOT EXISTS longitud double precision,
  ADD COLUMN IF NOT EXISTS radio_llegada_metros integer NOT NULL DEFAULT 150;

CREATE OR REPLACE FUNCTION public.carwash_get_arrival_context(
  p_session_token text,
  p_reservation_id text
)
RETURNS TABLE (
  reservacion_id text,
  estado text,
  autolavado_nombre text,
  latitud double precision,
  longitud double precision,
  radio_llegada_metros integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_owner_id text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT reservation.id::text,
    reservation.estado::text,
    wash.nombre::text,
    wash.latitud,
    wash.longitud,
    wash.radio_llegada_metros
  FROM public.reservaciones AS reservation
  JOIN public.autolavados AS wash
    ON wash.id::text = reservation.autolavado_id::text
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_confirm_arrival(
  p_session_token text,
  p_reservation_id text,
  p_latitud double precision DEFAULT NULL,
  p_longitud double precision DEFAULT NULL,
  p_codigo_qr text DEFAULT NULL
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
#variable_conflict use_column
DECLARE
  v_owner_id text;
  v_status text;
  v_qr text;
  v_wash_lat double precision;
  v_wash_lng double precision;
  v_radius integer;
  v_distance double precision;
  v_qr_ok boolean;
  v_gps_ok boolean := false;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  SELECT reservation.estado::text, reservation.codigo_qr::text,
    wash.latitud, wash.longitud, wash.radio_llegada_metros
  INTO v_status, v_qr, v_wash_lat, v_wash_lng, v_radius
  FROM public.reservaciones AS reservation
  JOIN public.autolavados AS wash
    ON wash.id::text = reservation.autolavado_id::text
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id
  FOR UPDATE OF reservation;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'The reservation could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_status = 'cliente_llego' THEN
    RETURN QUERY SELECT * FROM public.carwash_get_reservation(p_session_token, p_reservation_id);
    RETURN;
  END IF;
  IF v_status <> 'confirmada' THEN
    RAISE EXCEPTION 'Arrival can only be registered for confirmed reservations.' USING ERRCODE = '22023';
  END IF;

  v_qr_ok := p_codigo_qr IS NOT NULL AND v_qr IS NOT NULL AND p_codigo_qr = v_qr;

  IF p_latitud IS NOT NULL AND p_longitud IS NOT NULL
     AND v_wash_lat IS NOT NULL AND v_wash_lng IS NOT NULL THEN
    -- Haversine en metros.
    v_distance := 2 * 6371000 * pg_catalog.asin(LEAST(1, pg_catalog.sqrt(
      pg_catalog.power(pg_catalog.sin(pg_catalog.radians(v_wash_lat - p_latitud) / 2), 2)
      + pg_catalog.cos(pg_catalog.radians(p_latitud)) * pg_catalog.cos(pg_catalog.radians(v_wash_lat))
        * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(v_wash_lng - p_longitud) / 2), 2)
    )));
    v_gps_ok := v_distance <= COALESCE(v_radius, 150);
  END IF;

  IF NOT (v_qr_ok OR v_gps_ok) THEN
    RAISE EXCEPTION 'Arrival could not be verified by location or QR.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('carwash.actor_id', v_owner_id, true);
  PERFORM pg_catalog.set_config('carwash.actor_role', 'cliente', true);

  UPDATE public.reservaciones AS reservation
  SET estado = 'cliente_llego', updated_at = pg_catalog.clock_timestamp()
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id
    AND reservation.estado::text = 'confirmada';

  RETURN QUERY SELECT * FROM public.carwash_get_reservation(p_session_token, p_reservation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_get_arrival_context(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_confirm_arrival(text, text, double precision, double precision, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_get_arrival_context(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_confirm_arrival(text, text, double precision, double precision, text) TO anon, authenticated;

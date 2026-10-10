/*
  Availability and concurrency repair.

  Availability must use the complete service interval, not only the requested
  start time. The overlap trigger also serializes writes for one wash/day so
  two different start times cannot pass the check concurrently.
*/

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
  v_hora_fin time without time zone;
  v_duration_minutes integer;
  v_service_active boolean;
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
    SELECT 1
    FROM public.autolavados AS wash
    WHERE wash.id::text = p_autolavado_id
  ) THEN
    RAISE EXCEPTION 'The selected car wash does not exist.' USING ERRCODE = '22023';
  END IF;

  SELECT service.duracion_minutos::integer, service.activo
  INTO v_duration_minutes, v_service_active
  FROM public.servicios AS service
  WHERE service.id::text = p_servicio_id
    AND service.autolavado_id::text = p_autolavado_id;

  IF v_duration_minutes IS NULL
    OR v_duration_minutes <= 0
    OR v_service_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'The selected service is not available at this car wash.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.carwash_validate_reservation_slot(
    p_autolavado_id,
    p_servicio_id,
    v_hora
  );
  v_hora_fin := v_hora + (v_duration_minutes || ' minutes')::interval;

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
        LEFT JOIN public.servicios AS existing_service
          ON existing_service.id::text = reservation.servicio_id::text
        WHERE reservation.autolavado_id::text = p_autolavado_id
          AND reservation.fecha = v_fecha
          AND reservation.estado::text IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado')
          AND reservation.hora_inicio < v_hora_fin
          AND COALESCE(
            reservation.hora_fin,
            reservation.hora_inicio + (COALESCE(existing_service.duracion_minutos, 0)::text || ' minutes')::interval
          ) > v_hora
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
      LEFT JOIN public.servicios AS existing_service
        ON existing_service.id::text = reservation.servicio_id::text
      WHERE reservation.autolavado_id::text = p_autolavado_id
        AND (
          reservation.espacio_id IS NULL
          OR reservation.espacio_id::text = space.id::text
        )
        AND reservation.fecha = v_fecha
        AND reservation.estado::text IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado')
        AND reservation.hora_inicio < v_hora_fin
        AND COALESCE(
          reservation.hora_fin,
          reservation.hora_inicio + (COALESCE(existing_service.duracion_minutos, 0)::text || ' minutes')::interval
        ) > v_hora
    );

  GET DIAGNOSTICS v_returned_count = ROW_COUNT;
  IF v_returned_count = 0 THEN
    RETURN QUERY SELECT true, false, NULL::text;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_reservation_overlap_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado::text NOT IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat('carwash-reservation-day:', NEW.autolavado_id::text, ':', NEW.fecha::text),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.reservaciones AS existing
    LEFT JOIN public.servicios AS existing_service
      ON existing_service.id::text = existing.servicio_id::text
    LEFT JOIN public.servicios AS new_service
      ON new_service.id::text = NEW.servicio_id::text
    WHERE existing.id IS DISTINCT FROM NEW.id
      AND existing.autolavado_id::text = NEW.autolavado_id::text
      AND existing.fecha = NEW.fecha
      AND existing.estado::text IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado')
      AND (
        NEW.espacio_id IS NULL
        OR existing.espacio_id IS NULL
        OR existing.espacio_id::text = NEW.espacio_id::text
      )
      AND NEW.hora_inicio < COALESCE(
        existing.hora_fin,
        existing.hora_inicio + (COALESCE(existing_service.duracion_minutos, 0)::text || ' minutes')::interval
      )
      AND COALESCE(
        NEW.hora_fin,
        NEW.hora_inicio + (COALESCE(new_service.duracion_minutos, 0)::text || ' minutes')::interval
      ) > existing.hora_inicio
  ) THEN
    RAISE EXCEPTION 'The selected time or washing space is occupied.' USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carwash_reservation_overlap_guard ON public.reservaciones;
CREATE TRIGGER carwash_reservation_overlap_guard
BEFORE INSERT OR UPDATE OF autolavado_id, espacio_id, fecha, servicio_id, hora_inicio, hora_fin, estado
ON public.reservaciones
FOR EACH ROW
EXECUTE FUNCTION public.carwash_reservation_overlap_guard();

REVOKE ALL ON FUNCTION public.carwash_available_spaces(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_available_spaces(text, text, text, text, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

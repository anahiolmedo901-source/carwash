/*
  Compatibility repair for databases that already contain reservation tables.

  The application sends opaque ids as text through RPCs, while legacy tables
  may store the reservation id as uuid. All writes in this migration cast the
  value to the actual column type before inserting it.
*/

ALTER TABLE public.autolavados
  ADD COLUMN IF NOT EXISTS hora_apertura time without time zone NOT NULL DEFAULT '07:00:00',
  ADD COLUMN IF NOT EXISTS hora_cierre time without time zone NOT NULL DEFAULT '18:00:00';

UPDATE public.autolavados
SET hora_apertura = '07:00:00',
    hora_cierre = '18:00:00';

ALTER TABLE public.autolavados
  ALTER COLUMN hora_apertura SET DEFAULT '07:00:00',
  ALTER COLUMN hora_cierre SET DEFAULT '18:00:00';

DO $hours_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.autolavados'::pg_catalog.regclass
      AND conname = 'carwash_reservation_hours_check'
  ) THEN
    ALTER TABLE public.autolavados
      ADD CONSTRAINT carwash_reservation_hours_check
      CHECK (hora_apertura = '07:00:00'::time AND hora_cierre = '18:00:00'::time);
  END IF;
END;
$hours_constraint$;

CREATE OR REPLACE FUNCTION public.carwash_validate_reservation_slot(
  p_autolavado_id text,
  p_servicio_id text,
  p_hora time without time zone
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_duration_minutes integer;
  v_service_active boolean;
  v_start_minutes integer;
BEGIN
  IF p_hora IS NULL THEN
    RAISE EXCEPTION 'A reservation time is required.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.autolavados AS wash
    WHERE wash.id::text = p_autolavado_id
      AND wash.hora_apertura = '07:00:00'::time
      AND wash.hora_cierre = '18:00:00'::time
  ) THEN
    RAISE EXCEPTION 'Reservation hours must be between 07:00 and 18:00.' USING ERRCODE = '22023';
  END IF;

  SELECT service.duracion_minutos::integer, service.activo
  INTO v_duration_minutes, v_service_active
  FROM public.servicios AS service
  WHERE service.id::text = p_servicio_id
    AND service.autolavado_id::text = p_autolavado_id;

  IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 OR v_service_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'The selected service is not available.' USING ERRCODE = '22023';
  END IF;

  v_start_minutes := extract(hour FROM p_hora)::integer * 60
    + extract(minute FROM p_hora)::integer;
  IF extract(second FROM p_hora) <> 0 OR pg_catalog.mod(v_start_minutes, 30) <> 0 THEN
    RAISE EXCEPTION 'Reservation times must use 30-minute intervals.' USING ERRCODE = '22023';
  END IF;
  IF v_start_minutes < 420 OR v_start_minutes + v_duration_minutes > 1080 THEN
    RAISE EXCEPTION 'The selected time must be between 07:00 and 18:00.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_set_reservation_end_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_duration_minutes integer;
BEGIN
  SELECT service.duracion_minutos::integer
  INTO v_duration_minutes
  FROM public.servicios AS service
  WHERE service.id::text = NEW.servicio_id::text;

  IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'The selected service has no valid duration.' USING ERRCODE = '22023';
  END IF;

  NEW.hora_fin := NEW.hora_inicio + (v_duration_minutes || ' minutes')::interval;
  RETURN NEW;
END;
$$;

UPDATE public.reservaciones AS reservation
SET hora_fin = reservation.hora_inicio + (service.duracion_minutos::text || ' minutes')::interval
FROM public.servicios AS service
WHERE service.id::text = reservation.servicio_id::text
  AND reservation.hora_fin IS NULL
  AND service.duracion_minutos IS NOT NULL
  AND service.duracion_minutos > 0;

DROP TRIGGER IF EXISTS carwash_reservation_end_time ON public.reservaciones;
CREATE TRIGGER carwash_reservation_end_time
BEFORE INSERT OR UPDATE OF servicio_id, hora_inicio ON public.reservaciones
FOR EACH ROW
EXECUTE FUNCTION public.carwash_set_reservation_end_time();

CREATE OR REPLACE FUNCTION public.carwash_reservation_overlap_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado::text NOT IN ('pendiente', 'confirmada', 'cliente_llego', 'en_espera', 'en_lavado') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reservaciones AS existing
    LEFT JOIN public.servicios AS existing_service
      ON existing_service.id::text = existing.servicio_id::text
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
      AND COALESCE(NEW.hora_fin, NEW.hora_inicio) > existing.hora_inicio
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

DO $remove_legacy_reservation_history_triggers$
DECLARE
  trigger_row record;
BEGIN
  FOR trigger_row IN
    SELECT trigger_metadata.tgname
    FROM pg_catalog.pg_trigger AS trigger_metadata
    JOIN pg_catalog.pg_proc AS trigger_function
      ON trigger_function.oid = trigger_metadata.tgfoid
    WHERE trigger_metadata.tgrelid = 'public.reservaciones'::pg_catalog.regclass
      AND NOT trigger_metadata.tgisinternal
      AND trigger_metadata.tgname <> 'carwash_reservation_history'
      AND pg_catalog.pg_get_functiondef(trigger_function.oid) ~* '(reservation_id|reservation_history|historial_reservacion)'
  LOOP
    EXECUTE pg_catalog.format(
      'DROP TRIGGER IF EXISTS %I ON public.reservaciones',
      trigger_row.tgname
    );
  END LOOP;
END;
$remove_legacy_reservation_history_triggers$;

CREATE OR REPLACE FUNCTION public.carwash_record_reservation_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text := NULLIF(pg_catalog.current_setting('carwash.actor_id', true), '');
  v_actor_role text := NULLIF(pg_catalog.current_setting('carwash.actor_role', true), '');
  v_previous_status text := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.estado::text END;
  v_columns text := '';
  v_values text := '';
  v_parameter integer;
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
  column_row record;
BEGIN
  IF TG_OP = 'INSERT' OR OLD.estado::text IS DISTINCT FROM NEW.estado::text THEN
    FOR column_row IN
      SELECT column_metadata.attname,
        pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod) AS column_type
      FROM pg_catalog.pg_attribute AS column_metadata
      WHERE column_metadata.attrelid = 'public.historial_reservacion'::pg_catalog.regclass
        AND column_metadata.attnum > 0
        AND NOT column_metadata.attisdropped
        AND column_metadata.attname IN (
          'reservation_id', 'reservacion_id', 'id_reservacion',
          'estado_anterior', 'previous_status', 'old_status',
          'estado_nuevo', 'new_status', 'estado', 'status',
          'usuario_id', 'user_id', 'actor_id', 'actor_rol', 'actor_role',
          'fecha_cambio', 'changed_at', 'created_at', 'notas', 'notes'
        )
      ORDER BY column_metadata.attnum
    LOOP
      v_parameter := CASE
        WHEN column_row.attname IN ('reservation_id', 'reservacion_id', 'id_reservacion') THEN 1
        WHEN column_row.attname IN ('estado_anterior', 'previous_status', 'old_status') THEN 2
        WHEN column_row.attname IN ('estado_nuevo', 'new_status', 'estado', 'status') THEN 3
        WHEN column_row.attname IN ('usuario_id', 'user_id') THEN 4
        WHEN column_row.attname = 'actor_id' THEN 5
        WHEN column_row.attname IN ('actor_rol', 'actor_role') THEN 6
        WHEN column_row.attname IN ('fecha_cambio', 'changed_at') THEN 7
        WHEN column_row.attname = 'created_at' THEN 8
        ELSE 9
      END;
      v_columns := pg_catalog.concat_ws(', ', v_columns, pg_catalog.format('%I', column_row.attname));
      v_values := pg_catalog.concat_ws(', ', v_values, pg_catalog.format('($%s)::%s', v_parameter, column_row.column_type));
    END LOOP;

    IF v_columns <> '' THEN
      EXECUTE pg_catalog.format(
        'INSERT INTO public.historial_reservacion (%s) VALUES (%s)',
        v_columns,
        v_values
      ) USING NEW.id::text,
        v_previous_status,
        NEW.estado::text,
        NEW.usuario_id::text,
        v_actor_id,
        COALESCE(v_actor_role, 'sistema'),
        v_changed_at,
        v_changed_at,
        NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carwash_reservation_history ON public.reservaciones;
CREATE TRIGGER carwash_reservation_history
AFTER INSERT OR UPDATE OF estado ON public.reservaciones
FOR EACH ROW
EXECUTE FUNCTION public.carwash_record_reservation_history();

CREATE OR REPLACE FUNCTION public.carwash_save_reservation_photo(
  p_session_token text,
  p_reservation_id text,
  p_momento text,
  p_imagen_base64 text
)
RETURNS TABLE (momento text, imagen_base64 text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_status text;
  v_reservation_id_type text;
  v_user_id_type text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_momento IS NULL OR p_momento NOT IN ('antes', 'despues') THEN
    RAISE EXCEPTION 'Invalid photo moment.' USING ERRCODE = '22023';
  END IF;
  IF p_imagen_base64 IS NULL OR pg_catalog.length(p_imagen_base64) < 100
     OR pg_catalog.length(p_imagen_base64) > 3000000 THEN
    RAISE EXCEPTION 'Invalid photo size.' USING ERRCODE = '22023';
  END IF;

  SELECT reservation.estado::text
  INTO v_status
  FROM public.reservaciones AS reservation
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'The reservation could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'Photos cannot be added to a cancelled reservation.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_reservation_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.carwash_fotos_reservacion'::pg_catalog.regclass
    AND column_metadata.attname = 'reservacion_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_user_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.carwash_fotos_reservacion'::pg_catalog.regclass
    AND column_metadata.attname = 'usuario_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  IF v_reservation_id_type IS NULL OR v_user_id_type IS NULL THEN
    RAISE EXCEPTION 'Reservation photo columns are unavailable.' USING ERRCODE = '42703';
  END IF;

  EXECUTE pg_catalog.format(
    'INSERT INTO public.carwash_fotos_reservacion
      (reservacion_id, usuario_id, momento, imagen_base64)
     VALUES (($1)::%1$s, ($2)::%2$s, $3, $4)
     ON CONFLICT ON CONSTRAINT carwash_fotos_reservacion_unica
     DO UPDATE SET imagen_base64 = EXCLUDED.imagen_base64,
                   created_at = pg_catalog.clock_timestamp()',
    v_reservation_id_type,
    v_user_id_type
  ) USING p_reservation_id, v_owner_id, p_momento, p_imagen_base64;

  RETURN QUERY
  SELECT photo.momento, photo.imagen_base64, photo.created_at
  FROM public.carwash_fotos_reservacion AS photo
  WHERE photo.reservacion_id::text = p_reservation_id
    AND photo.momento = p_momento;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_list_reservation_photos(
  p_session_token text,
  p_reservation_id text
)
RETURNS TABLE (momento text, imagen_base64 text, created_at timestamptz)
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
  SELECT photo.momento, photo.imagen_base64, photo.created_at
  FROM public.carwash_fotos_reservacion AS photo
  WHERE photo.reservacion_id::text = p_reservation_id
    AND photo.usuario_id::text = v_owner_id
  ORDER BY photo.momento;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_log_notification(
  p_usuario_id text,
  p_reservation_id text,
  p_payment_id text,
  p_tipo text,
  p_titulo text,
  p_mensaje text,
  p_datos jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_columns text := '';
  v_values text := '';
  v_parameter integer;
  v_notification_id text;
  column_row record;
BEGIN
  FOR column_row IN
    SELECT column_metadata.attname,
      pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod) AS column_type
    FROM pg_catalog.pg_attribute AS column_metadata
    WHERE column_metadata.attrelid = 'public.notificaciones'::pg_catalog.regclass
      AND column_metadata.attnum > 0
      AND NOT column_metadata.attisdropped
      AND column_metadata.attname IN (
        'usuario_id', 'user_id',
        'reservacion_id', 'reservation_id',
        'pago_id', 'payment_id',
        'tipo', 'type', 'titulo', 'title', 'mensaje', 'message', 'body', 'datos', 'data'
      )
    ORDER BY column_metadata.attnum
  LOOP
    v_parameter := CASE
      WHEN column_row.attname IN ('usuario_id', 'user_id') THEN 1
      WHEN column_row.attname IN ('reservacion_id', 'reservation_id') THEN 2
      WHEN column_row.attname IN ('pago_id', 'payment_id') THEN 3
      WHEN column_row.attname IN ('tipo', 'type') THEN 4
      WHEN column_row.attname IN ('titulo', 'title') THEN 5
      WHEN column_row.attname IN ('mensaje', 'message', 'body') THEN 6
      ELSE 7
    END;
    v_columns := pg_catalog.concat_ws(', ', v_columns, pg_catalog.format('%I', column_row.attname));
    v_values := pg_catalog.concat_ws(', ', v_values, pg_catalog.format('($%s)::%s', v_parameter, column_row.column_type));
  END LOOP;

  IF v_columns = '' THEN
    RAISE EXCEPTION 'Notification table columns are unavailable.' USING ERRCODE = '42703';
  END IF;

  EXECUTE pg_catalog.format(
    'INSERT INTO public.notificaciones (%s) VALUES (%s) RETURNING id::text',
    v_columns,
    v_values
  ) INTO v_notification_id
  USING p_usuario_id, p_reservation_id, p_payment_id, p_tipo, p_titulo, p_mensaje, p_datos;

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_set_reservation_end_time() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_reservation_overlap_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_record_reservation_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_save_reservation_photo(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_list_reservation_photos(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_log_notification(text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_log_notification(text, text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.carwash_save_reservation_photo(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_list_reservation_photos(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

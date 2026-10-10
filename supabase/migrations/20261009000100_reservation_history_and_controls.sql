/*
  Reservation control boundary.

  The reservation status history is deliberately server-owned. It records the
  previous and next state plus the actor selected by the RPC transaction-local
  context, so customer, administrator, and Stripe transitions are auditable.
*/

CREATE TABLE IF NOT EXISTS public.historial_reservacion (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  reservacion_id text,
  id_reservacion text,
  estado_anterior text,
  estado_nuevo text,
  estado text,
  usuario_id text,
  actor_id text,
  actor_rol text,
  fecha_cambio timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  notas text
);

ALTER TABLE public.historial_reservacion
  ADD COLUMN IF NOT EXISTS reservacion_id text,
  ADD COLUMN IF NOT EXISTS id_reservacion text,
  ADD COLUMN IF NOT EXISTS estado_anterior text,
  ADD COLUMN IF NOT EXISTS estado_nuevo text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS usuario_id text,
  ADD COLUMN IF NOT EXISTS actor_id text,
  ADD COLUMN IF NOT EXISTS actor_rol text,
  ADD COLUMN IF NOT EXISTS fecha_cambio timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS notas text;

ALTER TABLE public.historial_reservacion
  ALTER COLUMN fecha_cambio SET DEFAULT pg_catalog.clock_timestamp(),
  ALTER COLUMN created_at SET DEFAULT pg_catalog.clock_timestamp();

ALTER TABLE public.autolavados
  ADD COLUMN IF NOT EXISTS hora_apertura time without time zone NOT NULL DEFAULT '07:00:00',
  ADD COLUMN IF NOT EXISTS hora_cierre time without time zone NOT NULL DEFAULT '18:00:00';

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
  v_opening_minutes integer;
  v_closing_minutes integer;
  v_start_minutes integer;
  v_duration_minutes integer;
  v_service_active boolean;
BEGIN
  SELECT
    extract(hour FROM wash.hora_apertura)::integer * 60
      + extract(minute FROM wash.hora_apertura)::integer,
    extract(hour FROM wash.hora_cierre)::integer * 60
      + extract(minute FROM wash.hora_cierre)::integer
  INTO v_opening_minutes, v_closing_minutes
  FROM public.autolavados AS wash
  WHERE wash.id::text = p_autolavado_id;

  IF v_opening_minutes IS NULL OR v_closing_minutes IS NULL
    OR v_closing_minutes <= v_opening_minutes THEN
    RAISE EXCEPTION 'The car wash operating hours are not configured.' USING ERRCODE = '22023';
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
  IF v_start_minutes < v_opening_minutes
    OR v_start_minutes + v_duration_minutes > v_closing_minutes THEN
    RAISE EXCEPTION 'The selected time is outside the car wash operating hours.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_validate_reservation_slot_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.autolavado_id IS DISTINCT FROM OLD.autolavado_id
    OR NEW.servicio_id IS DISTINCT FROM OLD.servicio_id
    OR NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio THEN
    PERFORM public.carwash_validate_reservation_slot(
      NEW.autolavado_id::text,
      NEW.servicio_id::text,
      NEW.hora_inicio
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carwash_reservation_slot_guard ON public.reservaciones;
CREATE TRIGGER carwash_reservation_slot_guard
BEFORE INSERT OR UPDATE OF autolavado_id, servicio_id, hora_inicio ON public.reservaciones
FOR EACH ROW
EXECUTE FUNCTION public.carwash_validate_reservation_slot_trigger();

CREATE INDEX IF NOT EXISTS carwash_reservation_history_reservation_idx
  ON public.historial_reservacion (
    COALESCE(reservacion_id::text, id_reservacion::text),
    fecha_cambio DESC
  );

CREATE INDEX IF NOT EXISTS carwash_reservation_history_actor_idx
  ON public.historial_reservacion (actor_id, fecha_cambio DESC);

ALTER TABLE public.historial_reservacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carwash_deny_client_access ON public.historial_reservacion;
CREATE POLICY carwash_deny_client_access ON public.historial_reservacion
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL PRIVILEGES ON TABLE public.historial_reservacion FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.carwash_record_reservation_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text := NULLIF(pg_catalog.current_setting('carwash.actor_id', true), '');
  v_actor_role text := NULLIF(pg_catalog.current_setting('carwash.actor_role', true), '');
  v_previous_status text := CASE
    WHEN TG_OP = 'INSERT' THEN NULL
    ELSE OLD.estado::text
  END;
BEGIN
  IF TG_OP = 'INSERT' OR OLD.estado::text IS DISTINCT FROM NEW.estado::text THEN
    INSERT INTO public.historial_reservacion (
      reservacion_id,
      id_reservacion,
      estado_anterior,
      estado_nuevo,
      estado,
      usuario_id,
      actor_id,
      actor_rol,
      fecha_cambio,
      created_at
    ) VALUES (
      NEW.id::text,
      NEW.id::text,
      v_previous_status,
      NEW.estado::text,
      NEW.estado::text,
      NEW.usuario_id::text,
      v_actor_id,
      COALESCE(v_actor_role, 'sistema'),
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carwash_reservation_history ON public.reservaciones;
CREATE TRIGGER carwash_reservation_history
AFTER INSERT OR UPDATE OF estado ON public.reservaciones
FOR EACH ROW
EXECUTE FUNCTION public.carwash_record_reservation_history();

CREATE OR REPLACE FUNCTION public.carwash_validate_reservation_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Historical rows remain editable for cancellation/status reconciliation;
  -- only new dates or explicit date changes are restricted.
  IF TG_OP = 'INSERT' OR NEW.fecha IS DISTINCT FROM OLD.fecha THEN
    IF NEW.fecha < CURRENT_DATE
      OR NEW.fecha > (CURRENT_DATE + INTERVAL '1 month')::date THEN
      RAISE EXCEPTION 'Reservations must be between today and one month from today.'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carwash_reservation_window_guard ON public.reservaciones;
CREATE TRIGGER carwash_reservation_window_guard
BEFORE INSERT OR UPDATE OF fecha ON public.reservaciones
FOR EACH ROW
EXECUTE FUNCTION public.carwash_validate_reservation_window();

REVOKE ALL ON FUNCTION public.carwash_record_reservation_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_validate_reservation_window() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_validate_reservation_slot(text, text, time without time zone)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_validate_reservation_slot_trigger()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.historial_reservacion IS
  'Server-owned audit trail for every reservation creation and status transition.';

NOTIFY pgrst, 'reload schema';

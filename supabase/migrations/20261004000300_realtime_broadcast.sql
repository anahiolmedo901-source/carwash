/*
  Private Broadcast contract for customer status synchronization.

  This migration assumes the hosted Supabase Realtime schema provides
  realtime.send(jsonb, text, text, boolean). It has not been executed against
  a hosted project or a local Realtime tenant in this repository.
*/

ALTER TABLE public.espacios_lavado
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'disponible';

ALTER TABLE public.espacios_lavado
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp();

ALTER TABLE public.espacios_lavado
  ALTER COLUMN estado SET DEFAULT 'disponible',
  ALTER COLUMN estado SET NOT NULL;

DO $space_status_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.espacios_lavado'::pg_catalog.regclass
      AND conname = 'carwash_espacios_lavado_estado_check'
  ) THEN
    ALTER TABLE public.espacios_lavado
      ADD CONSTRAINT carwash_espacios_lavado_estado_check
      CHECK (estado IN ('disponible', 'reservado', 'ocupado', 'mantenimiento'));
  END IF;
END;
$space_status_constraint$;

CREATE OR REPLACE FUNCTION public.carwash_realtime_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_realtime_broadcast_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado THEN
    PERFORM realtime.send(
      pg_catalog.jsonb_build_object(
        'id', NEW.id::text,
        'status', NEW.estado::text,
        'updated_at', NEW.updated_at::text
      ),
      'reservation_status',
      pg_catalog.concat('carwash:reservaciones:customer:', NEW.usuario_id::text),
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_realtime_broadcast_space()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado THEN
    PERFORM realtime.send(
      pg_catalog.jsonb_build_object(
        'id', NEW.id::text,
        'status', NEW.estado::text,
        'updated_at', NEW.updated_at::text
      ),
      'space_status',
      pg_catalog.concat('carwash:espacios_lavado:autolavado:', NEW.autolavado_id::text),
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carwash_reservaciones_realtime_touch ON public.reservaciones;
CREATE TRIGGER carwash_reservaciones_realtime_touch
BEFORE UPDATE OF estado ON public.reservaciones
FOR EACH ROW
EXECUTE FUNCTION public.carwash_realtime_touch_updated_at();

DROP TRIGGER IF EXISTS carwash_reservaciones_realtime_broadcast ON public.reservaciones;
CREATE TRIGGER carwash_reservaciones_realtime_broadcast
AFTER INSERT OR UPDATE OF estado ON public.reservaciones
FOR EACH ROW
EXECUTE FUNCTION public.carwash_realtime_broadcast_reservation();

DROP TRIGGER IF EXISTS carwash_espacios_lavado_realtime_touch ON public.espacios_lavado;
CREATE TRIGGER carwash_espacios_lavado_realtime_touch
BEFORE UPDATE OF estado ON public.espacios_lavado
FOR EACH ROW
EXECUTE FUNCTION public.carwash_realtime_touch_updated_at();

DROP TRIGGER IF EXISTS carwash_espacios_lavado_realtime_broadcast ON public.espacios_lavado;
CREATE TRIGGER carwash_espacios_lavado_realtime_broadcast
AFTER INSERT OR UPDATE OF estado ON public.espacios_lavado
FOR EACH ROW
EXECUTE FUNCTION public.carwash_realtime_broadcast_space();

DROP POLICY IF EXISTS carwash_realtime_customer_read ON realtime.messages;
CREATE POLICY carwash_realtime_customer_read
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  private IS TRUE
  AND extension = 'broadcast'
  AND topic = realtime.topic()
  AND realtime.topic() = pg_catalog.concat(
    'carwash:reservaciones:customer:',
    (SELECT auth.jwt() ->> 'sub')
  )
);

DROP POLICY IF EXISTS carwash_realtime_autolavado_read ON realtime.messages;
CREATE POLICY carwash_realtime_autolavado_read
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  private IS TRUE
  AND extension = 'broadcast'
  AND topic = realtime.topic()
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements_text(
      COALESCE((SELECT auth.jwt() -> 'autolavado_ids'), '[]'::jsonb)
    ) AS requested_scope(scope_id)
    WHERE realtime.topic() = pg_catalog.concat(
      'carwash:espacios_lavado:autolavado:',
      requested_scope.scope_id
    )
  )
);

REVOKE ALL ON FUNCTION public.carwash_realtime_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_realtime_broadcast_reservation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_realtime_broadcast_space() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_current_user_id(text) TO service_role;

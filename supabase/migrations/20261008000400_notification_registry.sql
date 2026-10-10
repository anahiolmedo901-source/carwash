/*
  Spanish notification registry contract.

  carwash_push_tokens remains the RPC-facing compatibility table. The trigger
  below mirrors it into dispositivos so existing clients keep working while
  the notification sender has one explicit device registry and delivery log.

  This file can also be pasted by itself in the Supabase SQL Editor. The
  compatibility table is therefore created here when the previous push
  migration has not been run yet.
*/

CREATE TABLE IF NOT EXISTS public.carwash_push_tokens (
  token text PRIMARY KEY,
  usuario_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX IF NOT EXISTS carwash_push_tokens_usuario_id_idx
  ON public.carwash_push_tokens (usuario_id);

ALTER TABLE public.carwash_push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carwash_deny_client_access ON public.carwash_push_tokens;
CREATE POLICY carwash_deny_client_access ON public.carwash_push_tokens
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL PRIVILEGES ON TABLE public.carwash_push_tokens FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.dispositivos (
  token text PRIMARY KEY,
  usuario_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

-- A pre-existing dispositivos table may have been created with a different
-- definition. Add the registry columns without replacing that table or its
-- existing data.
ALTER TABLE public.dispositivos
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS usuario_id text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT pg_catalog.clock_timestamp(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT pg_catalog.clock_timestamp();

CREATE INDEX IF NOT EXISTS carwash_dispositivos_usuario_id_idx
  ON public.dispositivos (usuario_id);

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  usuario_id text NOT NULL,
  reservacion_id text,
  pago_id text,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensaje text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  enviada boolean NOT NULL DEFAULT false,
  leida boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  enviada_at timestamptz
);

ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT extensions.gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS usuario_id text,
  ADD COLUMN IF NOT EXISTS reservacion_id text,
  ADD COLUMN IF NOT EXISTS pago_id text,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS mensaje text,
  ADD COLUMN IF NOT EXISTS datos jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enviada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS leida boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT pg_catalog.clock_timestamp(),
  ADD COLUMN IF NOT EXISTS enviada_at timestamptz;

CREATE INDEX IF NOT EXISTS carwash_notificaciones_usuario_created_idx
  ON public.notificaciones (usuario_id, created_at DESC);

ALTER TABLE public.dispositivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carwash_deny_client_access ON public.dispositivos;
CREATE POLICY carwash_deny_client_access ON public.dispositivos
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL PRIVILEGES ON TABLE public.dispositivos FROM PUBLIC, anon, authenticated;

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carwash_deny_client_access ON public.notificaciones;
CREATE POLICY carwash_deny_client_access ON public.notificaciones
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL PRIVILEGES ON TABLE public.notificaciones FROM PUBLIC, anon, authenticated;

DO $carwash_sync_existing_devices$
DECLARE
  v_token_type text;
  v_usuario_type text;
  v_platform_type text;
  v_enabled_type text;
  v_created_type text;
  v_updated_type text;
BEGIN
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_token_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'token'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_usuario_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'usuario_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_platform_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'platform'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_enabled_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'enabled'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_created_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'created_at'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_updated_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'updated_at'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  EXECUTE pg_catalog.format($sql$
    UPDATE public.dispositivos AS device
    SET usuario_id = source.usuario_id::%2$s,
        platform = source.platform::%3$s,
        enabled = source.enabled::%4$s,
        created_at = source.created_at::%5$s,
        updated_at = source.updated_at::%6$s
    FROM public.carwash_push_tokens AS source
    WHERE device.token::text = source.token::text
  $sql$, v_token_type, v_usuario_type, v_platform_type, v_enabled_type, v_created_type, v_updated_type);

  EXECUTE pg_catalog.format($sql$
    INSERT INTO public.dispositivos
      (token, usuario_id, platform, enabled, created_at, updated_at)
    SELECT source.token::%1$s,
      source.usuario_id::%2$s,
      source.platform::%3$s,
      source.enabled::%4$s,
      source.created_at::%5$s,
      source.updated_at::%6$s
    FROM public.carwash_push_tokens AS source
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.dispositivos AS device
      WHERE device.token::text = source.token::text
    )
  $sql$, v_token_type, v_usuario_type, v_platform_type, v_enabled_type, v_created_type, v_updated_type);
END;
$carwash_sync_existing_devices$;

CREATE OR REPLACE FUNCTION public.carwash_sync_dispositivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_type text;
  v_usuario_type text;
  v_platform_type text;
  v_enabled_type text;
  v_created_type text;
  v_updated_type text;
  v_updated_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.dispositivos
    WHERE token::text = OLD.token::text;
    RETURN OLD;
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_token_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'token'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_usuario_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'usuario_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_platform_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'platform'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_enabled_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'enabled'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_created_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'created_at'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_updated_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.dispositivos'::pg_catalog.regclass
    AND column_metadata.attname = 'updated_at'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  EXECUTE pg_catalog.format($sql$
    UPDATE public.dispositivos AS device
    SET usuario_id = ($1)::%2$s,
        platform = ($2)::%3$s,
        enabled = ($3)::%4$s,
        created_at = ($4)::%5$s,
        updated_at = ($5)::%6$s
    WHERE device.token::text = $6
  $sql$, v_token_type, v_usuario_type, v_platform_type, v_enabled_type, v_created_type, v_updated_type)
  USING NEW.usuario_id::text, NEW.platform::text, NEW.enabled,
    NEW.created_at, NEW.updated_at, NEW.token::text;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    EXECUTE pg_catalog.format($sql$
      INSERT INTO public.dispositivos
        (token, usuario_id, platform, enabled, created_at, updated_at)
      VALUES (($1)::%1$s, ($2)::%2$s, ($3)::%3$s,
        ($4)::%4$s, ($5)::%5$s, ($6)::%6$s)
    $sql$, v_token_type, v_usuario_type, v_platform_type, v_enabled_type, v_created_type, v_updated_type)
    USING NEW.token::text, NEW.usuario_id::text, NEW.platform::text,
      NEW.enabled, NEW.created_at, NEW.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carwash_push_tokens_sync_dispositivo
  ON public.carwash_push_tokens;
CREATE TRIGGER carwash_push_tokens_sync_dispositivo
AFTER INSERT OR UPDATE OR DELETE ON public.carwash_push_tokens
FOR EACH ROW
EXECUTE FUNCTION public.carwash_sync_dispositivo();

REVOKE ALL ON FUNCTION public.carwash_sync_dispositivo() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

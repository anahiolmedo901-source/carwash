CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS password_hash text;

COMMENT ON COLUMN public.usuarios.password_hash IS
  'Out-of-app bcrypt provisioning: extensions.crypt(password, extensions.gen_salt(''bf'', 12)).';

CREATE INDEX IF NOT EXISTS carwash_usuarios_telefono_lookup_idx
  ON public.usuarios (telefono);

CREATE INDEX IF NOT EXISTS carwash_usuarios_normalized_telefono_lookup_idx
  ON public.usuarios ((
    pg_catalog.regexp_replace(
      pg_catalog.btrim(telefono::text),
      '[[:space:]().-]',
      '',
      'g'
    )
  ));

DO $$
DECLARE
  v_usuario_id_type text;
BEGIN
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_usuario_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.usuarios'::pg_catalog.regclass
    AND column_metadata.attname = 'id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_usuario_id_type IS NULL THEN
    RAISE EXCEPTION 'public.usuarios.id is required before creating public.vehiculos';
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE TABLE IF NOT EXISTS public.vehiculos (
      id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
      usuario_id %s NOT NULL REFERENCES public.usuarios(id),
      marca text NOT NULL,
      modelo text NOT NULL,
      anio integer NOT NULL,
      color text NOT NULL,
      placas text NOT NULL,
      tipo text NOT NULL CHECK (tipo IN (''sedan'', ''hatchback'', ''suv'', ''pickup'', ''van'', ''deportivo'', ''otro'')),
      created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
    )',
    v_usuario_id_type
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.carwash_sessions (
  token_hash text PRIMARY KEY,
  usuario_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS carwash_sessions_usuario_id_idx
  ON public.carwash_sessions (usuario_id);

CREATE TABLE IF NOT EXISTS public.carwash_login_attempts (
  phone_key text PRIMARY KEY CHECK (phone_key ~ '^[0-9a-f]{64}$'),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  window_started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

ALTER TABLE public.carwash_login_attempts
  DROP COLUMN IF EXISTS locked_until;

CREATE INDEX IF NOT EXISTS carwash_login_attempts_updated_at_idx
  ON public.carwash_login_attempts (updated_at);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carwash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carwash_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carwash_deny_client_access ON public.usuarios;
CREATE POLICY carwash_deny_client_access ON public.usuarios AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS carwash_deny_client_access ON public.carwash_sessions;
CREATE POLICY carwash_deny_client_access ON public.carwash_sessions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS carwash_deny_client_access ON public.carwash_login_attempts;
CREATE POLICY carwash_deny_client_access ON public.carwash_login_attempts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS carwash_deny_client_access ON public.vehiculos;
CREATE POLICY carwash_deny_client_access ON public.vehiculos AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL PRIVILEGES ON TABLE public.usuarios, public.carwash_sessions, public.carwash_login_attempts, public.vehiculos
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.carwash_current_user_id(p_session_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id text;
BEGIN
  IF p_session_token IS NULL OR p_session_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT stored_session.usuario_id
  INTO v_usuario_id
  FROM public.carwash_sessions AS stored_session
  JOIN public.usuarios AS usuario
    ON usuario.id::text = stored_session.usuario_id
  WHERE stored_session.token_hash = pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex')
    AND stored_session.revoked_at IS NULL
    AND stored_session.expires_at > pg_catalog.clock_timestamp()
    AND usuario.activo IS TRUE
    AND usuario.rol::text = 'cliente'
  LIMIT 1;

  RETURN v_usuario_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_login(p_telefono text, p_password text)
RETURNS TABLE (
  session_token text,
  expires_at timestamptz,
  user_id text,
  nombre text,
  apellido text,
  correo text,
  telefono text,
  rol text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_match_count integer := 0;
  v_user_id text;
  v_password_hash text;
  v_nombre text;
  v_apellido text;
  v_correo text;
  v_telefono text;
  v_activo boolean;
  v_rol text;
  v_password_valid boolean := FALSE;
  v_session_token text;
  v_expires_at timestamptz;
  v_normalized_phone text;
  v_phone_key text;
  v_failed_attempts integer;
  v_window_started_at timestamptz;
  v_now timestamptz;
BEGIN
  v_normalized_phone := pg_catalog.regexp_replace(
    pg_catalog.btrim(COALESCE(p_telefono, '')),
    '[[:space:]().-]',
    '',
    'g'
  );
  IF pg_catalog.char_length(v_normalized_phone) > 32 THEN
    v_normalized_phone := 'invalid-phone-too-long';
  END IF;
  v_phone_key := pg_catalog.encode(extensions.digest(v_normalized_phone, 'sha256'), 'hex');
  v_now := pg_catalog.clock_timestamp();

  DELETE FROM public.carwash_login_attempts AS attempts
  WHERE attempts.updated_at < v_now - INTERVAL '1 day';

  INSERT INTO public.carwash_login_attempts (phone_key, failed_attempts, window_started_at, updated_at)
  VALUES (v_phone_key, 0, v_now, v_now)
  ON CONFLICT (phone_key) DO NOTHING;

  SELECT attempts.failed_attempts, attempts.window_started_at
  INTO v_failed_attempts, v_window_started_at
  FROM public.carwash_login_attempts AS attempts
  WHERE attempts.phone_key = v_phone_key
  FOR UPDATE;

  IF v_window_started_at <= v_now - INTERVAL '15 minutes' THEN
    UPDATE public.carwash_login_attempts AS attempts
    SET failed_attempts = 0,
      window_started_at = v_now,
      updated_at = v_now
    WHERE attempts.phone_key = v_phone_key;
    v_failed_attempts := 0;
  END IF;

  IF v_normalized_phone ~ '^\+?[0-9]{7,15}$' THEN
    SELECT
      pg_catalog.count(*)::integer,
      (pg_catalog.array_agg(usuario.id::text))[1],
      (pg_catalog.array_agg(usuario.password_hash))[1],
      (pg_catalog.array_agg(usuario.nombre))[1],
      (pg_catalog.array_agg(usuario.apellido))[1],
      (pg_catalog.array_agg(usuario.correo))[1],
      (pg_catalog.array_agg(usuario.telefono))[1],
      (pg_catalog.array_agg(usuario.activo))[1],
      (pg_catalog.array_agg(usuario.rol::text))[1]
    INTO
      v_match_count,
      v_user_id,
      v_password_hash,
      v_nombre,
      v_apellido,
      v_correo,
      v_telefono,
      v_activo,
      v_rol
    FROM public.usuarios AS usuario
    WHERE pg_catalog.regexp_replace(
      pg_catalog.btrim(usuario.telefono::text),
      '[[:space:]().-]',
      '',
      'g'
    ) = v_normalized_phone;
  END IF;

  IF v_match_count = 1
    AND v_activo IS TRUE
    AND v_rol = 'cliente'
    AND p_password IS NOT NULL
    AND v_password_hash ~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' THEN
    v_password_valid := extensions.crypt(p_password, v_password_hash) = v_password_hash;
  ELSE
    PERFORM extensions.crypt(COALESCE(p_password, ''), extensions.gen_salt('bf', 12));
  END IF;

  IF v_password_valid IS DISTINCT FROM TRUE THEN
    PERFORM pg_catalog.pg_sleep(
      LEAST(
        8::double precision,
        pg_catalog.power(2::double precision, LEAST(v_failed_attempts, 5)) / 4
      )
    );

    UPDATE public.carwash_login_attempts AS attempts
    SET failed_attempts = LEAST(v_failed_attempts + 1, 5),
      updated_at = v_now
    WHERE attempts.phone_key = v_phone_key;
    RETURN;
  END IF;

  DELETE FROM public.carwash_login_attempts AS attempts
  WHERE attempts.phone_key = v_phone_key;

  v_session_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := pg_catalog.clock_timestamp() + INTERVAL '7 days';

  INSERT INTO public.carwash_sessions (token_hash, usuario_id, expires_at)
  VALUES (
    pg_catalog.encode(extensions.digest(v_session_token, 'sha256'), 'hex'),
    v_user_id,
    v_expires_at
  );

  RETURN QUERY
  SELECT v_session_token, v_expires_at, v_user_id, v_nombre, v_apellido, v_correo, v_telefono, 'cliente'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_restore_session(p_session_token text)
RETURNS TABLE (
  expires_at timestamptz,
  user_id text,
  nombre text,
  apellido text,
  correo text,
  telefono text,
  rol text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id text;
BEGIN
  v_usuario_id := public.carwash_current_user_id(p_session_token);
  IF v_usuario_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT stored_session.expires_at, usuario.id::text, usuario.nombre, usuario.apellido,
    usuario.correo, usuario.telefono, usuario.rol::text
  FROM public.carwash_sessions AS stored_session
  JOIN public.usuarios AS usuario
    ON usuario.id::text = stored_session.usuario_id
  WHERE stored_session.token_hash = pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex')
    AND stored_session.usuario_id = v_usuario_id
    AND stored_session.revoked_at IS NULL
    AND stored_session.expires_at > pg_catalog.clock_timestamp()
    AND usuario.activo IS TRUE
    AND usuario.rol::text = 'cliente';
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_revoke_session(p_session_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_session_token IS NULL OR p_session_token !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  UPDATE public.carwash_sessions AS stored_session
  SET revoked_at = pg_catalog.clock_timestamp()
  WHERE stored_session.token_hash = pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex')
    AND stored_session.revoked_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_list_vehicles(p_session_token text)
RETURNS TABLE (
  id text,
  marca text,
  modelo text,
  anio integer,
  color text,
  placas text,
  tipo text,
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
  SELECT vehicle.id::text, vehicle.marca::text, vehicle.modelo::text, vehicle.anio::integer,
    vehicle.color::text, vehicle.placas::text, vehicle.tipo::text,
    vehicle.created_at::timestamptz, vehicle.updated_at::timestamptz
  FROM public.vehiculos AS vehicle
  WHERE vehicle.usuario_id::text = v_owner_id
  ORDER BY vehicle.updated_at DESC, vehicle.id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_get_vehicle(p_session_token text, p_vehicle_id text)
RETURNS TABLE (
  id text,
  marca text,
  modelo text,
  anio integer,
  color text,
  placas text,
  tipo text,
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
  SELECT vehicle.id::text, vehicle.marca::text, vehicle.modelo::text, vehicle.anio::integer,
    vehicle.color::text, vehicle.placas::text, vehicle.tipo::text,
    vehicle.created_at::timestamptz, vehicle.updated_at::timestamptz
  FROM public.vehiculos AS vehicle
  WHERE vehicle.id::text = p_vehicle_id
    AND vehicle.usuario_id::text = v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_create_vehicle(
  p_session_token text,
  p_marca text,
  p_modelo text,
  p_anio integer,
  p_color text,
  p_placas text,
  p_tipo text
)
RETURNS TABLE (
  id text,
  marca text,
  modelo text,
  anio integer,
  color text,
  placas text,
  tipo text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_owner_id_type text;
  v_vehicle_type text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('sedan', 'hatchback', 'suv', 'pickup', 'van', 'deportivo', 'otro') THEN
    RAISE EXCEPTION 'Invalid vehicle type.' USING ERRCODE = '22023';
  END IF;
  IF p_marca IS NULL OR pg_catalog.btrim(p_marca) = ''
    OR p_modelo IS NULL OR pg_catalog.btrim(p_modelo) = ''
    OR p_anio IS NULL OR p_anio < 1886
    OR p_color IS NULL OR pg_catalog.btrim(p_color) = ''
    OR p_placas IS NULL OR pg_catalog.btrim(p_placas) = '' THEN
    RAISE EXCEPTION 'Invalid vehicle details.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_owner_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.vehiculos'::pg_catalog.regclass
    AND column_metadata.attname = 'usuario_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_vehicle_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.vehiculos'::pg_catalog.regclass
    AND column_metadata.attname = 'tipo'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_owner_id_type IS NULL OR v_vehicle_type IS NULL THEN
    RAISE EXCEPTION 'public.vehiculos must provide usuario_id and tipo columns.';
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format(
    'INSERT INTO public.vehiculos (usuario_id, marca, modelo, anio, color, placas, tipo)
     VALUES (($1)::%s, $2, $3, $4, $5, $6, ($7)::%s)
     RETURNING id::text, marca::text, modelo::text, anio::integer, color::text,
       placas::text, tipo::text, created_at::timestamptz, updated_at::timestamptz',
    v_owner_id_type,
    v_vehicle_type
  ) USING v_owner_id, pg_catalog.btrim(p_marca), pg_catalog.btrim(p_modelo), p_anio,
    pg_catalog.btrim(p_color), pg_catalog.btrim(p_placas), p_tipo;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_update_vehicle(
  p_session_token text,
  p_vehicle_id text,
  p_marca text,
  p_modelo text,
  p_anio integer,
  p_color text,
  p_placas text,
  p_tipo text
)
RETURNS TABLE (
  id text,
  marca text,
  modelo text,
  anio integer,
  color text,
  placas text,
  tipo text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_vehicle_type text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('sedan', 'hatchback', 'suv', 'pickup', 'van', 'deportivo', 'otro') THEN
    RAISE EXCEPTION 'Invalid vehicle type.' USING ERRCODE = '22023';
  END IF;
  IF p_marca IS NULL OR pg_catalog.btrim(p_marca) = ''
    OR p_modelo IS NULL OR pg_catalog.btrim(p_modelo) = ''
    OR p_anio IS NULL OR p_anio < 1886
    OR p_color IS NULL OR pg_catalog.btrim(p_color) = ''
    OR p_placas IS NULL OR pg_catalog.btrim(p_placas) = '' THEN
    RAISE EXCEPTION 'Invalid vehicle details.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_vehicle_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.vehiculos'::pg_catalog.regclass
    AND column_metadata.attname = 'tipo'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  IF v_vehicle_type IS NULL THEN
    RAISE EXCEPTION 'public.vehiculos.tipo is required.';
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format(
    'UPDATE public.vehiculos AS vehicle
     SET marca = $1, modelo = $2, anio = $3, color = $4, placas = $5,
       tipo = ($6)::%s, updated_at = pg_catalog.clock_timestamp()
         WHERE vehicle.id::text = $7 AND vehicle.usuario_id::text = $8
         RETURNING vehicle.id::text, vehicle.marca::text, vehicle.modelo::text,
           vehicle.anio::integer, vehicle.color::text, vehicle.placas::text,
           vehicle.tipo::text, vehicle.created_at::timestamptz, vehicle.updated_at::timestamptz',
    v_vehicle_type
  ) USING pg_catalog.btrim(p_marca), pg_catalog.btrim(p_modelo), p_anio,
    pg_catalog.btrim(p_color), pg_catalog.btrim(p_placas), p_tipo, p_vehicle_id, v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_delete_vehicle(p_session_token text, p_vehicle_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_deleted_count integer;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.vehiculos AS vehicle
  WHERE vehicle.id::text = p_vehicle_id
    AND vehicle.usuario_id::text = v_owner_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_current_user_id(text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.carwash_login(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_restore_session(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_revoke_session(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_list_vehicles(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_get_vehicle(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_create_vehicle(text, text, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_update_vehicle(text, text, text, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_delete_vehicle(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_restore_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_revoke_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_list_vehicles(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_get_vehicle(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_create_vehicle(text, text, text, integer, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_update_vehicle(text, text, text, text, integer, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_delete_vehicle(text, text) TO anon, authenticated;

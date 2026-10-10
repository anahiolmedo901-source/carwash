/*
  Employee authentication and assignment boundary.

  This migration assumes that the existing database provides:
  - public.usuarios(id, activo, rol, password_hash, nombre, apellido, correo, telefono)
  - public.autolavados(id)
  - public.carwash_sessions(token_hash, usuario_id, expires_at, revoked_at)
  - the extensions schema and pgcrypto extension from custom auth migration

  Employee assignment rows are provisioned by a trusted server boundary. No
  employee operation RPC or direct client table privilege is defined here.
*/

DO $employee_assignment_schema$
DECLARE
  v_empleado_id_type text;
  v_autolavado_id_type text;
BEGIN
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_empleado_id_type
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

  IF v_empleado_id_type IS NULL OR v_autolavado_id_type IS NULL THEN
    RAISE EXCEPTION 'Employee assignments require conventional id columns on usuarios and autolavados.';
  END IF;

  EXECUTE pg_catalog.format($sql$
    CREATE TABLE IF NOT EXISTS public.empleado_autolavados (
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      empleado_id %s NOT NULL REFERENCES public.usuarios(id),
      autolavado_id %s NOT NULL REFERENCES public.autolavados(id),
      activo boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
    )
  $sql$, v_empleado_id_type, v_autolavado_id_type);
END;
$employee_assignment_schema$;

COMMENT ON TABLE public.empleado_autolavados IS
  'Server-owned active employee-to-car-wash assignments. Client roles have no direct table access.';

CREATE UNIQUE INDEX IF NOT EXISTS carwash_empleado_autolavados_active_pair_idx
  ON public.empleado_autolavados (empleado_id, autolavado_id)
  WHERE activo IS TRUE;

CREATE INDEX IF NOT EXISTS carwash_empleado_autolavados_active_employee_idx
  ON public.empleado_autolavados (empleado_id)
  WHERE activo IS TRUE;

ALTER TABLE public.empleado_autolavados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carwash_deny_client_access ON public.empleado_autolavados;
CREATE POLICY carwash_deny_client_access ON public.empleado_autolavados AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL PRIVILEGES ON TABLE public.empleado_autolavados FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.carwash_current_employee_id(p_session_token text)
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
    AND usuario.rol::text = 'empleado'
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
    AND v_rol IN ('cliente', 'empleado')
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
  SELECT v_session_token, v_expires_at, v_user_id, v_nombre, v_apellido, v_correo, v_telefono, v_rol::text;
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
  v_customer_id text;
  v_employee_id text;
  v_usuario_id text;
BEGIN
  v_customer_id := public.carwash_current_user_id(p_session_token);
  v_employee_id := public.carwash_current_employee_id(p_session_token);
  v_usuario_id := COALESCE(v_customer_id, v_employee_id);
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
    AND usuario.rol::text IN ('cliente', 'empleado');
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_current_employee_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_login(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_restore_session(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_restore_session(text) TO anon, authenticated;

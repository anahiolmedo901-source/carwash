/*
  Authentication result compatibility for legacy usuarios column types.

  The app consumes text fields through the custom-session RPCs. Explicit casts
  keep PostgreSQL's RETURNS TABLE contract stable when usuarios uses varchar,
  citext, or another compatible legacy type.
*/

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
      (pg_catalog.array_agg(usuario.password_hash::text))[1],
      (pg_catalog.array_agg(usuario.nombre::text))[1],
      (pg_catalog.array_agg(usuario.apellido::text))[1],
      (pg_catalog.array_agg(usuario.correo::text))[1],
      (pg_catalog.array_agg(usuario.telefono::text))[1],
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
    AND v_rol IN ('cliente', 'empleado', 'administrador')
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
  SELECT v_session_token::text,
    v_expires_at::timestamptz,
    v_user_id::text,
    v_nombre::text,
    v_apellido::text,
    v_correo::text,
    v_telefono::text,
    v_rol::text;
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
BEGIN
  IF p_session_token IS NULL OR p_session_token !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT stored_session.expires_at::timestamptz,
    usuario.id::text,
    usuario.nombre::text,
    usuario.apellido::text,
    usuario.correo::text,
    usuario.telefono::text,
    usuario.rol::text
  FROM public.carwash_sessions AS stored_session
  JOIN public.usuarios AS usuario
    ON usuario.id::text = stored_session.usuario_id::text
  WHERE stored_session.token_hash = pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex')
    AND stored_session.revoked_at IS NULL
    AND stored_session.expires_at > pg_catalog.clock_timestamp()
    AND usuario.activo IS TRUE
    AND usuario.rol::text IN ('cliente', 'empleado', 'administrador');
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_login(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_restore_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_restore_session(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

/*
  Push notification device registry.

  The app uses opaque custom sessions instead of Supabase Auth. Tokens are
  therefore written only through these SECURITY DEFINER RPCs; clients never
  receive direct table privileges. The Edge Function reads this table with
  service_role when a database webhook reports a reservation status change.
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

CREATE OR REPLACE FUNCTION public.carwash_push_current_user_id(p_session_token text)
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
    AND usuario.rol::text IN ('cliente', 'empleado', 'administrador')
  LIMIT 1;

  RETURN v_usuario_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_register_push_token(
  p_session_token text,
  p_token text,
  p_platform text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id text;
  v_token text;
BEGIN
  v_usuario_id := public.carwash_push_current_user_id(p_session_token);
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  v_token := NULLIF(pg_catalog.btrim(p_token), '');
  IF v_token IS NULL
    OR pg_catalog.length(v_token) > 512
    OR v_token !~ '^(Expo|Exponent)PushToken\[[^]]+\]$'
    OR p_platform IS NULL
    OR p_platform NOT IN ('android', 'ios') THEN
    RAISE EXCEPTION 'Invalid push token details.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.carwash_push_tokens AS push_token
    (token, usuario_id, platform, enabled)
  VALUES (v_token, v_usuario_id, p_platform, true)
  ON CONFLICT (token) DO UPDATE
    SET usuario_id = EXCLUDED.usuario_id,
        platform = EXCLUDED.platform,
        enabled = true,
        updated_at = pg_catalog.clock_timestamp();

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_unregister_push_token(
  p_session_token text,
  p_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id text;
  v_deleted_count integer;
BEGIN
  v_usuario_id := public.carwash_push_current_user_id(p_session_token);
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.carwash_push_tokens AS push_token
  WHERE push_token.token = NULLIF(pg_catalog.btrim(p_token), '')
    AND push_token.usuario_id = v_usuario_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_push_current_user_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_register_push_token(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_unregister_push_token(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_register_push_token(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_unregister_push_token(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

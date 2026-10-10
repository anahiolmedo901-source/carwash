/*
  Customer registration for the existing opaque-session authentication flow.

  The function is the only client-facing write boundary for registration. It
  owns the customer role and active state, and returns only the safe profile
  fields needed by the application before the user signs in.
 */

REVOKE ALL PRIVILEGES ON TABLE public.usuarios
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.carwash_register(
  p_nombre text,
  p_apellido text,
  p_correo text,
  p_telefono text,
  p_password text
)
RETURNS TABLE (
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
  v_nombre text;
  v_apellido text;
  v_correo text;
  v_normalized_phone text;
  v_phone_exists boolean;
BEGIN
  v_nombre := pg_catalog.btrim(COALESCE(p_nombre, ''));
  v_apellido := pg_catalog.btrim(COALESCE(p_apellido, ''));
  v_correo := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_correo, '')));
  v_normalized_phone := pg_catalog.regexp_replace(
    pg_catalog.btrim(COALESCE(p_telefono, '')),
    '[[:space:]().-]',
    '',
    'g'
  );

  IF v_nombre = ''
    OR pg_catalog.char_length(v_nombre) > 100
    OR v_apellido = ''
    OR pg_catalog.char_length(v_apellido) > 100
    OR v_correo = ''
    OR pg_catalog.char_length(v_correo) > 320
    OR v_correo !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR v_normalized_phone !~ '^\+?[0-9]{7,15}$'
    OR p_password IS NULL
    OR pg_catalog.char_length(p_password) < 8
    OR pg_catalog.char_length(p_password) > 128
    OR pg_catalog.octet_length(p_password) > 72
    OR p_password !~ '[a-z]'
    OR p_password !~ '[A-Z]'
    OR p_password !~ '[0-9]' THEN
    RAISE EXCEPTION 'Invalid registration details.'
      USING ERRCODE = '22023', DETAIL = 'customer_registration_invalid_input';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_normalized_phone, 0)
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios AS usuario
    WHERE pg_catalog.regexp_replace(
      pg_catalog.btrim(usuario.telefono::text),
      '[[:space:]().-]',
      '',
      'g'
    ) = v_normalized_phone
  )
  INTO v_phone_exists;

  IF v_phone_exists THEN
    RAISE EXCEPTION 'A customer account already exists for this phone number.'
      USING ERRCODE = '23505', DETAIL = 'customer_registration_duplicate_phone';
  END IF;

  RETURN QUERY
  INSERT INTO public.usuarios AS usuario (
    nombre,
    apellido,
    correo,
    telefono,
    rol,
    activo,
    password_hash
  )
  VALUES (
    v_nombre,
    v_apellido,
    v_correo,
    v_normalized_phone,
    'cliente',
    TRUE,
    extensions.crypt(p_password, extensions.gen_salt('bf', 12))
  )
  RETURNING usuario.id::text,
    usuario.nombre::text,
    usuario.apellido::text,
    usuario.correo::text,
    usuario.telefono::text,
    usuario.rol::text;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_register(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_register(text, text, text, text, text)
  TO anon, authenticated;

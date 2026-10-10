/*
  1) Fotografías antes/después por reservación (guardadas en la base de datos).
     Acceso solo mediante RPC con la sesión del cliente; la tabla no es legible
     directamente desde el cliente.
  2) Asegura que el catálogo de autolavados sea legible para el cliente.
 */

CREATE TABLE IF NOT EXISTS public.carwash_fotos_reservacion (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  reservacion_id text NOT NULL,
  usuario_id text NOT NULL,
  momento text NOT NULL CHECK (momento IN ('antes', 'despues')),
  imagen_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT carwash_fotos_reservacion_unica UNIQUE (reservacion_id, momento)
);

ALTER TABLE public.carwash_fotos_reservacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carwash_deny_client_access ON public.carwash_fotos_reservacion;
CREATE POLICY carwash_deny_client_access ON public.carwash_fotos_reservacion
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.carwash_fotos_reservacion FROM PUBLIC, anon, authenticated;

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
#variable_conflict use_column
DECLARE
  v_owner_id text;
  v_status text;
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

  SELECT reservation.estado::text INTO v_status
  FROM public.reservaciones AS reservation
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'The reservation could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'Photos cannot be added to a cancelled reservation.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.carwash_fotos_reservacion AS photo
    (reservacion_id, usuario_id, momento, imagen_base64)
  VALUES (p_reservation_id, v_owner_id, p_momento, p_imagen_base64)
  ON CONFLICT ON CONSTRAINT carwash_fotos_reservacion_unica
  DO UPDATE SET imagen_base64 = EXCLUDED.imagen_base64,
                created_at = pg_catalog.clock_timestamp();

  RETURN QUERY
  SELECT photo.momento, photo.imagen_base64, photo.created_at
  FROM public.carwash_fotos_reservacion AS photo
  WHERE photo.reservacion_id = p_reservation_id AND photo.momento = p_momento;
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
#variable_conflict use_column
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
  WHERE photo.reservacion_id = p_reservation_id
    AND photo.usuario_id = v_owner_id
  ORDER BY photo.momento;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_save_reservation_photo(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_list_reservation_photos(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_save_reservation_photo(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_list_reservation_photos(text, text) TO anon, authenticated;

-- Catálogo de autolavados legible para los clientes (tabla y vista, si existe).
ALTER TABLE public.autolavados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carwash_public_catalog_read ON public.autolavados;
CREATE POLICY carwash_public_catalog_read ON public.autolavados
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON TABLE public.autolavados TO anon, authenticated;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.vista_autolavados') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.vista_autolavados TO anon, authenticated';
  END IF;
END;
$$;

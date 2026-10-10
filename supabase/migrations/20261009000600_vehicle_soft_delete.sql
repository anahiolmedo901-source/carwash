/*
  Customer vehicle soft deletion.

  Vehicles remain referenced by historical reservations and payments. A customer
  can therefore deactivate only an owned vehicle without deleting its row.
  Direct table access remains denied; the opaque-session RPC boundary enforces
  ownership because this project does not use Supabase Auth identities.
*/

ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS activo boolean,
  ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;

UPDATE public.vehiculos
SET activo = true
WHERE activo IS NULL;

ALTER TABLE public.vehiculos
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN activo SET NOT NULL;

CREATE INDEX IF NOT EXISTS carwash_vehiculos_owner_active_idx
  ON public.vehiculos (usuario_id, activo, updated_at DESC);

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
  SELECT vehicle.id::text,
    vehicle.marca::text,
    vehicle.modelo::text,
    vehicle.anio::integer,
    vehicle.color::text,
    vehicle.placas::text,
    vehicle.tipo::text,
    vehicle.created_at::timestamptz,
    vehicle.updated_at::timestamptz
  FROM public.vehiculos AS vehicle
  WHERE vehicle.usuario_id::text = v_owner_id
    AND vehicle.activo IS TRUE
  ORDER BY vehicle.updated_at DESC, vehicle.id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_get_vehicle(
  p_session_token text,
  p_vehicle_id text
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
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT vehicle.id::text,
    vehicle.marca::text,
    vehicle.modelo::text,
    vehicle.anio::integer,
    vehicle.color::text,
    vehicle.placas::text,
    vehicle.tipo::text,
    vehicle.created_at::timestamptz,
    vehicle.updated_at::timestamptz
  FROM public.vehiculos AS vehicle
  WHERE vehicle.id::text = p_vehicle_id
    AND vehicle.usuario_id::text = v_owner_id
    AND vehicle.activo IS TRUE;
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
     SET marca = $1,
       modelo = $2,
       anio = $3,
       color = $4,
       placas = $5,
       tipo = ($6)::%s,
       updated_at = pg_catalog.clock_timestamp()
     WHERE vehicle.id::text = $7
       AND vehicle.usuario_id::text = $8
       AND vehicle.activo IS TRUE
     RETURNING vehicle.id::text,
       vehicle.marca::text,
       vehicle.modelo::text,
       vehicle.anio::integer,
       vehicle.color::text,
       vehicle.placas::text,
       vehicle.tipo::text,
       vehicle.created_at::timestamptz,
       vehicle.updated_at::timestamptz',
    v_vehicle_type
  ) USING pg_catalog.btrim(p_marca),
    pg_catalog.btrim(p_modelo),
    p_anio,
    pg_catalog.btrim(p_color),
    pg_catalog.btrim(p_placas),
    p_tipo,
    p_vehicle_id,
    v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_delete_vehicle(
  p_session_token text,
  p_vehicle_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_active boolean;
  v_updated_count integer;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_vehicle_id IS NULL OR pg_catalog.btrim(p_vehicle_id) = '' THEN
    RAISE EXCEPTION 'A vehicle id is required.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat('carwash-vehicle-mutation:', p_vehicle_id),
      0
    )
  );

  SELECT vehicle.activo
  INTO v_active
  FROM public.vehiculos AS vehicle
  WHERE vehicle.id::text = p_vehicle_id
    AND vehicle.usuario_id::text = v_owner_id
  FOR UPDATE;

  IF NOT FOUND OR v_active IS DISTINCT FROM TRUE THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reservaciones AS reservation
    WHERE reservation.vehiculo_id::text = p_vehicle_id
      AND reservation.estado::text IN (
        'pendiente',
        'confirmada',
        'cliente_llego',
        'en_espera',
        'en_lavado'
      )
  ) THEN
    RAISE EXCEPTION
      'This vehicle has active reservations. Cancel them or wait until they finish before deleting it.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.vehiculos AS vehicle
  SET activo = false,
    eliminado_en = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  WHERE vehicle.id::text = p_vehicle_id
    AND vehicle.usuario_id::text = v_owner_id
    AND vehicle.activo IS TRUE;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_validate_active_vehicle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active boolean;
BEGIN
  SELECT vehicle.activo
  INTO v_active
  FROM public.vehiculos AS vehicle
  WHERE vehicle.id::text = NEW.vehiculo_id::text
  FOR UPDATE;

  IF NOT FOUND OR v_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'The selected vehicle is not available.' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carwash_reservaciones_active_vehicle_guard
  ON public.reservaciones;
CREATE TRIGGER carwash_reservaciones_active_vehicle_guard
  BEFORE INSERT OR UPDATE OF vehiculo_id
  ON public.reservaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.carwash_validate_active_vehicle();

REVOKE ALL ON FUNCTION public.carwash_validate_active_vehicle()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

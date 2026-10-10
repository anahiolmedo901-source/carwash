/*
  Sandbox payment boundary.

  The migration keeps an existing public.pagos table in place. When the table
  is absent, it creates the documented contract and derives foreign-key types
  from the existing reservation and user tables.
*/

DO $payment_schema$
DECLARE
  v_reservation_id_type text;
  v_user_id_type text;
  v_payment_reservation_id_type text;
  v_payment_user_id_type text;
BEGIN
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_reservation_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.reservaciones'::pg_catalog.regclass
    AND column_metadata.attname = 'id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_user_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.usuarios'::pg_catalog.regclass
    AND column_metadata.attname = 'id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_reservation_id_type IS NULL OR v_user_id_type IS NULL THEN
    RAISE EXCEPTION 'Payment relationships require conventional id columns on reservaciones and usuarios.';
  END IF;

  EXECUTE pg_catalog.format($sql$
    CREATE TABLE IF NOT EXISTS public.pagos (
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      reservacion_id %s NOT NULL,
      usuario_id %s NOT NULL,
      monto numeric(12,2) NOT NULL,
      metodo_pago text NOT NULL,
      estado text NOT NULL DEFAULT 'pendiente',
      referencia_externa text,
      fecha_pago timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
      CONSTRAINT carwash_pagos_reservacion_fk
        FOREIGN KEY (reservacion_id) REFERENCES public.reservaciones(id),
      CONSTRAINT carwash_pagos_usuario_fk
        FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id),
      CONSTRAINT carwash_pagos_monto_check
        CHECK (
          monto >= 0
          AND monto <= 9999999999.99
          AND monto = pg_catalog.round(monto::numeric, 2)
        ),
      CONSTRAINT carwash_pagos_metodo_check
        CHECK (metodo_pago IN ('tarjeta_credito', 'tarjeta_debito', 'mercado_pago', 'efectivo', 'otro')),
      CONSTRAINT carwash_pagos_estado_check
        CHECK (estado IN ('pendiente', 'procesando', 'pagado', 'rechazado', 'cancelado', 'reembolsado')),
      CONSTRAINT carwash_pagos_fecha_pago_check
        CHECK (
          (estado IN ('pagado', 'reembolsado') AND fecha_pago IS NOT NULL)
          OR (estado IN ('pendiente', 'procesando', 'rechazado', 'cancelado') AND fecha_pago IS NULL)
        )
    )
  $sql$, v_reservation_id_type, v_user_id_type);

  -- Add absent columns and harden existing definitions without rewriting
  -- values. Existing NULL or invalid values make the migration fail for
  -- operator cleanup instead of being silently normalized.
  EXECUTE pg_catalog.format(
    'ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS reservacion_id %s NOT NULL',
    v_reservation_id_type
  );
  EXECUTE pg_catalog.format(
    'ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS usuario_id %s NOT NULL',
    v_user_id_type
  );
  ALTER TABLE public.pagos
    ADD COLUMN IF NOT EXISTS monto numeric(12,2) NOT NULL,
    ADD COLUMN IF NOT EXISTS metodo_pago text NOT NULL,
    ADD COLUMN IF NOT EXISTS estado text,
    ADD COLUMN IF NOT EXISTS referencia_externa text,
    ADD COLUMN IF NOT EXISTS fecha_pago timestamptz,
    ADD COLUMN IF NOT EXISTS created_at timestamptz;

  ALTER TABLE public.pagos
    ALTER COLUMN reservacion_id SET NOT NULL,
    ALTER COLUMN usuario_id SET NOT NULL,
    ALTER COLUMN monto SET NOT NULL,
    ALTER COLUMN metodo_pago SET NOT NULL,
    ALTER COLUMN estado SET DEFAULT 'pendiente',
    ALTER COLUMN estado SET NOT NULL,
    ALTER COLUMN referencia_externa DROP NOT NULL,
    ALTER COLUMN fecha_pago DROP NOT NULL,
    ALTER COLUMN created_at SET DEFAULT pg_catalog.clock_timestamp(),
    ALTER COLUMN created_at SET NOT NULL;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_reservation_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'reservacion_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_user_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'usuario_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_payment_reservation_id_type IS DISTINCT FROM v_reservation_id_type THEN
    RAISE EXCEPTION 'public.pagos.reservacion_id must match public.reservaciones.id; operator cleanup is required.';
  END IF;
  IF v_payment_user_id_type IS DISTINCT FROM v_user_id_type THEN
    RAISE EXCEPTION 'public.pagos.usuario_id must match public.usuarios.id; operator cleanup is required.';
  END IF;

  -- Replace only application-owned constraints. Unrelated operator constraints
  -- remain untouched, while these definitions validate all existing rows.
  ALTER TABLE public.pagos
    DROP CONSTRAINT IF EXISTS carwash_pagos_reservacion_fk,
    DROP CONSTRAINT IF EXISTS carwash_pagos_usuario_fk,
    DROP CONSTRAINT IF EXISTS carwash_pagos_monto_check,
    DROP CONSTRAINT IF EXISTS carwash_pagos_metodo_check,
    DROP CONSTRAINT IF EXISTS carwash_pagos_estado_check,
    DROP CONSTRAINT IF EXISTS carwash_pagos_fecha_pago_check,
    ADD CONSTRAINT carwash_pagos_reservacion_fk
      FOREIGN KEY (reservacion_id) REFERENCES public.reservaciones(id),
    ADD CONSTRAINT carwash_pagos_usuario_fk
      FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id),
    ADD CONSTRAINT carwash_pagos_monto_check CHECK (
      monto >= 0
      AND monto <= 9999999999.99
      AND monto = pg_catalog.round(monto::numeric, 2)
    ),
    ADD CONSTRAINT carwash_pagos_metodo_check CHECK (
      metodo_pago::text IN ('tarjeta_credito', 'tarjeta_debito', 'mercado_pago', 'efectivo', 'otro')
    ),
    ADD CONSTRAINT carwash_pagos_estado_check CHECK (
      estado::text IN ('pendiente', 'procesando', 'pagado', 'rechazado', 'cancelado', 'reembolsado')
    ),
    ADD CONSTRAINT carwash_pagos_fecha_pago_check CHECK (
      (estado::text IN ('pagado', 'reembolsado') AND fecha_pago IS NOT NULL)
      OR (estado::text IN ('pendiente', 'procesando', 'rechazado', 'cancelado') AND fecha_pago IS NULL)
    );
END;
$payment_schema$;

COMMENT ON TABLE public.pagos IS
  'Server-owned sandbox payment records. Customer writes use the explicit payment RPC boundary.';

CREATE INDEX IF NOT EXISTS carwash_pagos_reservation_lookup_idx
  ON public.pagos (reservacion_id);

CREATE INDEX IF NOT EXISTS carwash_pagos_owner_history_idx
  ON public.pagos (usuario_id, created_at DESC);

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carwash_deny_client_access ON public.pagos;
CREATE POLICY carwash_deny_client_access ON public.pagos AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL PRIVILEGES ON TABLE public.pagos FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.carwash_begin_payment(
  p_session_token text,
  p_reservation_id text,
  p_metodo_pago text
)
RETURNS TABLE (
  id text,
  reservacion_id text,
  monto numeric,
  metodo_pago text,
  estado text,
  referencia_externa text,
  fecha_pago timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_reservation_owner_id text;
  v_reservation_status text;
  v_amount numeric;
  v_payment_id text;
  v_current_status text;
  v_payment_reservation_id_type text;
  v_payment_user_id_type text;
  v_payment_method_type text;
  v_payment_status_type text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_reservation_id IS NULL OR pg_catalog.btrim(p_reservation_id) = ''
    OR p_metodo_pago IS NULL
    OR p_metodo_pago NOT IN ('tarjeta_credito', 'tarjeta_debito', 'mercado_pago', 'efectivo', 'otro') THEN
    RAISE EXCEPTION 'Invalid payment details.' USING ERRCODE = '22023';
  END IF;

  SELECT reservation.usuario_id::text,
    reservation.estado::text,
    service.precio::numeric
  INTO v_reservation_owner_id, v_reservation_status, v_amount
  FROM public.reservaciones AS reservation
  JOIN public.servicios AS service
    ON service.id::text = reservation.servicio_id::text
  WHERE reservation.id::text = p_reservation_id
    AND reservation.usuario_id::text = v_owner_id
  FOR UPDATE OF reservation;

  IF NOT FOUND OR v_reservation_owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'The reservation could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_reservation_status NOT IN ('pendiente', 'confirmada') THEN
    RAISE EXCEPTION 'This reservation cannot receive a payment.' USING ERRCODE = '22023';
  END IF;

  SELECT payment.id::text, payment.estado::text
  INTO v_payment_id, v_current_status
  FROM public.pagos AS payment
  WHERE payment.reservacion_id::text = p_reservation_id
    AND payment.usuario_id::text = v_owner_id
  ORDER BY payment.created_at DESC NULLS LAST, payment.id::text DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND v_current_status = 'pagado' THEN
    IF v_reservation_status <> 'confirmada' THEN
      RAISE EXCEPTION 'The paid reservation is not confirmed.' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
      payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
      payment.fecha_pago::timestamptz, payment.created_at::timestamptz
    FROM public.pagos AS payment
    WHERE payment.id::text = v_payment_id
      AND payment.usuario_id::text = v_owner_id;
    RETURN;
  END IF;

  IF FOUND AND v_current_status IN ('pendiente', 'procesando') THEN
    IF v_current_status = 'pendiente' THEN
      SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
      INTO v_payment_method_type
      FROM pg_catalog.pg_attribute AS column_metadata
      WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
        AND column_metadata.attname = 'metodo_pago'
        AND column_metadata.attnum > 0
        AND NOT column_metadata.attisdropped;

      EXECUTE pg_catalog.format(
        'UPDATE public.pagos AS payment
         SET metodo_pago = ($1)::%s
         WHERE payment.id::text = $2 AND payment.usuario_id::text = $3',
        v_payment_method_type
      ) USING p_metodo_pago, v_payment_id, v_owner_id;
    END IF;

    RETURN QUERY
    SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
      payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
      payment.fecha_pago::timestamptz, payment.created_at::timestamptz
    FROM public.pagos AS payment
    WHERE payment.id::text = v_payment_id
      AND payment.usuario_id::text = v_owner_id;
    RETURN;
  END IF;

  IF v_reservation_status <> 'pendiente' THEN
    RAISE EXCEPTION 'The reservation is already confirmed without an open payment.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_reservation_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'reservacion_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_user_id_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'usuario_id'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_method_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'metodo_pago'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;
  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_status_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'estado'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_payment_reservation_id_type IS NULL OR v_payment_user_id_type IS NULL
    OR v_payment_method_type IS NULL OR v_payment_status_type IS NULL THEN
    RAISE EXCEPTION 'public.pagos does not match the documented payment contract.';
  END IF;

  EXECUTE pg_catalog.format(
    'INSERT INTO public.pagos
      (reservacion_id, usuario_id, monto, metodo_pago, estado)
     VALUES (($1)::%1$s, ($2)::%2$s, $3, ($4)::%3$s, ($5)::%4$s)
     RETURNING id::text',
    v_payment_reservation_id_type,
    v_payment_user_id_type,
    v_payment_method_type,
    v_payment_status_type
  ) INTO v_payment_id
  USING p_reservation_id, v_reservation_owner_id, v_amount, p_metodo_pago, 'pendiente';

  RETURN QUERY
  SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
    payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
    payment.fecha_pago::timestamptz, payment.created_at::timestamptz
  FROM public.pagos AS payment
  WHERE payment.id::text = v_payment_id
    AND payment.usuario_id::text = v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_process_sandbox_payment(
  p_session_token text,
  p_payment_id text,
  p_outcome text
)
RETURNS TABLE (
  id text,
  reservacion_id text,
  monto numeric,
  metodo_pago text,
  estado text,
  referencia_externa text,
  fecha_pago timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id text;
  v_reservation_id text;
  v_current_status text;
  v_reservation_status text;
  v_existing_reference text;
  v_existing_paid_at timestamptz;
  v_target_status text;
  v_reference text;
  v_paid_at timestamptz;
  v_updated_count integer;
  v_payment_status_type text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_payment_id IS NULL OR pg_catalog.btrim(p_payment_id) = ''
    OR p_outcome IS NULL
    OR p_outcome NOT IN ('approved', 'pending', 'rejected', 'cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Invalid sandbox payment outcome.' USING ERRCODE = '22023';
  END IF;

  SELECT payment.reservacion_id::text
  INTO v_reservation_id
  FROM public.pagos AS payment
  WHERE payment.id::text = p_payment_id
    AND payment.usuario_id::text = v_owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The payment could not be found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT reservation.estado::text
  INTO v_reservation_status
  FROM public.reservaciones AS reservation
  WHERE reservation.id::text = v_reservation_id
    AND reservation.usuario_id::text = v_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The payment reservation could not be found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT payment.estado::text,
    payment.referencia_externa::text,
    payment.fecha_pago::timestamptz
  INTO v_current_status, v_existing_reference, v_existing_paid_at
  FROM public.pagos AS payment
  WHERE payment.id::text = p_payment_id
    AND payment.usuario_id::text = v_owner_id
    AND payment.reservacion_id::text = v_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The payment could not be found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_status = 'pagado' AND p_outcome = 'approved' THEN
    IF v_reservation_status = 'pendiente' THEN
      UPDATE public.reservaciones AS reservation
      SET estado = 'confirmada', updated_at = pg_catalog.clock_timestamp()
      WHERE reservation.id::text = v_reservation_id
        AND reservation.usuario_id::text = v_owner_id
        AND reservation.estado::text = 'pendiente';
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count = 0 THEN
        RAISE EXCEPTION 'The reservation could not be confirmed.' USING ERRCODE = '40001';
      END IF;
    ELSIF v_reservation_status <> 'confirmada' THEN
      RAISE EXCEPTION 'The paid reservation is not in a confirmable state.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
      payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
      payment.fecha_pago::timestamptz, payment.created_at::timestamptz
    FROM public.pagos AS payment
    WHERE payment.id::text = p_payment_id
      AND payment.usuario_id::text = v_owner_id;
    RETURN;
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_payment_status_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'estado'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF p_outcome = 'approved' THEN
    IF v_current_status NOT IN ('pendiente', 'procesando')
      OR v_reservation_status NOT IN ('pendiente', 'confirmada') THEN
      RAISE EXCEPTION 'The payment cannot be approved from its current state.' USING ERRCODE = '22023';
    END IF;

    v_target_status := 'pagado';
    v_paid_at := pg_catalog.clock_timestamp();
    v_reference := pg_catalog.concat(
      'sandbox_',
      pg_catalog.encode(
        extensions.digest(pg_catalog.concat(p_payment_id, ':', p_outcome), 'sha256'),
        'hex'
      )
    );

    EXECUTE pg_catalog.format(
      'UPDATE public.pagos AS payment
       SET estado = ($1)::%s,
           fecha_pago = $2,
           referencia_externa = $3
       WHERE payment.id::text = $4
         AND payment.usuario_id::text = $5
         AND payment.estado::text IN (''pendiente'', ''procesando'')',
      v_payment_status_type
    ) USING v_target_status, v_paid_at, v_reference, p_payment_id, v_owner_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      RAISE EXCEPTION 'The payment could not be approved.' USING ERRCODE = '40001';
    END IF;

    UPDATE public.reservaciones AS reservation
    SET estado = 'confirmada', updated_at = pg_catalog.clock_timestamp()
    WHERE reservation.id::text = v_reservation_id
      AND reservation.usuario_id::text = v_owner_id
      AND reservation.estado::text IN ('pendiente', 'confirmada');
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      RAISE EXCEPTION 'The reservation could not be confirmed.' USING ERRCODE = '40001';
    END IF;
  END IF;

  IF p_outcome <> 'approved' THEN
    IF p_outcome = 'refunded' THEN
      IF v_current_status <> 'pagado' THEN
        RAISE EXCEPTION 'Only a paid sandbox payment can be refunded.' USING ERRCODE = '22023';
      END IF;
      v_target_status := 'reembolsado';
      v_paid_at := v_existing_paid_at;
    ELSE
      IF v_current_status IN ('pagado', 'reembolsado') THEN
        RAISE EXCEPTION 'A completed payment cannot be downgraded.' USING ERRCODE = '22023';
      END IF;
      v_target_status := CASE p_outcome
        WHEN 'pending' THEN 'procesando'
        WHEN 'rejected' THEN 'rechazado'
        WHEN 'cancelled' THEN 'cancelado'
      END;
      v_paid_at := NULL;
    END IF;

    v_reference := pg_catalog.concat(
      'sandbox_',
      pg_catalog.encode(
        extensions.digest(pg_catalog.concat(p_payment_id, ':', p_outcome), 'sha256'),
        'hex'
      )
    );
    EXECUTE pg_catalog.format(
      'UPDATE public.pagos AS payment
       SET estado = ($1)::%s,
           fecha_pago = $2,
           referencia_externa = $3
       WHERE payment.id::text = $4
         AND payment.usuario_id::text = $5',
      v_payment_status_type
    ) USING v_target_status, v_paid_at, v_reference, p_payment_id, v_owner_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      RAISE EXCEPTION 'The sandbox payment outcome could not be recorded.' USING ERRCODE = '40001';
    END IF;
  END IF;

  RETURN QUERY
  SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
    payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
    payment.fecha_pago::timestamptz, payment.created_at::timestamptz
  FROM public.pagos AS payment
  WHERE payment.id::text = p_payment_id
    AND payment.usuario_id::text = v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_get_payment(
  p_session_token text,
  p_payment_id text
)
RETURNS TABLE (
  id text,
  reservacion_id text,
  monto numeric,
  metodo_pago text,
  estado text,
  referencia_externa text,
  fecha_pago timestamptz,
  created_at timestamptz,
  reservacion_estado text,
  reservacion_fecha date,
  reservacion_hora time without time zone,
  autolavado_id text,
  autolavado_nombre text,
  servicio_id text,
  servicio_nombre text
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
  SELECT payment.id::text,
    payment.reservacion_id::text,
    payment.monto::numeric,
    payment.metodo_pago::text,
    payment.estado::text,
    payment.referencia_externa::text,
    payment.fecha_pago::timestamptz,
    payment.created_at::timestamptz,
    reservation.estado::text,
    reservation.fecha,
    reservation.hora_inicio AS reservacion_hora,
    wash.id::text,
    wash.nombre::text,
    service.id::text,
    service.nombre::text
  FROM public.pagos AS payment
  JOIN public.reservaciones AS reservation
    ON reservation.id::text = payment.reservacion_id::text
  JOIN public.autolavados AS wash
    ON wash.id::text = reservation.autolavado_id::text
  JOIN public.servicios AS service
    ON service.id::text = reservation.servicio_id::text
  WHERE payment.id::text = p_payment_id
    AND payment.usuario_id::text = v_owner_id
    AND reservation.usuario_id::text = v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_list_payments(p_session_token text)
RETURNS TABLE (
  id text,
  reservacion_id text,
  monto numeric,
  metodo_pago text,
  estado text,
  referencia_externa text,
  fecha_pago timestamptz,
  created_at timestamptz,
  reservacion_estado text,
  reservacion_fecha date,
  reservacion_hora time without time zone,
  autolavado_id text,
  autolavado_nombre text,
  servicio_id text,
  servicio_nombre text
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
  SELECT payment.id::text,
    payment.reservacion_id::text,
    payment.monto::numeric,
    payment.metodo_pago::text,
    payment.estado::text,
    payment.referencia_externa::text,
    payment.fecha_pago::timestamptz,
    payment.created_at::timestamptz,
    reservation.estado::text,
    reservation.fecha,
    reservation.hora_inicio AS reservacion_hora,
    wash.id::text,
    wash.nombre::text,
    service.id::text,
    service.nombre::text
  FROM public.pagos AS payment
  JOIN public.reservaciones AS reservation
    ON reservation.id::text = payment.reservacion_id::text
  JOIN public.autolavados AS wash
    ON wash.id::text = reservation.autolavado_id::text
  JOIN public.servicios AS service
    ON service.id::text = reservation.servicio_id::text
  WHERE payment.usuario_id::text = v_owner_id
    AND reservation.usuario_id::text = v_owner_id
  ORDER BY payment.created_at DESC NULLS LAST, payment.id::text DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_begin_payment(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_process_sandbox_payment(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_get_payment(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_list_payments(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_begin_payment(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_process_sandbox_payment(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_get_payment(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_list_payments(text) TO anon, authenticated;

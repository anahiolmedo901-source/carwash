/*
  Stripe PaymentIntent boundary.

  The mobile app never receives STRIPE_SECRET_KEY and never writes payment
  state. Edge Functions create/link PaymentIntents and the verified Stripe
  webhook applies final states through the RPC below.
*/

CREATE TABLE IF NOT EXISTS public.carwash_stripe_events (
  event_id text PRIMARY KEY,
  payment_intent_id text NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

ALTER TABLE public.carwash_stripe_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carwash_deny_client_access ON public.carwash_stripe_events;
CREATE POLICY carwash_deny_client_access ON public.carwash_stripe_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL PRIVILEGES ON TABLE public.carwash_stripe_events FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS carwash_stripe_events_payment_intent_idx
  ON public.carwash_stripe_events (payment_intent_id);

CREATE OR REPLACE FUNCTION public.carwash_link_stripe_payment(
  p_session_token text,
  p_payment_id text,
  p_payment_intent_id text
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
  v_current_reference text;
  v_method text;
  v_status_type text;
BEGIN
  v_owner_id := public.carwash_current_user_id(p_session_token);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session.' USING ERRCODE = '28000';
  END IF;
  IF p_payment_id IS NULL OR pg_catalog.btrim(p_payment_id) = ''
    OR p_payment_intent_id IS NULL
    OR p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Invalid Stripe payment details.' USING ERRCODE = '22023';
  END IF;

  SELECT payment.reservacion_id::text,
    payment.estado::text,
    payment.referencia_externa::text,
    payment.metodo_pago::text
  INTO v_reservation_id, v_current_status, v_current_reference, v_method
  FROM public.pagos AS payment
  WHERE payment.id::text = p_payment_id
    AND payment.usuario_id::text = v_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The payment could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_method NOT IN ('tarjeta_credito', 'tarjeta_debito') THEN
    RAISE EXCEPTION 'The payment method is not compatible with Stripe.' USING ERRCODE = '22023';
  END IF;
  IF v_current_status IN ('pagado', 'reembolsado') THEN
    RETURN QUERY
    SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
      payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
      payment.fecha_pago::timestamptz, payment.created_at::timestamptz
    FROM public.pagos AS payment
    WHERE payment.id::text = p_payment_id;
    RETURN;
  END IF;
  IF v_current_status NOT IN ('pendiente', 'procesando') THEN
    RAISE EXCEPTION 'The payment cannot be linked to Stripe from its current state.' USING ERRCODE = '22023';
  END IF;
  IF v_current_reference IS NOT NULL AND v_current_reference <> p_payment_intent_id THEN
    RAISE EXCEPTION 'The payment is already linked to another Stripe PaymentIntent.' USING ERRCODE = '40001';
  END IF;

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_status_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'estado'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_status_type IS NULL THEN
    RAISE EXCEPTION 'public.pagos.estado is unavailable.';
  END IF;

  EXECUTE pg_catalog.format(
    'UPDATE public.pagos AS payment
     SET estado = ($1)::%s, referencia_externa = $2
     WHERE payment.id::text = $3 AND payment.usuario_id::text = $4',
    v_status_type
  ) USING 'procesando', p_payment_intent_id, p_payment_id, v_owner_id;

  RETURN QUERY
  SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
    payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
    payment.fecha_pago::timestamptz, payment.created_at::timestamptz
  FROM public.pagos AS payment
  WHERE payment.id::text = p_payment_id
    AND payment.usuario_id::text = v_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carwash_apply_stripe_payment_event(
  p_payment_intent_id text,
  p_event_id text,
  p_stripe_status text,
  p_amount_cents bigint,
  p_currency text
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
  v_payment_id text;
  v_reservation_id text;
  v_current_status text;
  v_reservation_status text;
  v_amount numeric;
  v_existing_paid_at timestamptz;
  v_target_status text;
  v_status_type text;
  v_inserted_count integer;
BEGIN
  IF p_payment_intent_id IS NULL
    OR p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$'
    OR p_event_id IS NULL
    OR pg_catalog.btrim(p_event_id) = ''
    OR p_stripe_status NOT IN ('succeeded', 'processing', 'failed', 'canceled', 'refunded')
    OR p_amount_cents IS NULL
    OR p_amount_cents <= 0
    OR p_currency IS NULL
    OR pg_catalog.lower(p_currency) <> 'mxn' THEN
    RAISE EXCEPTION 'Invalid Stripe payment event.' USING ERRCODE = '22023';
  END IF;

  SELECT payment.id::text,
    payment.reservacion_id::text,
    payment.estado::text,
    payment.monto::numeric,
    payment.fecha_pago::timestamptz
  INTO v_payment_id, v_reservation_id, v_current_status, v_amount, v_existing_paid_at
  FROM public.pagos AS payment
  WHERE payment.referencia_externa::text = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The Stripe payment could not be matched.' USING ERRCODE = 'P0002';
  END IF;
  IF p_amount_cents <> pg_catalog.round(v_amount * 100)::bigint THEN
    RAISE EXCEPTION 'The Stripe amount does not match the payment.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.carwash_stripe_events (event_id, payment_intent_id, event_type)
  VALUES (p_event_id, p_payment_intent_id, p_stripe_status)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  IF v_inserted_count = 0 THEN
    RETURN QUERY
    SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
      payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
      payment.fecha_pago::timestamptz, payment.created_at::timestamptz
    FROM public.pagos AS payment
    WHERE payment.id::text = v_payment_id;
    RETURN;
  END IF;

  v_target_status := CASE p_stripe_status
    WHEN 'succeeded' THEN 'pagado'
    WHEN 'processing' THEN 'procesando'
    WHEN 'failed' THEN 'rechazado'
    WHEN 'canceled' THEN 'cancelado'
    WHEN 'refunded' THEN 'reembolsado'
  END;

  IF v_current_status = 'reembolsado'
    OR (v_current_status = 'pagado' AND v_target_status NOT IN ('reembolsado', 'pagado')) THEN
    RETURN QUERY
    SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
      payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
      payment.fecha_pago::timestamptz, payment.created_at::timestamptz
    FROM public.pagos AS payment
    WHERE payment.id::text = v_payment_id;
    RETURN;
  END IF;
  IF v_target_status = 'reembolsado' AND v_current_status <> 'pagado' THEN
    RAISE EXCEPTION 'Only a paid Stripe payment can be refunded.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('carwash.actor_id', 'stripe-webhook', true);
  PERFORM pg_catalog.set_config('carwash.actor_role', 'stripe', true);

  SELECT pg_catalog.format_type(column_metadata.atttypid, column_metadata.atttypmod)
  INTO v_status_type
  FROM pg_catalog.pg_attribute AS column_metadata
  WHERE column_metadata.attrelid = 'public.pagos'::pg_catalog.regclass
    AND column_metadata.attname = 'estado'
    AND column_metadata.attnum > 0
    AND NOT column_metadata.attisdropped;

  IF v_target_status IN ('pagado', 'reembolsado') THEN
    EXECUTE pg_catalog.format(
      'UPDATE public.pagos AS payment
       SET estado = ($1)::%s,
           fecha_pago = COALESCE(payment.fecha_pago, pg_catalog.clock_timestamp())
       WHERE payment.id::text = $2',
      v_status_type
    ) USING v_target_status, v_payment_id;
  ELSE
    EXECUTE pg_catalog.format(
      'UPDATE public.pagos AS payment
       SET estado = ($1)::%s, fecha_pago = NULL
       WHERE payment.id::text = $2',
      v_status_type
    ) USING v_target_status, v_payment_id;
  END IF;

  SELECT reservation.estado::text
  INTO v_reservation_status
  FROM public.reservaciones AS reservation
  WHERE reservation.id::text = v_reservation_id
  FOR UPDATE;

  IF v_target_status = 'pagado'
    AND v_reservation_status IN ('pendiente', 'confirmada') THEN
    UPDATE public.reservaciones AS reservation
    SET estado = 'confirmada', updated_at = pg_catalog.clock_timestamp()
    WHERE reservation.id::text = v_reservation_id
      AND reservation.estado::text IN ('pendiente', 'confirmada');
  END IF;

  RETURN QUERY
  SELECT payment.id::text, payment.reservacion_id::text, payment.monto::numeric,
    payment.metodo_pago::text, payment.estado::text, payment.referencia_externa::text,
    payment.fecha_pago::timestamptz, payment.created_at::timestamptz
  FROM public.pagos AS payment
  WHERE payment.id::text = v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.carwash_link_stripe_payment(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_apply_stripe_payment_event(text, text, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carwash_begin_payment(text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carwash_begin_payment(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.carwash_begin_payment(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_process_sandbox_payment(text, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_link_stripe_payment(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.carwash_apply_stripe_payment_event(text, text, text, bigint, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

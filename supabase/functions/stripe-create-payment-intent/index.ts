import { createClient } from 'npm:@supabase/supabase-js@2';

const STRIPE_API_URL = 'https://api.stripe.com/v1';
const CURRENCY = 'mxn';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-carwash-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type PaymentRow = {
  id: string;
  reservacion_id: string;
  monto: number | string;
  metodo_pago: string;
  estado: string;
  referencia_externa: string | null;
  fecha_pago: string | null;
  created_at: string;
};

type StripePaymentIntent = {
  id?: unknown;
  client_secret?: unknown;
  amount?: unknown;
  currency?: unknown;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

function isSessionToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function toCents(value: unknown): number | null {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
    return null;
  }
  const cents = Math.round(amount * 100);
  return cents > 0 && cents <= 999999999999 ? cents : null;
}

function paymentFromRow(value: unknown): PaymentRow | null {
  const row = objectValue(value);
  const id = nonEmptyText(row?.id);
  const reservationId = nonEmptyText(row?.reservacion_id);
  const method = nonEmptyText(row?.metodo_pago);
  const status = nonEmptyText(row?.estado);
  const createdAt = nonEmptyText(row?.created_at);
  if (!id || !reservationId || !method || !status || !createdAt) {
    return null;
  }
  return {
    id,
    reservacion_id: reservationId,
    monto: typeof row?.monto === 'number' || typeof row?.monto === 'string' ? row.monto : NaN,
    metodo_pago: method,
    estado: status,
    referencia_externa: row?.referencia_externa === null
      ? null
      : nonEmptyText(row?.referencia_externa),
    fecha_pago: row?.fecha_pago === null ? null : nonEmptyText(row?.fecha_pago),
    created_at: createdAt,
  };
}

function stripeAuthHeader(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

async function stripeRequest(
  secretKey: string,
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: stripeAuthHeader(secretKey),
      ...(init.headers ?? {}),
    },
  });
  const parsed: unknown = await response.json().catch(() => null);
  const body = objectValue(parsed);
  if (!response.ok || !body) {
    const stripeError = objectValue(body?.error);
    throw new Error(errorMessage(stripeError, `Stripe API request failed (${response.status}).`));
  }
  return body;
}

async function createPaymentIntent(
  secretKey: string,
  payment: PaymentRow,
  amountCents: number,
): Promise<StripePaymentIntent> {
  const form = new URLSearchParams();
  form.set('amount', String(amountCents));
  form.set('currency', CURRENCY);
  form.append('payment_method_types[]', 'card');
  form.set('metadata[payment_id]', payment.id);
  form.set('metadata[reservation_id]', payment.reservacion_id);

  return await stripeRequest(secretKey, '/payment_intents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `carwash-payment-${payment.id}`,
    },
    body: form.toString(),
  }) as StripePaymentIntent;
}

async function loadPaymentIntent(
  secretKey: string,
  paymentIntentId: string,
): Promise<StripePaymentIntent> {
  return await stripeRequest(
    secretKey,
    `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    { method: 'GET' },
  ) as StripePaymentIntent;
}

function validatePaymentIntent(
  intent: StripePaymentIntent,
  payment: PaymentRow,
  amountCents: number,
): { id: string; clientSecret: string } {
  const id = nonEmptyText(intent.id);
  const clientSecret = nonEmptyText(intent.client_secret);
  const amount = Number(intent.amount);
  const currency = nonEmptyText(intent.currency)?.toLowerCase();
  if (!id || !clientSecret || amount !== amountCents || currency !== CURRENCY) {
    throw new Error('Stripe PaymentIntent does not match the payment.');
  }
  if (!id.startsWith('pi_')) {
    throw new Error('Stripe PaymentIntent id is invalid.');
  }
  return { id, clientSecret };
}

async function handleCreatePaymentIntent(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const sessionToken = request.headers.get('x-carwash-session-token');
  if (!isSessionToken(sessionToken)) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  let reservationId: string | null = null;
  try {
    const parsed: unknown = await request.json();
    const body = objectValue(parsed);
    reservationId = nonEmptyText(body?.reservationId);
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (!reservationId) {
    return json({ error: 'A reservation id is required.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
    return json({ error: 'Stripe payment service is unavailable.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: paymentData, error: beginError } = await admin.rpc('carwash_begin_payment', {
    p_session_token: sessionToken,
    p_reservation_id: reservationId,
    p_metodo_pago: 'tarjeta_credito',
  });
  if (beginError) {
    return json({ error: errorMessage(beginError, 'The payment could not be started.') }, 400);
  }

  const payment = paymentFromRow(Array.isArray(paymentData) ? paymentData[0] : paymentData);
  if (!payment) {
    return json({ error: 'The payment response is invalid.' }, 500);
  }
  if (payment.estado === 'pagado' || payment.estado === 'reembolsado') {
    return json({ error: 'This reservation already has a completed payment.' }, 409);
  }
  const amountCents = toCents(payment.monto);
  if (!amountCents) {
    return json({ error: 'The payment amount is invalid.' }, 422);
  }

  try {
    const existingIntentId = payment.referencia_externa?.startsWith('pi_')
      ? payment.referencia_externa
      : null;
    const intent = existingIntentId
      ? await loadPaymentIntent(stripeSecretKey, existingIntentId)
      : await createPaymentIntent(stripeSecretKey, payment, amountCents);
    const validatedIntent = validatePaymentIntent(intent, payment, amountCents);

    if (!existingIntentId) {
      const { error: linkError } = await admin.rpc('carwash_link_stripe_payment', {
        p_session_token: sessionToken,
        p_payment_id: payment.id,
        p_payment_intent_id: validatedIntent.id,
      });
      if (linkError) {
        return json({ error: errorMessage(linkError, 'The Stripe payment could not be linked.') }, 409);
      }
    }

    return json({
      payment: {
        ...payment,
        estado: 'procesando',
        referencia_externa: validatedIntent.id,
      },
      clientSecret: validatedIntent.clientSecret,
      currency: CURRENCY,
    });
  } catch (error) {
    return json({ error: errorMessage(error, 'Stripe payment initialization failed.') }, 502);
  }
}

Deno.serve(async (request) => {
  try {
    return await handleCreatePaymentIntent(request);
  } catch {
    return json({ error: 'Stripe payment service is unavailable.' }, 500);
  }
});

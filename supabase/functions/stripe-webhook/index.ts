import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_SIGNATURE_AGE_SECONDS = 300;

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  data?: unknown;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function equalHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function stripeSignature(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  return hex(signature);
}

async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) {
    return false;
  }
  const parts = header.split(',').map((part) => part.trim());
  const timestamp = Number(parts.find((part) => part.startsWith('t='))?.slice(2));
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3).trim())
    .filter(Boolean);
  if (!Number.isSafeInteger(timestamp) || signatures.length === 0) {
    return false;
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_SIGNATURE_AGE_SECONDS) {
    return false;
  }
  const expected = await stripeSignature(secret, `${timestamp}.${payload}`);
  return signatures.some((signature) => equalHex(signature, expected));
}

function eventPaymentData(event: StripeEvent): {
  paymentIntentId: string;
  status: 'succeeded' | 'processing' | 'failed' | 'canceled' | 'refunded';
  amountCents: number;
  currency: string;
} | null {
  const type = textValue(event.type);
  const data = objectValue(event.data);
  const stripeObject = objectValue(data?.object);
  if (!type || !stripeObject) {
    return null;
  }

  if (type.startsWith('payment_intent.')) {
    const paymentIntentId = textValue(stripeObject.id);
    const amountCents = numberValue(stripeObject.amount);
    const currency = textValue(stripeObject.currency)?.toLowerCase();
    if (!paymentIntentId || !amountCents || !currency) {
      return null;
    }
    const status = type === 'payment_intent.succeeded'
      ? 'succeeded'
      : type === 'payment_intent.processing' || type === 'payment_intent.requires_action'
        ? 'processing'
        : type === 'payment_intent.payment_failed'
          ? 'failed'
          : type === 'payment_intent.canceled'
            ? 'canceled'
            : null;
    return status ? { paymentIntentId, status, amountCents, currency } : null;
  }

  if (type === 'charge.refunded') {
    const paymentIntentId = textValue(stripeObject.payment_intent);
    const amountCents = numberValue(stripeObject.amount);
    const amountRefunded = numberValue(stripeObject.amount_refunded);
    const currency = textValue(stripeObject.currency)?.toLowerCase();
    if (!paymentIntentId || !amountCents || amountRefunded !== amountCents || !currency) {
      return null;
    }
    return { paymentIntentId, status: 'refunded', amountCents, currency };
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const rawBody = await request.text();
  if (!webhookSecret || !(await verifyStripeSignature(
    rawBody,
    request.headers.get('stripe-signature'),
    webhookSecret,
  ))) {
    return json({ error: 'Invalid Stripe signature.' }, 400);
  }

  let event: StripeEvent;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    const parsedObject = objectValue(parsed);
    if (!parsedObject) {
      return json({ error: 'Invalid Stripe event.' }, 400);
    }
    event = parsedObject as StripeEvent;
  } catch {
    return json({ error: 'Invalid Stripe event.' }, 400);
  }

  const eventId = textValue(event.id);
  const paymentData = eventPaymentData(event);
  if (!eventId || !paymentData) {
    return json({ received: true, skipped: 'unsupported-event' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Stripe webhook service is unavailable.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error } = await admin.rpc('carwash_apply_stripe_payment_event', {
    p_payment_intent_id: paymentData.paymentIntentId,
    p_event_id: eventId,
    p_stripe_status: paymentData.status,
    p_amount_cents: paymentData.amountCents,
    p_currency: paymentData.currency,
  });
  if (error) {
    return json({ error: 'Stripe payment event could not be applied.' }, 500);
  }

  return json({ received: true });
});

import { createClient } from 'npm:@supabase/supabase-js@2';
import { SignJWT } from 'npm:jose@5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type TokenRequest = {
  sessionToken?: unknown;
  autolavadoIds?: unknown;
};

const MAX_AUTOLAVADO_IDS = 32;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isValidScope(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= 128
    && !value.includes(':');
}

function isValidSessionToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function normalizeAutolavadoIds(value: unknown): string[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_AUTOLAVADO_IDS) {
    return null;
  }

  const ids: string[] = [];
  for (const item of value) {
    if (!isValidScope(item)) {
      return null;
    }
    const id = item.trim();
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

async function issueRealtimeToken(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  let body: TokenRequest;
  try {
    const parsedBody: unknown = await request.json();
    if (parsedBody === null || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return json({ error: 'Invalid request.' }, 400);
    }
    body = parsedBody as TokenRequest;
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  if (!isValidSessionToken(body.sessionToken)) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const autolavadoIds = normalizeAutolavadoIds(body.autolavadoIds);
  if (autolavadoIds === null) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const jwtSecret = Deno.env.get('CARWASH_JWT_SECRET') || Deno.env.get('SUPABASE_JWT_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !jwtSecret) {
    return json({ error: 'Realtime authorization is unavailable.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: userId, error: userError } = await admin.rpc('carwash_current_user_id', {
    p_session_token: body.sessionToken,
  });
  if (userError) {
    return json({ error: 'Realtime authorization is unavailable.' }, 500);
  }
  if (typeof userId !== 'string' || !userId) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  if (autolavadoIds.length > 0) {
    const { data: washes, error: washError } = await admin
      .from('autolavados')
      .select('id')
      .in('id', autolavadoIds);
    if (washError) {
      return json({ error: 'Realtime authorization is unavailable.' }, 500);
    }
    const validIds = new Set((washes ?? []).map((wash) => String(wash.id)));
    if (validIds.size !== autolavadoIds.length || autolavadoIds.some((id) => !validIds.has(id))) {
      return json({ error: 'Unauthorized.' }, 401);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: userId,
    role: 'authenticated',
    autolavado_ids: autolavadoIds,
  };
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(new TextEncoder().encode(jwtSecret));

  return json({ token });
}

Deno.serve(async (request) => {
  try {
    return await issueRealtimeToken(request);
  } catch {
    return json({ error: 'Realtime authorization is unavailable.' }, 500);
  }
});
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_MESSAGES_PER_REQUEST = 100;
const PUSH_TTL_SECONDS = 60 * 60 * 24 * 7;

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  pendiente: {
    title: 'Reservación recibida',
    body: 'Recibimos tu reservación y está pendiente de confirmación.',
  },
  confirmada: {
    title: 'Reservación confirmada',
    body: 'Tu reservación fue confirmada por el autolavado.',
  },
  cliente_llego: {
    title: 'Llegada registrada',
    body: 'El autolavado registró tu llegada.',
  },
  en_espera: {
    title: 'Estás en espera',
    body: 'Tu vehículo está en la fila de atención.',
  },
  en_lavado: {
    title: 'Lavado en progreso',
    body: 'El servicio de tu vehículo comenzó.',
  },
  finalizada: {
    title: 'Servicio finalizado',
    body: 'Tu servicio terminó. Gracias por usar CarWashNow.',
  },
  cancelada: {
    title: 'Reservación cancelada',
    body: 'Tu reservación fue cancelada.',
  },
};

const PAYMENT_STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  pendiente: {
    title: 'Pago iniciado',
    body: 'El pago de tu reservacion esta pendiente.',
  },
  procesando: {
    title: 'Pago en procesamiento',
    body: 'Tu pago se esta procesando.',
  },
  pagado: {
    title: 'Pago confirmado',
    body: 'Tu pago fue aprobado y la reservacion quedo confirmada.',
  },
  rechazado: {
    title: 'Pago rechazado',
    body: 'El pago fue rechazado. Revisa tu reservacion para intentar de nuevo.',
  },
  cancelado: {
    title: 'Pago cancelado',
    body: 'El pago fue cancelado y la reservacion no fue confirmada.',
  },
  reembolsado: {
    title: 'Pago reembolsado',
    body: 'El pago fue reembolsado.',
  },
};

type WebhookBody = {
  type?: unknown;
  table?: unknown;
  record?: unknown;
  old_record?: unknown;
};

type PushTokenRow = {
  token: string;
  usuarioId: string;
};

type NotificationTable = 'reservaciones' | 'pagos' | 'servicios' | 'autolavados';
type NotificationAudience = 'owner' | 'active-clients';

type NotificationEvent = {
  table: NotificationTable;
  reservationId: string | null;
  usuarioId: string | null;
  entityId: string;
  status: string | null;
  title: string;
  body: string;
  paymentId: string | null;
  data: Record<string, unknown>;
  audience: NotificationAudience;
};

type DeliveryResult = {
  sent: number;
  sentByUser: Record<string, number>;
  invalidTokens: string[];
  error: string | null;
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

function scalarText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

async function sendPushNotifications(
  admin: ReturnType<typeof createClient>,
  tokens: PushTokenRow[],
  message: { title: string; body: string; data: Record<string, unknown> },
): Promise<DeliveryResult> {
  const invalidTokens: string[] = [];
  const sentByUser: Record<string, number> = {};
  let sent = 0;
  let error: string | null = null;

  for (let offset = 0; offset < tokens.length; offset += MAX_MESSAGES_PER_REQUEST) {
    const batch = tokens.slice(offset, offset + MAX_MESSAGES_PER_REQUEST);
    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map(({ token }) => ({
          to: token,
          title: message.title,
           body: message.body,
           sound: 'default',
          channelId: 'default',
          priority: 'high',
          ttl: PUSH_TTL_SECONDS,
          data: message.data,
        }))),
      });
    } catch {
      error = 'Expo push request failed.';
      break;
    }

    if (!response.ok) {
      error = `Expo push request failed with status ${response.status}.`;
      break;
    }

    let result: { data?: Array<{ status?: string; details?: { error?: string } }> };
    try {
      result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
    } catch {
      error = 'Expo push response was invalid.';
      break;
    }
    for (const [index, ticket] of (result.data ?? []).entries()) {
      if (ticket.status === 'ok') {
        sent += 1;
        const userId = batch[index]?.usuarioId;
        if (userId) {
          sentByUser[userId] = (sentByUser[userId] ?? 0) + 1;
        }
      }
      if (ticket.details?.error === 'DeviceNotRegistered' && batch[index]) {
        invalidTokens.push(batch[index].token);
      }
    }
  }

  if (invalidTokens.length > 0) {
    await Promise.all([
      admin
        .from('dispositivos')
        .update({ enabled: false })
        .in('token', invalidTokens),
      admin
        .from('carwash_push_tokens')
        .update({ enabled: false })
        .in('token', invalidTokens),
    ]);
  }

  return { sent, sentByUser, invalidTokens, error };
}

function eventFromWebhook(body: WebhookBody): NotificationEvent | null {
  const rawTable = body.table === undefined ? 'reservaciones' : scalarText(body.table);
  const table = rawTable?.replace(/^public\./, '');
  if (table !== 'reservaciones' && table !== 'pagos' && table !== 'servicios' && table !== 'autolavados') {
    return null;
  }

  const record = objectValue(body.record);
  const oldRecord = objectValue(body.old_record);
  const operation = scalarText(body.type)?.toUpperCase() ?? 'INSERT';
  if ((table === 'servicios' || table === 'autolavados') && operation !== 'INSERT') {
    return null;
  }

  if (table === 'servicios') {
    const serviceId = scalarText(record?.id);
    const autolavadoId = scalarText(record?.autolavado_id);
    const serviceName = scalarText(record?.nombre);
    if (!serviceId || !autolavadoId || !serviceName || record?.activo === false || record?.activo === 'false') {
      return null;
    }
    return {
      table,
      reservationId: null,
      usuarioId: null,
      entityId: serviceId,
      status: null,
      title: 'Nuevo servicio disponible',
      body: `Ahora puedes reservar ${serviceName} en CarWashNow.`,
      paymentId: null,
      data: {
        notificationType: 'new_service',
        serviceId,
        autolavadoId,
      },
      audience: 'active-clients',
    };
  }

  if (table === 'autolavados') {
    const autolavadoId = scalarText(record?.id);
    const autolavadoName = scalarText(record?.nombre);
    if (!autolavadoId || !autolavadoName || record?.activo === false || record?.activo === 'false') {
      return null;
    }
    return {
      table,
      reservationId: null,
      usuarioId: null,
      entityId: autolavadoId,
      status: null,
      title: 'Nuevo autolavado disponible',
      body: `${autolavadoName} ya esta disponible en CarWashNow.`,
      paymentId: null,
      data: {
        notificationType: 'new_carwash',
        autolavadoId,
      },
      audience: 'active-clients',
    };
  }

  const status = scalarText(record?.estado);
  const usuarioId = scalarText(record?.usuario_id);
  if (!record || !status || !usuarioId) {
    throw new Error('Invalid notification record.');
  }
  if (operation === 'UPDATE' && oldRecord?.estado === status) {
    return null;
  }

  if (table === 'reservaciones') {
    const reservationId = scalarText(record.id);
    const message = STATUS_MESSAGES[status];
    if (!reservationId || !message) {
      return null;
    }
    return {
      table,
      reservationId,
      usuarioId,
      entityId: reservationId,
      status,
      title: message.title,
      body: message.body,
      paymentId: null,
      data: {
        notificationType: 'reservation_status',
        reservationId,
        status,
      },
      audience: 'owner',
    };
  }

  const paymentId = scalarText(record.id);
  const reservationId = scalarText(record.reservacion_id);
  const message = PAYMENT_STATUS_MESSAGES[status];
  if (!paymentId || !reservationId || !message) {
    return null;
  }
  return {
    table,
    reservationId,
    usuarioId,
    entityId: paymentId,
    status,
    title: message.title,
    body: message.body,
    paymentId,
    data: {
      notificationType: 'payment_status',
      reservationId,
      paymentId,
      status,
    },
    audience: 'owner',
  };
}

async function createNotificationLog(
  admin: ReturnType<typeof createClient>,
  event: NotificationEvent,
): Promise<string> {
  const { data, error } = await admin.rpc('carwash_log_notification', {
    p_usuario_id: event.usuarioId,
    p_reservation_id: event.reservationId,
    p_payment_id: event.paymentId,
    p_tipo: `${event.table}_${event.status ?? 'nuevo'}`,
    p_titulo: event.title,
    p_mensaje: event.body,
    p_datos: {
      ...event.data,
      entityId: event.entityId,
      table: event.table,
      status: event.status,
    },
  });

  if (error) {
    throw new Error('Notification log could not be created.');
  }
  const id = scalarText(data);
  if (!id) {
    throw new Error('Notification log returned an invalid id.');
  }
  return id;
}

async function completeNotificationLog(
  admin: ReturnType<typeof createClient>,
  notificationId: string,
  event: NotificationEvent,
  result: DeliveryResult,
): Promise<void> {
  const sent = event.usuarioId ? result.sentByUser[event.usuarioId] ?? 0 : result.sent;
  await admin
    .from('notificaciones')
    .update({
      enviada: sent > 0,
      enviada_at: sent > 0 ? new Date().toISOString() : null,
      error: result.error,
      datos: {
        ...event.data,
        entityId: event.entityId,
        table: event.table,
        status: event.status,
        sent,
        invalidTokens: result.invalidTokens,
        error: result.error,
      },
    })
    .eq('id', notificationId);
}

function normalizePushTokenRows(value: unknown, fallbackUsuarioId: string | null = null): PushTokenRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((row) => {
    const record = objectValue(row);
    const token = scalarText(record?.token);
    const usuarioId = scalarText(record?.usuario_id) ?? fallbackUsuarioId;
    return token && usuarioId ? [{ token, usuarioId }] : [];
  });
}

async function activeClientRecipients(
  admin: ReturnType<typeof createClient>,
): Promise<{ userIds: string[]; tokens: PushTokenRow[] }> {
  const { data: clients, error: clientsError } = await admin
    .from('usuarios')
    .select('id')
    .eq('rol', 'cliente')
    .eq('activo', true);

  if (clientsError) {
    throw new Error('Active client list could not be read.');
  }

  const userIds = Array.from(new Set(
    (Array.isArray(clients) ? clients : [])
      .map((client) => scalarText(objectValue(client)?.id))
      .filter((id): id is string => Boolean(id)),
  ));
  if (userIds.length === 0) {
    return { userIds, tokens: [] };
  }

  const { data: devices, error: devicesError } = await admin
    .from('dispositivos')
    .select('token, usuario_id')
    .eq('enabled', true);
  if (devicesError) {
    throw new Error('Active device list could not be read.');
  }

  const activeIds = new Set(userIds);
  const tokens = normalizePushTokenRows(devices).filter((device) => activeIds.has(device.usuarioId));
  return { userIds, tokens };
}

async function deliverToActiveClients(
  admin: ReturnType<typeof createClient>,
  event: NotificationEvent,
): Promise<DeliveryResult & { notificationCount: number }> {
  const recipients = await activeClientRecipients(admin);
  const notificationEntries = await Promise.all(
    recipients.userIds.map(async (userId) => {
      const recipientEvent = { ...event, usuarioId: userId };
      const notificationId = await createNotificationLog(admin, recipientEvent);
      return [userId, notificationId] as const;
    }),
  );
  const notificationIds = new Map(notificationEntries);
  const result = await sendPushNotifications(
    admin,
    recipients.tokens,
    { title: event.title, body: event.body, data: event.data },
  );

  await Promise.all(
    recipients.userIds.map(async (userId) => {
      const notificationId = notificationIds.get(userId);
      if (!notificationId) {
        return;
      }
      await completeNotificationLog(admin, notificationId, { ...event, usuarioId: userId }, result);
    }),
  );

  return { ...result, notificationCount: recipients.userIds.length };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const expectedSecret = Deno.env.get('CARWASH_PUSH_WEBHOOK_SECRET');
  if (!expectedSecret || request.headers.get('x-carwash-webhook-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  let body: WebhookBody;
  try {
    const parsed: unknown = await request.json();
    const parsedObject = objectValue(parsed);
    if (!parsedObject) {
      return json({ error: 'Invalid webhook payload.' }, 400);
    }
    body = parsedObject as WebhookBody;
  } catch {
    return json({ error: 'Invalid webhook payload.' }, 400);
  }

  let event: NotificationEvent | null;
  try {
    event = eventFromWebhook(body);
  } catch {
    return json({ error: 'Invalid notification record.' }, 400);
  }
  if (!event) {
    return json({ sent: 0, skipped: 'unchanged-or-unsupported-status' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Push notification service is unavailable.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  if (event.audience === 'active-clients') {
    try {
      return json(await deliverToActiveClients(admin, event));
    } catch {
      return json({ error: 'Push notification service is unavailable.' }, 500);
    }
  }

  if (!event.usuarioId) {
    return json({ error: 'Invalid notification recipient.' }, 400);
  }

  let notificationId: string;
  try {
    notificationId = await createNotificationLog(admin, event);
  } catch {
    return json({ error: 'Notification log service is unavailable.' }, 500);
  }

  const { data: tokens, error } = await admin
    .from('dispositivos')
    .select('token')
    .eq('usuario_id', event.usuarioId)
    .eq('enabled', true);

  if (error) {
    return json({ error: 'Push notification service is unavailable.' }, 500);
  }

  const result = await sendPushNotifications(
    admin,
    normalizePushTokenRows(tokens, event.usuarioId),
    { title: event.title, body: event.body, data: event.data },
  );
  await completeNotificationLog(admin, notificationId, event, result);
  return json({ ...result, notificationId });
});

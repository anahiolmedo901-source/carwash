type NotificationData = Record<string, unknown>;

export type PushNotificationDestination =
  | { pathname: '/reservacion/[id]'; params: { id: string } }
  | { pathname: '/autolavado/[id]'; params: { id: string } };

function objectValue(value: unknown): NotificationData | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as NotificationData
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function getPushNotificationDestination(data: unknown): PushNotificationDestination | null {
  const notificationData = objectValue(data);
  if (!notificationData) {
    return null;
  }

  const reservationId = textValue(notificationData.reservationId);
  if (reservationId) {
    return { pathname: '/reservacion/[id]', params: { id: reservationId } };
  }

  const notificationType = textValue(notificationData.notificationType);
  const autolavadoId = textValue(notificationData.autolavadoId);
  if ((notificationType === 'new_service' || notificationType === 'new_carwash') && autolavadoId) {
    return { pathname: '/autolavado/[id]', params: { id: autolavadoId } };
  }

  return null;
}

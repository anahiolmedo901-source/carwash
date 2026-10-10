export interface NotificationResponse {
  notification: {
    request: {
      content: { data: unknown };
      identifier: string;
    };
  };
}


export function configurePushNotifications(): void {
  // Push notifications are not supported by this app's web client.
}

export function addNotificationResponseReceivedListener(
  _listener: (response: NotificationResponse) => void,
): { remove: () => void } {
  return { remove: () => undefined };
}

export async function getLastNotificationResponseAsync(): Promise<NotificationResponse | null> {
  return null;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  return null;
}

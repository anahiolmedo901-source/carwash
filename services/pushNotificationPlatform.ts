import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type NotificationResponse = Notifications.NotificationResponse;


function projectIdFromConfig(): string | null {
  const configProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easProjectId = Constants.easConfig?.projectId;
  const environmentProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  for (const value of [configProjectId, easProjectId, environmentProjectId]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function configurePushNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function addNotificationResponseReceivedListener(
  listener: (response: NotificationResponse) => void,
): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export function getLastNotificationResponseAsync(): Promise<NotificationResponse | null> {
  return Notifications.getLastNotificationResponseAsync();
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'CarWashNow',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0A6C90',
      sound: 'default',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) {
    return null;
  }

  const projectId = projectIdFromConfig();
  if (!projectId) {
    throw new Error('The EAS project ID is required to register push notifications.');
  }

  const response = await Notifications.getExpoPushTokenAsync({ projectId });
  return response.data;
}

import { Platform } from 'react-native';

interface LocalNotificationInput {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function presentLocalNotificationAsync(input: LocalNotificationInput): Promise<void> {
  if (Platform.OS === 'web' || process.env.NODE_ENV === 'test') {
    return;
  }

  const [Device, Notifications] = await Promise.all([
    import('expo-device'),
    import('expo-notifications'),
  ]);
  if (!Device.isDevice) {
    return;
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
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      sound: 'default',
    },
    trigger: null,
  });
}

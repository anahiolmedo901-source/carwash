import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import { SESSION_TOKEN_STORAGE_KEY, type AuthServiceStorage } from './authService';
import { registerForPushNotificationsAsync } from './pushNotificationPlatform';

export const PUSH_TOKEN_STORAGE_KEY = '@carwashnow/expo-push-token';

type PushRpcClient = Pick<SupabaseClient<Database>, 'rpc'>;

export interface PushNotificationService {
  registerCurrentDevicePushToken(): Promise<string | null>;
  unregisterCurrentDevicePushToken(): Promise<void>;
}

export function createPushNotificationService(
  storage: AuthServiceStorage = AsyncStorage,
  client: PushRpcClient = supabase,
): PushNotificationService {
  return {
    async registerCurrentDevicePushToken() {
      const pushToken = await registerForPushNotificationsAsync();
      if (!pushToken) {
        return null;
      }

      const sessionToken = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
      if (!sessionToken) {
        return null;
      }

      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const previousPushToken = await storage.getItem(PUSH_TOKEN_STORAGE_KEY);
      if (previousPushToken && previousPushToken !== pushToken) {
        // A reinstall or token rotation must not leave the previous user-device
        // association active in the server registry.
        await client.rpc('carwash_unregister_push_token', {
          p_session_token: sessionToken,
          p_token: previousPushToken,
        });
      }

      const { error } = await client.rpc('carwash_register_push_token', {
        p_session_token: sessionToken,
        p_token: pushToken,
        p_platform: platform,
      });
      if (error) {
        throw error;
      }

      await storage.setItem(PUSH_TOKEN_STORAGE_KEY, pushToken);
      return pushToken;
    },

    async unregisterCurrentDevicePushToken() {
      const pushToken = await storage.getItem(PUSH_TOKEN_STORAGE_KEY);
      if (!pushToken) {
        return;
      }

      const sessionToken = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
      if (!sessionToken) {
        await storage.removeItem(PUSH_TOKEN_STORAGE_KEY);
        return;
      }

      try {
        const { error } = await client.rpc('carwash_unregister_push_token', {
          p_session_token: sessionToken,
          p_token: pushToken,
        });
        if (error) {
          throw error;
        }
      } finally {
        await storage.removeItem(PUSH_TOKEN_STORAGE_KEY);
      }
    },
  };
}

export const pushNotificationService = createPushNotificationService();

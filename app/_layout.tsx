import React from 'react';
import { StripeProvider, useStripe } from '../lib/stripeNative';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { isStripeAvailable } from '../lib/stripe';
import { pushNotificationService } from '../services/pushNotificationService';
import {
  addNotificationResponseReceivedListener,
  configurePushNotifications,
  getLastNotificationResponseAsync,
  type NotificationResponse,
} from '../services/pushNotificationPlatform';
import type { AuthState } from '../types/auth';
import type { UserRole } from '../types/database';
import { getPushNotificationDestination } from '../utils/pushNotificationNavigation';

function hasRole(state: AuthState, role: UserRole): boolean {
  return state.status === 'signed-in' && state.profile.rol === role;
}

function RouteStack() {
  const { state } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={state.status === 'signed-out'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={hasRole(state, 'cliente')}>
        <Stack.Screen name="(customer)" />
      </Stack.Protected>
      <Stack.Protected guard={hasRole(state, 'empleado')}>
        <Stack.Screen name="(employee)" />
      </Stack.Protected>
      <Stack.Protected guard={hasRole(state, 'administrador')}>
        <Stack.Screen name="(administrator)" />
      </Stack.Protected>
    </Stack>
  );
}

function openNotification(response: NotificationResponse | null): void {
  const destination = response
    ? getPushNotificationDestination(response.notification.request.content.data)
    : null;
  if (destination) {
    router.push(destination);
  }
}

function PushNotificationSetup() {
  const { state } = useAuth();
  const userId = state.status === 'signed-in' ? state.profile.id : null;
  const pendingResponse = React.useRef<NotificationResponse | null>(null);
  const handledResponseId = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (Platform.OS === 'web') {
      return undefined;
    }
    configurePushNotifications();
    let active = true;

    const handleResponse = (response: NotificationResponse | null) => {
      if (!active || !response) {
        return;
      }
      if (!userId) {
        pendingResponse.current = response;
        return;
      }
      const responseId = response.notification.request.identifier;
      if (handledResponseId.current === responseId) {
        return;
      }
      handledResponseId.current = responseId;
      pendingResponse.current = null;
      openNotification(response);
    };

    const subscription = addNotificationResponseReceivedListener(handleResponse);
    if (userId && pendingResponse.current) {
      const response = pendingResponse.current;
      pendingResponse.current = null;
      const responseId = response.notification.request.identifier;
      if (handledResponseId.current !== responseId) {
        handledResponseId.current = responseId;
        openNotification(response);
      }
    }
    void getLastNotificationResponseAsync().then(handleResponse);

    return () => {
      active = false;
      subscription.remove();
    };
  }, [userId]);

  React.useEffect(() => {
    if (!userId || Platform.OS === 'web') {
      return;
    }

    void pushNotificationService.registerCurrentDevicePushToken().catch(() => undefined);
  }, [userId]);

  return null;
}

function StripeUrlHandler() {
  const { handleURLCallback } = useStripe();

  React.useEffect(() => {
    let active = true;
    const handleUrl = ({ url }: { url: string }) => {
      if (active) {
        void handleURLCallback(url);
      }
    };
    const subscription = Linking.addEventListener('url', handleUrl);
    void Linking.getInitialURL().then((url) => {
      if (active && url) {
        void handleURLCallback(url);
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [handleURLCallback]);

  return null;
}

export default function RootLayout() {
  const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
  const stripeConfigured = isStripeAvailable({
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripePublishableKey,
  });
  const app = (
    <AuthProvider onBeforeSignOut={pushNotificationService.unregisterCurrentDevicePushToken}>
      <PushNotificationSetup />
      <RouteStack />
    </AuthProvider>
  );

  return (
    <SafeAreaProvider>
      {stripeConfigured ? (
        <StripeProvider publishableKey={stripePublishableKey} urlScheme="carwashnow">
          <StripeUrlHandler />
          {app}
        </StripeProvider>
      ) : app}
    </SafeAreaProvider>
  );
}

import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import type { AuthService } from '../services/authService';
import type { AuthProfile } from '../types/auth';
import { createTestEmail, createTestPassword, createTestPhone } from '../test-utils/testCredentials';

const TEST_PHONE = createTestPhone();
const TEST_PASSWORD = createTestPassword();

const CUSTOMER_PROFILE: AuthProfile = {
  id: 'customer-123',
  nombre: 'Ana',
  apellido: 'Pérez',
  correo: createTestEmail(),
  telefono: TEST_PHONE,
  rol: 'cliente',
};

async function flushAuthUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function AuthStateProbe() {
  const { state, signIn, register, signOut } = useAuth();
  const identity = state.status === 'signed-in' ? state.profile.id : 'none';

  return (
    <>
      <Text>{`${state.status}:${identity}`}</Text>
      <Pressable accessibilityRole="button" onPress={() => void signIn({ telefono: TEST_PHONE, password: TEST_PASSWORD })}>
        <Text>Sign in</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void register({
          nombre: 'Ana',
          apellido: 'Pérez',
          correo: CUSTOMER_PROFILE.correo,
          telefono: TEST_PHONE,
          password: TEST_PASSWORD,
        })}
      >
        <Text>Register</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void signOut()}>
        <Text>Sign out</Text>
      </Pressable>
    </>
  );
}

describe('AuthProvider custom session state', () => {
  it('restores the server-validated customer profile without subscribing to Supabase auth events', async () => {
    const service = {
      restoreSession: jest.fn().mockResolvedValue(CUSTOMER_PROFILE),
      signIn: jest.fn(),
      signOut: jest.fn(),
    } as unknown as AuthService;
    const view = render(
      <AuthProvider service={service}>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await flushAuthUpdates();

    expect(view.getByText('signed-in:customer-123')).toBeTruthy();
    expect(service.restoreSession).toHaveBeenCalledTimes(1);
    expect('onAuthStateChange' in service).toBe(false);
  });

  it('starts signed out when no local demo profile is stored', async () => {
    const service = {
      restoreSession: jest.fn().mockResolvedValue(null),
      signIn: jest.fn(),
      signOut: jest.fn(),
    } as unknown as AuthService;
    const view = render(
      <AuthProvider service={service}>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await flushAuthUpdates();

    expect(view.getByText('signed-out:none')).toBeTruthy();
  });

  it('keeps registration signed out and publishes a success notice', async () => {
    const service = {
      restoreSession: jest.fn().mockResolvedValue(null),
      signIn: jest.fn(),
      register: jest.fn().mockResolvedValue(CUSTOMER_PROFILE),
      signOut: jest.fn(),
    } as unknown as AuthService;
    const view = render(
      <AuthProvider service={service}>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await flushAuthUpdates();
    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Register' }));
      await Promise.resolve();
    });

    expect(view.getByText('signed-out:none')).toBeTruthy();
    expect(view.getByText('Cuenta creada. Ahora puedes iniciar sesión.')).toBeTruthy();
    expect(service.register).toHaveBeenCalledWith({
      nombre: 'Ana',
      apellido: 'Pérez',
      correo: CUSTOMER_PROFILE.correo,
      telefono: TEST_PHONE,
      password: TEST_PASSWORD,
    });
  });

  it('enters as the authenticated customer and clears state after revoking the session', async () => {
    const service = {
      restoreSession: jest.fn().mockResolvedValue(null),
      signIn: jest.fn().mockResolvedValue(CUSTOMER_PROFILE),
      signOut: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const view = render(
      <AuthProvider service={service}>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await flushAuthUpdates();
    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Sign in' }));
      await Promise.resolve();
    });

    expect(view.getByText('signed-in:customer-123')).toBeTruthy();
    expect(service.signIn).toHaveBeenCalledWith({ telefono: TEST_PHONE, password: TEST_PASSWORD });

    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Sign out' }));
      await Promise.resolve();
    });

    expect(view.getByText('signed-out:none')).toBeTruthy();
    expect(service.signOut).toHaveBeenCalledTimes(1);
  });
});

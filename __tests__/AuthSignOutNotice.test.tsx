import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import type { AuthService } from '../services/authService';
import CustomerProfileRoute from '../app/(customer)/(tabs)/profile';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

function ProtectedCustomerRoute() {
  const { state } = useAuth();
  return state.status === 'signed-in' ? <CustomerProfileRoute /> : <Text>Signed-out route</Text>;
}

async function flushAuthUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('custom-session sign-out notice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps failure feedback visible when server session revocation fails', async () => {
    const signOut = jest.fn().mockRejectedValue(new Error('Storage unavailable'));
    const service = {
      restoreSession: jest.fn().mockResolvedValue({
        id: 'customer-123', nombre: 'Ana', apellido: 'Pérez', correo: 'ana@example.com',
        telefono: '+541112345678', rol: 'cliente',
      }),
      signIn: jest.fn(),
      signOut,
    } as unknown as AuthService;
    const view = render(
      <AuthProvider service={service}>
        <ProtectedCustomerRoute />
      </AuthProvider>,
    );

    await flushAuthUpdates();
    expect(view.getByText('Tu perfil')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Cerrar sesión' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.getByText('Tu perfil')).toBeTruthy();
    expect(
      view.getByText(
        'No se pudo confirmar el cierre de sesión. Es posible que la sesión local ya haya finalizado.',
      ),
    ).toBeTruthy();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

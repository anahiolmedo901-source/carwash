import React from 'react';
import type { ComponentType } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import type { AuthService } from '../services/authService';
import AdministratorRoute from '../app/(administrator)/index';
import EmployeeRoute from '../app/(employee)/index';
import CustomerProfileRoute from '../app/(customer)/(tabs)/profile';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

function createService() {
  const signOut = jest.fn().mockRejectedValue(new Error('Local sign-out failed'));
  const service = {
    restoreSession: jest.fn().mockResolvedValue({
      id: 'customer-123', nombre: 'Ana', apellido: 'Pérez', correo: 'ana@example.com',
      telefono: '+541112345678', rol: 'cliente',
    }),
    signIn: jest.fn(),
    signOut,
  } as unknown as AuthService;

  return { service, signOut };
}

async function flushAuthUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const signOutScreens: Array<{
  name: string;
  Route: ComponentType;
  heading: string;
  signOutLabel: string;
}> = [
  {
    name: 'customer profile',
    Route: CustomerProfileRoute,
    heading: 'Tu perfil',
    signOutLabel: 'Cerrar sesión',
  },
  {
    name: 'employee placeholder',
    Route: EmployeeRoute,
    heading: 'Cuenta de empleado',
    signOutLabel: 'Cerrar sesión',
  },
  {
    name: 'administrator placeholder',
    Route: AdministratorRoute,
    heading: 'Panel de administración',
    signOutLabel: 'Cerrar sesión',
  },
];

describe.each(signOutScreens)('$name local sign-out failure', ({ Route, heading, signOutLabel }) => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows neutral feedback when session revocation fails', async () => {
    const { service, signOut } = createService();
    const view = render(
      <AuthProvider service={service}>
        <Route />
      </AuthProvider>,
    );

    await flushAuthUpdates();
    expect(view.getByText(heading)).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: signOutLabel }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      view.getByText(
        'No se pudo confirmar el cierre de sesión. Es posible que la sesión local ya haya finalizado.',
      ),
    ).toBeTruthy();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import LoginRoute from '../app/(auth)/login';
import RegisterRoute from '../app/(auth)/register';
import { useAuth } from '../context/AuthContext';
import { createTestEmail, createTestPassword, createTestPhone } from '../test-utils/testCredentials';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('registration route', () => {
  const register = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ register });
  });

  it('renders the existing registration form instead of the former unavailable notice', () => {
    const view = render(<RegisterRoute />);

    expect(view.getByText('Crea tu cuenta')).toBeTruthy();
    expect(view.getByLabelText('Nombre')).toBeTruthy();
    expect(view.getByLabelText('Contraseña')).toBeTruthy();
    expect(view.queryByText('Registration is unavailable')).toBeNull();

    fireEvent.press(view.getByRole('button', { name: 'Iniciar sesión' }));
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('links the existing login flow to registration', () => {
    (useAuth as jest.Mock).mockReturnValue({
      register,
      signIn: jest.fn(),
      state: { status: 'signed-out' },
    });
    const view = render(<LoginRoute />);

    fireEvent.press(view.getByRole('button', { name: 'Crear una' }));

    expect(router.push).toHaveBeenCalledWith('/(auth)/register');
  });

  it('submits the form through the auth context and returns to login', async () => {
    const view = render(<RegisterRoute />);
    const password = createTestPassword();

    fireEvent.changeText(view.getByLabelText('Nombre'), 'Ana');
    fireEvent.changeText(view.getByLabelText('Apellido'), 'Pérez');
    fireEvent.changeText(view.getByLabelText('Correo electrónico'), createTestEmail());
    fireEvent.changeText(view.getByLabelText('Teléfono'), createTestPhone());
    fireEvent.changeText(view.getByLabelText('Contraseña'), password);
    fireEvent.changeText(view.getByLabelText('Confirmar contraseña'), password);
    fireEvent.press(view.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(register).toHaveBeenCalledWith({
      nombre: 'Ana',
      apellido: 'Pérez',
      correo: expect.any(String),
      telefono: expect.any(String),
      password,
    }));
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});

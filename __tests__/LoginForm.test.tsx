import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { LoginForm } from '../components/LoginForm';
import { createTestPassword, createTestPhone } from '../test-utils/testCredentials';

describe('LoginForm', () => {
  it('validates and submits the entered phone and password', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onAuthenticated = jest.fn();
    const telefono = createTestPhone();
    const password = createTestPassword();
    const view = render(
      <LoginForm onSubmit={onSubmit} onAuthenticated={onAuthenticated} onRegister={jest.fn()} />,
    );

    fireEvent.changeText(view.getByLabelText('Teléfono'), telefono);
    fireEvent.changeText(view.getByLabelText('Contraseña'), password);
    fireEvent.press(view.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      telefono,
      password,
    }));
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('keeps invalid email and empty password local and displays validation feedback', () => {
    const onSubmit = jest.fn();
    const view = render(
      <LoginForm onSubmit={onSubmit} onAuthenticated={jest.fn()} onRegister={jest.fn()} />,
    );

    fireEvent.changeText(view.getByLabelText('Teléfono'), 'not-a-phone');
    fireEvent.press(view.getByRole('button', { name: 'Iniciar sesión' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(view.getByText('Introduce un teléfono válido.')).toBeTruthy();
    expect(view.getByText('Introduce tu contraseña.')).toBeTruthy();
  });

  it('shows a local sign-in error without entering the authenticated flow', async () => {
    const onAuthenticated = jest.fn();
    const telefono = createTestPhone();
    const view = render(
      <LoginForm
        onSubmit={jest.fn().mockRejectedValue(new Error('Invalid phone or password.'))}
        onAuthenticated={onAuthenticated}
        onRegister={jest.fn()}
      />,
    );
    fireEvent.changeText(view.getByLabelText('Teléfono'), telefono);
    fireEvent.changeText(view.getByLabelText('Contraseña'), createTestPassword());
    fireEvent.press(view.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(view.getByText('El teléfono o la contraseña no son válidos.')).toBeTruthy());
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('provides a reachable registration action', () => {
    const onRegister = jest.fn();
    const view = render(
      <LoginForm onSubmit={jest.fn()} onAuthenticated={jest.fn()} onRegister={onRegister} />,
    );

    fireEvent.press(view.getByRole('button', { name: 'Crear una' }));

    expect(onRegister).toHaveBeenCalledTimes(1);
  });
});

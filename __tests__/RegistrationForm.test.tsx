import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { RegistrationForm } from '../components/RegistrationForm';
import { createTestEmail, createTestPassword, createTestPhone } from '../test-utils/testCredentials';

const TEST_PASSWORD = createTestPassword();

function fillValidRegistration(view: ReturnType<typeof render>) {
  fireEvent.changeText(view.getByLabelText('Nombre'), 'Ana');
  fireEvent.changeText(view.getByLabelText('Apellido'), 'Pérez');
  fireEvent.changeText(view.getByLabelText('Correo electrónico'), createTestEmail());
  fireEvent.changeText(view.getByLabelText('Teléfono'), createTestPhone());
  fireEvent.changeText(view.getByLabelText('Contraseña'), TEST_PASSWORD);
  fireEvent.changeText(view.getByLabelText('Confirmar contraseña'), TEST_PASSWORD);
}

describe('RegistrationForm', () => {
  it('submits validated profile values and returns to sign-in after registration', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onSignIn = jest.fn();
    const view = render(
      <RegistrationForm onSubmit={onSubmit} onSignIn={onSignIn} />,
    );
    fillValidRegistration(view);
    fireEvent.press(view.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      nombre: 'Ana',
      apellido: 'Pérez',
      correo: expect.any(String),
      telefono: expect.any(String),
      password: TEST_PASSWORD,
    }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Confirm your email')).toBeNull();
  });

  it('never calls registration when the password confirmation does not match', () => {
    const onSubmit = jest.fn();
    const view = render(
      <RegistrationForm onSubmit={onSubmit} onSignIn={jest.fn()} />,
    );
    fillValidRegistration(view);
    fireEvent.changeText(view.getByLabelText('Confirmar contraseña'), 'DifferentPass9');
    fireEvent.press(view.getByRole('button', { name: 'Crear cuenta' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(view.getByText('Las contraseñas no coinciden.')).toBeTruthy();
  });

  it('shows a registration error without presenting email confirmation', async () => {
    const view = render(
      <RegistrationForm
        onSubmit={jest.fn().mockRejectedValue(new Error('No se pudo completar el registro.'))}
        onSignIn={jest.fn()}
      />,
    );
    fillValidRegistration(view);
    fireEvent.press(view.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(view.getByText('No se pudo completar el registro.')).toBeTruthy());
    expect(view.queryByText('Confirm your email')).toBeNull();
  });
});

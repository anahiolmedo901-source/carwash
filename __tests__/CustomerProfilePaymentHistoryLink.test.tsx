import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import CustomerProfileRoute from '../app/(customer)/(tabs)/profile';
import { useAuth } from '../context/AuthContext';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../hooks/useSignOutFeedback', () => ({
  useSignOutFeedback: (signOut: () => Promise<void>) => ({ leaveAccount: signOut }),
}));

const auth = useAuth as jest.Mock;
const navigation = router as unknown as { push: jest.Mock };

describe('customer profile payment history link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockReturnValue({
      state: {
        status: 'signed-in',
        profile: {
          id: 'customer-1',
          nombre: 'Ana',
          apellido: 'Pérez',
          correo: 'ana@example.com',
          telefono: '555-0100',
        },
      },
      signOut: jest.fn(async () => undefined),
    });
  });

  it('links to payment history without adding it to the tab order', () => {
    const view = render(<CustomerProfileRoute />);

    fireEvent.press(view.getByRole('button', { name: 'Ver historial de pagos' }));
    expect(navigation.push).toHaveBeenCalledWith('/pagos');
    expect(view.queryByRole('button', { name: 'Diagnóstico de sensores' })).toBeNull();
  });
});

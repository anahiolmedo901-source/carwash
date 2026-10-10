import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import PaymentRoute from '../app/(customer)/pago/[id]';
import { paymentService } from '../services/paymentService';
import { reservationService } from '../services/reservationService';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../services/paymentService', () => ({
  paymentService: { checkout: jest.fn() },
}));
jest.mock('../services/reservationService', () => ({
  reservationService: { getReservation: jest.fn() },
}));

const params = useLocalSearchParams as jest.Mock;
const navigation = router as unknown as { push: jest.Mock };
const reservations = reservationService as unknown as { getReservation: jest.Mock };
const payments = paymentService as unknown as { checkout: jest.Mock };

const RESERVATION = {
  id: 'reservation-1',
  vehicleId: 'vehicle-1',
  autolavadoId: 'wash-1',
  serviceId: 'service-1',
  spaceId: null,
  date: '2026-10-20',
  time: '10:30',
  status: 'pendiente' as const,
  qrCode: 'database-qr-1',
  autolavadoName: 'Lavado Centro',
  serviceName: 'Lavado premium',
  price: 250,
  durationMinutes: 45,
  vehicleBrand: 'Honda',
  vehicleModel: 'Civic',
  vehiclePlate: 'ABC-123',
  createdAt: '2026-10-04T12:00:00.000Z',
  updatedAt: '2026-10-04T12:00:00.000Z',
};

const PAYMENT_RESULT = {
  payment: {
    id: 'payment-1',
    reservationId: 'reservation-1',
    amount: 250,
    method: 'tarjeta_credito' as const,
    status: 'pagado' as const,
    externalReference: 'server-reference-1',
    paidAt: '2026-10-20T10:00:05.000Z',
    createdAt: '2026-10-20T10:00:00.000Z',
  },
  outcome: 'approved' as const,
};

const STRIPE_PAYMENT_SESSION = {
  payment: {
    ...PAYMENT_RESULT.payment,
    status: 'procesando' as const,
    externalReference: 'pi_test_1',
  },
  clientSecret: 'pi_test_1_secret_test',
  currency: 'mxn',
};

describe('sandbox payment route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({ id: 'reservation-1' });
    reservations.getReservation.mockResolvedValue(RESERVATION);
    payments.checkout.mockResolvedValue(PAYMENT_RESULT);
  });

  it('reloads the reservation, labels the sandbox flow, and exposes exactly the allowed methods', async () => {
    const view = render(<PaymentRoute />);

    await waitFor(() => expect(view.getByText('Pagar en entorno de prueba')).toBeTruthy());
    expect(reservations.getReservation).toHaveBeenCalledWith('reservation-1');
    expect(view.getByText('Lavado Centro')).toBeTruthy();
    expect(view.getByText('Servicio: Lavado premium')).toBeTruthy();
    expect(view.getByText('Vehículo: Honda Civic')).toBeTruthy();
    expect(view.getByText('Fecha: 2026-10-20')).toBeTruthy();
    expect(view.getByText('Hora: 10:30')).toBeTruthy();
    expect(view.getByText('Total: $250')).toBeTruthy();
    expect(view.getByText('Entorno de prueba')).toBeTruthy();
    expect(view.getAllByRole('button', { name: /Método de pago:/ })).toHaveLength(5);
  });

  it('submits only the reservation id and selected method, then navigates with only the payment id', async () => {
    const view = render(<PaymentRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Método de pago: Tarjeta de crédito' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Método de pago: Tarjeta de crédito' }));
    fireEvent.press(view.getByRole('button', { name: 'Pagar en entorno de prueba' }));

    await waitFor(() => expect(payments.checkout).toHaveBeenCalledWith({
      reservationId: 'reservation-1',
      method: 'tarjeta_credito',
    }));
    expect(JSON.stringify(payments.checkout.mock.calls)).not.toContain('monto');
    expect(JSON.stringify(payments.checkout.mock.calls)).not.toContain('estado');
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith({
      pathname: '/pago/resultado/[paymentId]',
      params: { paymentId: 'payment-1' },
    }));
    expect(JSON.stringify(navigation.push.mock.calls)).not.toContain('reservation-1');
    expect(JSON.stringify(navigation.push.mock.calls)).not.toContain('estado');
    expect(view.queryByText('Pago confirmado')).toBeNull();
    expect(view.queryByText('Resultado sandbox recibido')).toBeNull();
  });

  it('keeps the payment form available after a sandbox failure so the customer can retry', async () => {
    payments.checkout
      .mockRejectedValueOnce(new Error('El entorno de prueba no está disponible.'))
      .mockResolvedValueOnce(PAYMENT_RESULT);
    const view = render(<PaymentRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Método de pago: Tarjeta de crédito' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Método de pago: Tarjeta de crédito' }));
    fireEvent.press(view.getByRole('button', { name: 'Pagar en entorno de prueba' }));

    await waitFor(() => expect(view.getByText('No se pudo procesar el pago en el entorno de prueba: El entorno de prueba no está disponible.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Pagar en entorno de prueba' })).toBeTruthy());

    fireEvent.press(view.getByRole('button', { name: 'Pagar en entorno de prueba' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith({
      pathname: '/pago/resultado/[paymentId]',
      params: { paymentId: 'payment-1' },
    }));
    expect(payments.checkout).toHaveBeenCalledTimes(2);
  });

  it('does not repeat the translated sandbox failure message', async () => {
    payments.checkout.mockRejectedValueOnce(new Error('The sandbox payment provider failed: unavailable.'));
    const view = render(<PaymentRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Método de pago: Tarjeta de crédito' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Método de pago: Tarjeta de crédito' }));
    fireEvent.press(view.getByRole('button', { name: 'Pagar en entorno de prueba' }));

    await waitFor(() => expect(view.getByText('No se pudo procesar el pago en el entorno de prueba.')).toBeTruthy());
    expect(view.queryByText('No se pudo procesar el pago en el entorno de prueba: No se pudo procesar el pago en el entorno de prueba.')).toBeNull();
  });

  it('opens Stripe without requiring a legacy payment method selection', async () => {
    const previousStripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_51abc123';
    const stripePayments = {
      checkout: jest.fn(),
      createStripePaymentIntent: jest.fn().mockResolvedValue(STRIPE_PAYMENT_SESSION),
    };

    try {
      const view = render(<PaymentRoute paymentService={stripePayments} />);

      await waitFor(() => expect(view.getByRole('button', { name: 'Pagar con Stripe' })).toBeTruthy());
      fireEvent.press(view.getByRole('button', { name: 'Pagar con Stripe' }));

      await waitFor(() => expect(stripePayments.createStripePaymentIntent).toHaveBeenCalledWith('reservation-1'));
      await waitFor(() => expect(navigation.push).toHaveBeenCalledWith({
        pathname: '/pago/resultado/[paymentId]',
        params: { paymentId: 'payment-1' },
      }));
      expect(stripePayments.checkout).not.toHaveBeenCalled();
    } finally {
      if (previousStripeKey === undefined) {
        delete process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      } else {
        process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = previousStripeKey;
      }
    }
  });

  it('keeps the sandbox when the service exposes Stripe but the build has no publishable key', async () => {
    const previousStripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    delete process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const stripeCapablePayments = {
      checkout: jest.fn().mockResolvedValue(PAYMENT_RESULT),
      createStripePaymentIntent: jest.fn(),
    };

    try {
      const view = render(<PaymentRoute paymentService={stripeCapablePayments} />);

      await waitFor(() => expect(view.getByRole('button', { name: 'Pagar en entorno de prueba' })).toBeTruthy());
      expect(view.getByText('Entorno de prueba')).toBeTruthy();
      expect(view.queryByRole('button', { name: 'Pagar con Stripe' })).toBeNull();
    } finally {
      if (previousStripeKey === undefined) {
        delete process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      } else {
        process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = previousStripeKey;
      }
    }
  });
});

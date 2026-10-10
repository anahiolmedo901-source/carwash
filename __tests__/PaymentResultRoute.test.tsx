import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import PaymentResultRoute from '../app/(customer)/pago/resultado/[paymentId]';
import { paymentService } from '../services/paymentService';
import { reservationService } from '../services/reservationService';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../services/paymentService', () => ({
  paymentService: { getPayment: jest.fn() },
}));
jest.mock('../services/reservationService', () => ({
  reservationService: { getReservation: jest.fn() },
}));

const params = useLocalSearchParams as jest.Mock;
const navigation = router as unknown as { push: jest.Mock };
const payments = paymentService as unknown as { getPayment: jest.Mock };
const reservations = reservationService as unknown as { getReservation: jest.Mock };

const PAYMENT = {
  id: 'payment-1',
  reservationId: 'reservation-1',
  amount: 250,
  method: 'tarjeta_credito' as const,
  status: 'pagado' as const,
  externalReference: 'server-reference-1',
  paidAt: '2026-10-20T10:00:05.000Z',
  createdAt: '2026-10-20T10:00:00.000Z',
};

const RESERVATION = {
  id: 'reservation-1',
  vehicleId: 'vehicle-1',
  autolavadoId: 'wash-1',
  serviceId: 'service-1',
  spaceId: null,
  date: '2026-10-20',
  time: '10:30',
  status: 'confirmada' as const,
  qrCode: 'database-qr-1',
  autolavadoName: 'Lavado Centro',
  serviceName: 'Lavado premium',
  price: 250,
  durationMinutes: 45,
  vehicleBrand: 'Honda',
  vehicleModel: 'Civic',
  vehiclePlate: 'ABC-123',
  createdAt: '2026-10-04T12:00:00.000Z',
  updatedAt: '2026-10-20T10:00:05.000Z',
};

describe('sandbox payment result route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({ paymentId: 'payment-1' });
    payments.getPayment.mockResolvedValue(PAYMENT);
    reservations.getReservation.mockResolvedValue(RESERVATION);
  });

  it('loads the payment and reservation from owner-scoped services before showing confirmation', async () => {
    const view = render(<PaymentResultRoute />);

    await waitFor(() => expect(view.getByText('Pago confirmado')).toBeTruthy());
    expect(payments.getPayment).toHaveBeenCalledWith('payment-1');
    expect(reservations.getReservation).toHaveBeenCalledWith('reservation-1');
    expect(view.getByText('La reservación está confirmada.')).toBeTruthy();
    expect(view.getByText('Lavado Centro')).toBeTruthy();
    expect(view.queryByText('server-reference-1')).toBeNull();
  });

  it.each([
    ['pendiente', 'Pago pendiente'],
    ['procesando', 'Pago en procesamiento'],
    ['rechazado', 'Pago rechazado'],
    ['cancelado', 'Pago cancelado'],
    ['reembolsado', 'Pago reembolsado'],
  ] as const)('shows an explicit %s state without false confirmation', async (status, expectedTitle) => {
    payments.getPayment.mockResolvedValue({ ...PAYMENT, status });
    reservations.getReservation.mockResolvedValue({ ...RESERVATION, status: 'pendiente' });
    const view = render(<PaymentResultRoute />);

    await waitFor(() => expect(view.getByText(expectedTitle)).toBeTruthy());
    expect(view.queryByText('Pago confirmado')).toBeNull();
    expect(view.getByRole('button', { name: 'Consultar de nuevo' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Volver a mis reservaciones' })).toBeTruthy();
  });

  it('shows a server-state error when a paid payment does not have a confirmed reservation', async () => {
    payments.getPayment.mockResolvedValue(PAYMENT);
    reservations.getReservation.mockResolvedValue({ ...RESERVATION, status: 'cancelada' });
    const view = render(<PaymentResultRoute />);

    await waitFor(() => expect(view.getByText('No se pudo confirmar la reservación')).toBeTruthy());
    expect(view.queryByText('Pago confirmado')).toBeNull();
  });

  it('offers retry and safe navigation when authoritative state cannot be loaded', async () => {
    payments.getPayment
      .mockRejectedValueOnce(new Error('payment unavailable'))
      .mockResolvedValueOnce(PAYMENT);
    const view = render(<PaymentResultRoute />);

    await waitFor(() => expect(view.getByText('No se pudo consultar el estado del pago.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(view.getByText('Pago confirmado')).toBeTruthy());

    fireEvent.press(view.getByRole('button', { name: 'Volver a mis reservaciones' }));
    expect(navigation.push).toHaveBeenCalledWith('/reservaciones');
  });
});

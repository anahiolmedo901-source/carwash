import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import PaymentSummaryRoute from '../app/(customer)/pago/resumen/[id]';
import { reservationService } from '../services/reservationService';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../services/reservationService', () => ({
  reservationService: { getReservation: jest.fn() },
}));

const params = useLocalSearchParams as jest.Mock;
const navigation = router as unknown as { push: jest.Mock };
const reservations = reservationService as unknown as { getReservation: jest.Mock };

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

describe('payment purchase summary route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({ id: 'reservation-1' });
    reservations.getReservation.mockResolvedValue(RESERVATION);
  });

  it('reloads the authoritative reservation and displays the purchase summary', async () => {
    const view = render(<PaymentSummaryRoute />);

    await waitFor(() => expect(view.getByText('Resumen de pago')).toBeTruthy());
    expect(reservations.getReservation).toHaveBeenCalledWith('reservation-1');
    expect(view.getByText('Lavado Centro')).toBeTruthy();
    expect(view.getByText('Servicio: Lavado premium')).toBeTruthy();
    expect(view.getByText('Vehículo: Honda Civic')).toBeTruthy();
    expect(view.getByText('Fecha: 2026-10-20')).toBeTruthy();
    expect(view.getByText('Hora: 10:30')).toBeTruthy();
    expect(view.getByText('Total: $250')).toBeTruthy();
    expect(view.getByText('Pago seguro con Stripe')).toBeTruthy();
  });

  it('continues with only the reservation id and does not claim payment confirmation', async () => {
    const view = render(<PaymentSummaryRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Continuar al pago' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Continuar al pago' }));

    expect(navigation.push).toHaveBeenCalledWith({
      pathname: '/pago/[id]',
      params: { id: 'reservation-1' },
    });
    expect(view.queryByText('Pago confirmado')).toBeNull();
  });
});

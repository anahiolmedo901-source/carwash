import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ReservationDetailRoute from '../app/(customer)/reservacion/[id]';
import { reservationService } from '../services/reservationService';
import type { Reservation } from '../types/reservation';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../services/reservationService', () => ({
  reservationService: { getReservation: jest.fn(), cancelReservation: jest.fn() },
}));

const params = useLocalSearchParams as jest.Mock;
const service = reservationService as unknown as {
  getReservation: jest.Mock;
  cancelReservation: jest.Mock;
};

const RESERVATION: Reservation = {
  id: 'reservation-1',
  vehicleId: 'vehicle-1',
  autolavadoId: 'wash-1',
  serviceId: 'service-1',
  spaceId: 'space-1',
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
  updatedAt: '2026-10-04T12:00:00.000Z',
};

describe('reservation detail screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({ id: 'reservation-1' });
    service.getReservation.mockResolvedValue(RESERVATION);
    service.cancelReservation.mockResolvedValue({ ...RESERVATION, status: 'cancelada' });
  });

  it('shows requested reservation fields, status, QR, loading, and back', async () => {
    const view = render(<ReservationDetailRoute />);

    await waitFor(() => expect(view.getByText('Detalle de reservación')).toBeTruthy());
    expect(view.getByText('Lavado Centro')).toBeTruthy();
    expect(view.getByText('Servicio: Lavado premium')).toBeTruthy();
    expect(view.getByText('Vehículo: Honda Civic')).toBeTruthy();
    expect(view.getByText('Precio: $250')).toBeTruthy();
    expect(view.getByText('Duración: 45 minutos')).toBeTruthy();
    expect(view.getByText('Fecha: 2026-10-20')).toBeTruthy();
    expect(view.getByText('Hora: 10:30')).toBeTruthy();
    expect(view.getByText('Estado: Confirmada')).toBeTruthy();
    expect(view.getByText('Código QR: database-qr-1')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Volver' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('handles a missing QR without rendering a literal null value', async () => {
    service.getReservation.mockResolvedValue({ ...RESERVATION, qrCode: null });
    const view = render(<ReservationDetailRoute />);

    await waitFor(() => expect(view.getByText('Detalle de reservación')).toBeTruthy());
    expect(view.getByText('Código QR no disponible.')).toBeTruthy();
    expect(view.queryByText('Código QR: null')).toBeNull();
  });

  it('requires confirmation, guards duplicate cancellation, and refreshes status', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let resolveCancel: ((value: Reservation) => void) | undefined;
    service.cancelReservation.mockImplementation(() => new Promise((resolve) => {
      resolveCancel = resolve;
    }));
    const view = render(<ReservationDetailRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Cancelar reservación' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Cancelar reservación' }));
    expect(alert).toHaveBeenCalledWith(
      'Cancelar reservación',
      '¿Quieres cancelar esta reservación? El historial se conservará.',
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0][2];
    const confirm = buttons?.find((button) => button.text === 'Cancelar reservación');
    await act(async () => {
      confirm?.onPress?.();
      confirm?.onPress?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(service.cancelReservation).toHaveBeenCalledTimes(1));
    expect(view.getByRole('button', { name: 'Cancelando reservación…' }).props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      resolveCancel?.({ ...RESERVATION, status: 'cancelada' });
      await Promise.resolve();
    });
    await waitFor(() => expect(view.getByText('Reservación cancelada correctamente.')).toBeTruthy());
    expect(view.getByText('Estado: Cancelada')).toBeTruthy();
    alert.mockRestore();
  });

  it('does not offer cancellation for a later reservation state', async () => {
    service.getReservation.mockResolvedValue({ ...RESERVATION, status: 'en_lavado' });
    const view = render(<ReservationDetailRoute />);

    await waitFor(() => expect(view.getByText('Estado: En lavado')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Cancelar reservación' })).toBeNull();
    expect(view.getByText('Esta reservación ya no se puede cancelar.')).toBeTruthy();
  });
});

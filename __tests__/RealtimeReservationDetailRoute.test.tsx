import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
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
const service = reservationService as unknown as { getReservation: jest.Mock; cancelReservation: jest.Mock };

const RESERVATION: Reservation = {
  id: 'reservation-1',
  vehicleId: 'vehicle-1',
  autolavadoId: 'wash-1',
  serviceId: 'service-1',
  spaceId: null,
  date: '2099-10-20',
  time: '10:30',
  status: 'confirmada',
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

describe('reservation detail Realtime integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({ id: 'reservation-1' });
    service.getReservation.mockResolvedValue(RESERVATION);
  });

  it('updates only the matching reservation status and timestamp', async () => {
    let eventListener: ((event: { entityId: string; status: Reservation['status']; updatedAt: string }) => void) | undefined;
    const realtimeService = {
      subscribeToCustomerReservations: jest.fn((_customerId: string, listener: typeof eventListener) => {
        eventListener = listener;
        return jest.fn();
      }),
    };
    const view = render(
      <ReservationDetailRoute realtimeService={realtimeService} customerId="customer-1" />,
    );

    await waitFor(() => expect(view.getByText('Estado: Confirmada')).toBeTruthy());
    await act(async () => {
      eventListener?.({ entityId: 'another-reservation', status: 'finalizada', updatedAt: '2026-10-05T12:00:00.000Z' });
    });
    expect(view.getByText('Estado: Confirmada')).toBeTruthy();

    await act(async () => {
      eventListener?.({ entityId: 'reservation-1', status: 'en_lavado', updatedAt: '2026-10-05T12:00:00.000Z' });
    });
    expect(view.getByText('Estado: En lavado')).toBeTruthy();
    expect(service.getReservation).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer Realtime status when a stale detail reload finishes later', async () => {
    let resolveStaleReload!: (reservation: Reservation) => void;
    const staleReload = new Promise<Reservation>((resolve) => {
      resolveStaleReload = resolve;
    });
    service.getReservation
      .mockResolvedValueOnce(RESERVATION)
      .mockReturnValueOnce(staleReload);
    const realtimeService = {
      subscribeToCustomerReservations: jest.fn((_customerId: string, listener: (event: { entityId: string; status: Reservation['status']; updatedAt: string }) => void) => {
        void listener;
        return jest.fn();
      }),
    };
    let eventListener: ((event: { entityId: string; status: Reservation['status']; updatedAt: string }) => void) | undefined;
    realtimeService.subscribeToCustomerReservations.mockImplementation((_customerId, listener) => {
      eventListener = listener;
      return jest.fn();
    });
    const firstService = { getReservation: service.getReservation, cancelReservation: service.cancelReservation };
    const view = render(
      <ReservationDetailRoute service={firstService} realtimeService={realtimeService} customerId="customer-1" />,
    );

    await waitFor(() => expect(view.getByText('Estado: Confirmada')).toBeTruthy());
    view.rerender(
      <ReservationDetailRoute
        service={{ getReservation: service.getReservation, cancelReservation: service.cancelReservation }}
        realtimeService={realtimeService}
        customerId="customer-1"
      />,
    );
    await act(async () => {
      eventListener?.({ entityId: 'reservation-1', status: 'en_lavado', updatedAt: '2026-10-05T12:00:00.000Z' });
    });
    resolveStaleReload(RESERVATION);

    await waitFor(() => expect(view.getByText('Estado: En lavado')).toBeTruthy());
  });
});

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import ReservationsRoute from '../app/(customer)/(tabs)/reservaciones';
import { reservationService } from '../services/reservationService';
import type { Reservation } from '../types/reservation';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../services/reservationService', () => ({ reservationService: { listReservations: jest.fn() } }));

const service = reservationService as unknown as { listReservations: jest.Mock };

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

describe('reservation list Realtime integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.listReservations.mockResolvedValue([RESERVATION]);
  });

  it('merges only live status fields and reclassifies the reservation without reloading', async () => {
    let eventListener: ((event: { entityId: string; status: Reservation['status']; updatedAt: string }) => void) | undefined;
    const unsubscribe = jest.fn();
    const realtimeService = {
      subscribeToCustomerReservations: jest.fn((_customerId: string, listener: typeof eventListener) => {
        eventListener = listener;
        return unsubscribe;
      }),
    };
    const view = render(
      <ReservationsRoute realtimeService={realtimeService} customerId="customer-1" />,
    );

    await waitFor(() => expect(view.getByText('Próximas')).toBeTruthy());
    expect(view.getByText('Estado: Confirmada')).toBeTruthy();

    await act(async () => {
      eventListener?.({ entityId: 'reservation-1', status: 'cancelada', updatedAt: '2026-10-05T12:00:00.000Z' });
    });

    expect(view.getByText('Canceladas')).toBeTruthy();
    expect(view.getByText('Estado: Cancelada')).toBeTruthy();
    expect(service.listReservations).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('unsubscribes when the customer identity changes and on unmount', async () => {
    const unsubscribers: jest.Mock[] = [];
    const realtimeService = {
      subscribeToCustomerReservations: jest.fn(() => {
        const unsubscribe = jest.fn();
        unsubscribers.push(unsubscribe);
        return unsubscribe;
      }),
    };
    const view = render(
      <ReservationsRoute realtimeService={realtimeService} customerId="customer-1" />,
    );
    await waitFor(() => expect(realtimeService.subscribeToCustomerReservations).toHaveBeenCalledTimes(1));

    view.rerender(<ReservationsRoute realtimeService={realtimeService} customerId="customer-2" />);
    await waitFor(() => expect(realtimeService.subscribeToCustomerReservations).toHaveBeenCalledTimes(2));
    expect(unsubscribers[0]).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(unsubscribers[1]).toHaveBeenCalledTimes(1);
  });

  it('does not let an older reload replace a newer Realtime update', async () => {
    let resolveStaleReload!: (reservations: Reservation[]) => void;
    const staleReload = new Promise<Reservation[]>((resolve) => {
      resolveStaleReload = resolve;
    });
    service.listReservations
      .mockResolvedValueOnce([RESERVATION])
      .mockReturnValueOnce(staleReload);

    let eventListener: ((event: { entityId: string; status: Reservation['status']; updatedAt: string }) => void) | undefined;
    const realtimeService = {
      subscribeToCustomerReservations: jest.fn((_customerId: string, listener: typeof eventListener) => {
        eventListener = listener;
        return jest.fn();
      }),
    };
    const firstService = { listReservations: service.listReservations };
    const view = render(
      <ReservationsRoute service={firstService} realtimeService={realtimeService} customerId="customer-1" />,
    );

    await waitFor(() => expect(view.getByText('Estado: Confirmada')).toBeTruthy());
    view.rerender(
      <ReservationsRoute
        service={{ listReservations: service.listReservations }}
        realtimeService={realtimeService}
        customerId="customer-1"
      />,
    );
    await act(async () => {
      eventListener?.({ entityId: 'reservation-1', status: 'finalizada', updatedAt: '2026-10-05T12:00:00.000Z' });
    });
    resolveStaleReload([RESERVATION]);

    await waitFor(() => expect(view.getByText('Estado: Finalizada')).toBeTruthy());
  });
});

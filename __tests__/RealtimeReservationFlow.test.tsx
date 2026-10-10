import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ReservationRoute from '../app/(customer)/reservar';
import { autolavadoService } from '../services/autolavadoService';
import { reservationService } from '../services/reservationService';
import { vehicleService } from '../services/vehicleService';
import type { SpaceStatus } from '../types/realtime';
import { formatReservationDate } from '../utils/reservationSchedule';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../services/autolavadoService', () => ({ autolavadoService: { getAutolavado: jest.fn() } }));
jest.mock('../services/vehicleService', () => ({ vehicleService: { listVehicles: jest.fn() } }));
jest.mock('../services/reservationService', () => ({
  reservationService: { getAvailableSpaces: jest.fn(), createReservation: jest.fn() },
}));

const params = useLocalSearchParams as jest.Mock;
const wash = autolavadoService as unknown as { getAutolavado: jest.Mock };
const vehicles = vehicleService as unknown as { listVehicles: jest.Mock };
const reservations = reservationService as unknown as { getAvailableSpaces: jest.Mock; createReservation: jest.Mock };
const testDateValue = new Date();
testDateValue.setDate(testDateValue.getDate() + 1);
const TEST_DATE = formatReservationDate(testDateValue);

function selectDate(view: ReturnType<typeof render>) {
  const now = new Date();
  if (testDateValue.getMonth() !== now.getMonth() || testDateValue.getFullYear() !== now.getFullYear()) {
    fireEvent.press(view.getByRole('button', { name: 'Mes siguiente' }));
  }
  fireEvent.press(view.getByRole('button', { name: `Seleccionar ${TEST_DATE}` }));
}

function selectTime(view: ReturnType<typeof render>) {
  fireEvent.press(view.getByRole('button', { name: 'Seleccionar horario 10:30' }));
}

describe('reservation flow Realtime space integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({ autolavadoId: 'wash-1', serviceId: 'service-1' });
    wash.getAutolavado.mockResolvedValue({
      id: 'wash-1',
      name: 'Lavado Centro',
      imageUrl: 'https://example.com/wash.jpg',
      description: 'Limpieza.',
      address: 'Av. Central 123',
      hours: '08:00 - 20:00',
      rating: 4.5,
      reviewCount: 12,
      services: [{ id: 'service-1', autolavadoId: 'wash-1', name: 'Lavado premium', description: 'Limpieza.', price: 250, approximateDurationMinutes: 45 }],
       spaces: [{ id: 'space-1', autolavadoId: 'wash-1', name: 'Bay 1', status: 'disponible', active: true }],
    });
    vehicles.listVehicles.mockResolvedValue([{ id: 'vehicle-1', marca: 'Honda', modelo: 'Civic', anio: 2021, color: 'Azul', placas: 'ABC-123', tipo: 'sedan', created_at: '2026-10-01', updated_at: '2026-10-01' }]);
    reservations.getAvailableSpaces.mockResolvedValue({ requiresSpace: true, available: true, spaces: [{ id: 'space-1' }] });
    reservations.createReservation.mockResolvedValue({
      id: 'reservation-1',
      vehicleId: 'vehicle-1',
      autolavadoId: 'wash-1',
      serviceId: 'service-1',
      spaceId: 'space-1',
       date: TEST_DATE,
      time: '10:30',
      status: 'pendiente',
      qrCode: 'database-qr-1',
      autolavadoName: 'Lavado Centro',
      serviceName: 'Lavado premium',
      price: 250,
      durationMinutes: 45,
      vehicleBrand: 'Honda',
      vehicleModel: 'Civic',
      vehiclePlate: 'ABC-123',
       createdAt: `${TEST_DATE}T10:30:00.000Z`,
       updatedAt: `${TEST_DATE}T10:30:00.000Z`,
    });
  });

  it('shows the exact space state, clears an unavailable selection, and re-queries authoritative availability', async () => {
    let eventListener: ((event: { entityId: string; status: SpaceStatus; updatedAt: string }) => void) | undefined;
    const realtimeService = {
      subscribeToSpaceStatus: jest.fn((_autolavadoId: string, listener: typeof eventListener) => {
        eventListener = listener;
        return jest.fn();
      }),
      subscribeToCustomerReservations: jest.fn(() => jest.fn()),
    };
    const view = render(
      <ReservationRoute realtimeService={realtimeService} customerId="customer-1" />,
    );

    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar Honda Civic' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar Honda Civic' }));
    selectDate(view);
    selectTime(view);
    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar espacio space-1' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar espacio space-1' }));

    const callsBeforeEvent = reservations.getAvailableSpaces.mock.calls.length;
    await act(async () => {
      eventListener?.({ entityId: 'space-1', status: 'ocupado', updatedAt: '2099-10-20T10:00:00.000Z' });
    });

    expect(view.getByText('Estado del espacio space-1: Ocupado')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Revisar reservación' })).toBeNull();
    await waitFor(() => expect(reservations.getAvailableSpaces.mock.calls.length).toBeGreaterThan(callsBeforeEvent));
  });

  it('hands off to payment and cleans up the customer reservation subscription', async () => {
    const unsubscribe = jest.fn();
    const realtimeService = {
      subscribeToSpaceStatus: jest.fn(() => jest.fn()),
      subscribeToCustomerReservations: jest.fn(() => unsubscribe),
    };
    const view = render(
      <ReservationRoute realtimeService={realtimeService} customerId="customer-1" />,
    );

    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar Honda Civic' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar Honda Civic' }));
    selectDate(view);
    selectTime(view);
    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar espacio space-1' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar espacio space-1' }));
    fireEvent.press(view.getByRole('button', { name: 'Revisar reservación' }));
    fireEvent.press(view.getByRole('button', { name: 'Confirmar reservación' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith({
      pathname: '/pago/resumen/[id]',
      params: { id: 'reservation-1' },
    }));
    await waitFor(() => expect(realtimeService.subscribeToCustomerReservations).toHaveBeenCalledTimes(1));
    expect(view.queryByText('Código QR: database-qr-1')).toBeNull();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import ReservationsRoute, { classifyReservations } from '../app/(customer)/(tabs)/reservaciones';
import { reservationService } from '../services/reservationService';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../services/reservationService', () => ({ reservationService: { listReservations: jest.fn() } }));

const service = reservationService as unknown as { listReservations: jest.Mock };

function reservation(id: string, date: string, time: string, status: 'pendiente' | 'confirmada' | 'finalizada' | 'cancelada') {
  return {
    id,
    vehicleId: 'vehicle-1',
    autolavadoId: 'wash-1',
    serviceId: 'service-1',
    spaceId: null,
    date,
    time,
    status,
    qrCode: `qr-${id}`,
    autolavadoName: `Lavado ${id}`,
    serviceName: 'Lavado premium',
    price: 250,
    durationMinutes: 45,
    vehicleBrand: 'Honda',
    vehicleModel: 'Civic',
    vehiclePlate: 'ABC-123',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  } as const;
}

const RECORDS = [
  reservation('upcoming', '2026-10-11', '09:00', 'confirmada'),
  reservation('past', '2026-10-09', '09:00', 'pendiente'),
  reservation('finished', '2026-10-20', '09:00', 'finalizada'),
  reservation('cancelled', '2026-10-01', '09:00', 'cancelada'),
];

describe('Mis reservaciones screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.listReservations.mockResolvedValue(RECORDS);
  });

  it('classifies active future, past, finalizada, and cancelada records by the exact rules', () => {
    expect(classifyReservations(RECORDS, '2026-10-10T12:00')).toEqual({
      upcoming: [RECORDS[0]],
      previous: [RECORDS[1], RECORDS[2]],
      cancelled: [RECORDS[3]],
    });
  });

  it('renders Próximas, Anteriores, and Canceladas sections and opens detail', async () => {
    const view = render(<ReservationsRoute />);

    await waitFor(() => expect(view.getByText('Próximas')).toBeTruthy());
    expect(view.getByText('Anteriores')).toBeTruthy();
    expect(view.getByText('Canceladas')).toBeTruthy();
    expect(view.getByText('Lavado upcoming')).toBeTruthy();
    expect(view.getByText('Lavado past')).toBeTruthy();
    expect(view.getByText('Lavado cancelled')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver reservación de Lavado upcoming' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/reservacion/[id]', params: { id: 'upcoming' } });
  });

  it('shows loading, retry, and empty states', async () => {
    service.listReservations.mockReturnValueOnce(new Promise(() => undefined));
    const loading = render(<ReservationsRoute />);
    expect(loading.getByText('Cargando tus reservaciones…')).toBeTruthy();

    service.listReservations.mockRejectedValueOnce(new Error('Request failed'));
    const error = render(<ReservationsRoute />);
    await waitFor(() => expect(error.getByText('No se pudieron cargar tus reservaciones.')).toBeTruthy());
    fireEvent.press(error.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(service.listReservations).toHaveBeenCalledTimes(3));

    service.listReservations.mockResolvedValueOnce([]);
    const empty = render(<ReservationsRoute />);
    await waitFor(() => expect(empty.getByText('Todavía no tienes reservaciones.')).toBeTruthy());
  });
});

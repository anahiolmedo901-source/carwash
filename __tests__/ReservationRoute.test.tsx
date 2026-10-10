import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ReservationRoute from '../app/(customer)/reservar';
import { autolavadoService } from '../services/autolavadoService';
import { reservationService } from '../services/reservationService';
import { vehicleService } from '../services/vehicleService';
import { formatReservationDate } from '../utils/reservationSchedule';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../services/autolavadoService', () => ({
  autolavadoService: { getAutolavado: jest.fn() },
}));

jest.mock('../services/vehicleService', () => ({
  vehicleService: { listVehicles: jest.fn() },
}));

jest.mock('../services/reservationService', () => ({
  reservationService: {
    getAvailableSpaces: jest.fn(),
    createReservation: jest.fn(),
  },
}));

const params = useLocalSearchParams as jest.Mock;
const autolavado = autolavadoService as unknown as { getAutolavado: jest.Mock };
const vehicles = vehicleService as unknown as { listVehicles: jest.Mock };
const reservations = reservationService as unknown as {
  getAvailableSpaces: jest.Mock;
  createReservation: jest.Mock;
};

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

function selectTime(view: ReturnType<typeof render>, time = '10:30') {
  fireEvent.press(view.getByRole('button', { name: `Seleccionar horario ${time}` }));
}

const DETAIL = {
  id: 'wash-1',
  name: 'Lavado Centro',
  imageUrl: 'https://example.com/wash-1.jpg',
  description: 'Limpieza exterior e interior.',
  address: 'Av. Central 123',
  hours: '08:00 - 20:00',
  rating: 4.5,
  reviewCount: 12,
  services: [{
    id: 'service-1',
    autolavadoId: 'wash-1',
    name: 'Lavado premium',
    description: 'Limpieza profunda.',
    price: 250,
    approximateDurationMinutes: 45,
  }],
  spaces: [],
};

const VEHICLE = {
  id: 'vehicle-1',
  marca: 'Honda',
  modelo: 'Civic',
  anio: 2021,
  color: 'Azul',
  placas: 'ABC-123',
  tipo: 'sedan' as const,
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
};

const CREATED_RESERVATION = {
  id: 'reservation-1',
  vehicleId: 'vehicle-1',
  autolavadoId: 'wash-1',
  serviceId: 'service-1',
  spaceId: null,
  date: TEST_DATE,
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

describe('reservation creation wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({
      autolavadoId: 'wash-1',
      autolavadoName: 'Lavado Centro',
      serviceId: 'service-1',
      serviceName: 'Lavado premium',
    });
    autolavado.getAutolavado.mockResolvedValue(DETAIL);
    vehicles.listVehicles.mockResolvedValue([VEHICLE]);
    reservations.getAvailableSpaces.mockResolvedValue({
      requiresSpace: false,
      available: true,
      spaces: [],
    });
    reservations.createReservation.mockResolvedValue(CREATED_RESERVATION);
  });

  it('loads the selected context and customer vehicles', async () => {
    const view = render(<ReservationRoute />);

    await waitFor(() => expect(view.getByText('Selecciona un vehículo')).toBeTruthy());
    expect(view.getByText('Lavado Centro')).toBeTruthy();
    expect(view.getByText('Lavado premium')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Seleccionar Honda Civic' })).toBeTruthy();
    expect(autolavado.getAutolavado).toHaveBeenCalledWith('wash-1');
    expect(vehicles.listVehicles).toHaveBeenCalledTimes(1);
  });

  it('requires ordered selections and hands the created reservation to payment checkout', async () => {
    const view = render(<ReservationRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar Honda Civic' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar Honda Civic' }));
    selectDate(view);
    selectTime(view);

    await waitFor(() => expect(reservations.getAvailableSpaces).toHaveBeenCalledWith({
      autolavadoId: 'wash-1', serviceId: 'service-1', date: TEST_DATE, time: '10:30',
    }));
    fireEvent.press(view.getByRole('button', { name: 'Revisar reservación' }));

    expect(view.getByText('Resumen de reservación')).toBeTruthy();
    expect(view.getByText('Precio: $250')).toBeTruthy();
    expect(view.getByText('Duración: 45 minutos')).toBeTruthy();
    expect(view.getByText(`Fecha: ${TEST_DATE}`)).toBeTruthy();
    expect(view.getByText('Hora: 10:30')).toBeTruthy();

    fireEvent.press(view.getByRole('button', { name: 'Confirmar reservación' }));
    await waitFor(() => expect(reservations.createReservation).toHaveBeenCalledWith({
      autolavadoId: 'wash-1', serviceId: 'service-1', vehicleId: 'vehicle-1',
      date: TEST_DATE, time: '10:30', spaceId: null,
    }));
    await waitFor(() => expect((router.push as jest.Mock)).toHaveBeenCalledWith({
      pathname: '/pago/resumen/[id]',
      params: { id: 'reservation-1' },
    }));
    expect(view.queryByText('Código QR: database-qr-1')).toBeNull();
    expect(view.queryByText('Pago confirmado')).toBeNull();
    expect(JSON.stringify(reservations.createReservation.mock.calls)).not.toContain('usuario_id');
    expect(JSON.stringify(reservations.createReservation.mock.calls)).not.toContain('codigo_qr');
  });

  it('selects an applicable available space and shows an explicit occupied state', async () => {
    reservations.getAvailableSpaces
      .mockResolvedValueOnce({ requiresSpace: true, available: true, spaces: [{ id: 'space-1' }] })
      .mockResolvedValueOnce({ requiresSpace: true, available: false, spaces: [] });
    const view = render(<ReservationRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar Honda Civic' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar Honda Civic' }));
    selectDate(view);
    selectTime(view);
    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar espacio space-1' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar espacio space-1' }));
    expect(view.getByRole('button', { name: 'Revisar reservación' })).toBeTruthy();

    selectTime(view, '11:30');
    await waitFor(() => expect(view.getByText('No hay espacios disponibles para este horario.')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Revisar reservación' })).toBeNull();
  });

  it('shows validation feedback before querying availability', async () => {
    const view = render(<ReservationRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar Honda Civic' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar Honda Civic' }));
    expect(view.queryByText('Selecciona la hora')).toBeNull();
    expect(reservations.getAvailableSpaces).not.toHaveBeenCalled();
  });

  it('shows a conflict returned by the atomic create RPC', async () => {
    reservations.createReservation.mockRejectedValueOnce(new Error('The selected time or washing space is occupied.'));
    const view = render(<ReservationRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar Honda Civic' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar Honda Civic' }));
    selectDate(view);
    selectTime(view);
    await waitFor(() => expect(view.getByRole('button', { name: 'Revisar reservación' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Revisar reservación' }));
    fireEvent.press(view.getByRole('button', { name: 'Confirmar reservación' }));

    await waitFor(() => expect(view.getByText('No se pudo crear la reservación: El horario o el espacio de lavado seleccionado está ocupado.')).toBeTruthy());
    expect(view.getByRole('button', { name: 'Confirmar reservación' })).toBeTruthy();
  });

  it('shows a server conflict and allows retrying the availability check', async () => {
    reservations.getAvailableSpaces.mockRejectedValueOnce(new Error('The selected time is occupied.'));
    const view = render(<ReservationRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Seleccionar Honda Civic' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Seleccionar Honda Civic' }));
    selectDate(view);
    selectTime(view);

    await waitFor(() => expect(view.getByText('No se pudo consultar la disponibilidad.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Reintentar disponibilidad' }));
    await waitFor(() => expect(reservations.getAvailableSpaces).toHaveBeenCalledTimes(2));
  });
});

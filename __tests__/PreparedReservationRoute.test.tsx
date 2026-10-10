import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ReservationRoute from '../app/(customer)/reservar';
import { autolavadoService } from '../services/autolavadoService';
import { reservationService } from '../services/reservationService';
import { vehicleService } from '../services/vehicleService';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../services/autolavadoService', () => ({ autolavadoService: { getAutolavado: jest.fn() } }));
jest.mock('../services/vehicleService', () => ({ vehicleService: { listVehicles: jest.fn() } }));
jest.mock('../services/reservationService', () => ({
  reservationService: { getAvailableSpaces: jest.fn(), createReservation: jest.fn() },
}));

const params = useLocalSearchParams as jest.Mock;
const detailService = autolavadoService as unknown as { getAutolavado: jest.Mock };
const vehicleReader = vehicleService as unknown as { listVehicles: jest.Mock };
const availabilityService = reservationService as unknown as { getAvailableSpaces: jest.Mock };

describe('reservation destination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({
      autolavadoId: 'wash-1',
      autolavadoName: 'Lavado Centro',
      serviceId: 'service-1',
      serviceName: 'Lavado premium',
    });
    detailService.getAutolavado.mockResolvedValue({
      id: 'wash-1',
      name: 'Lavado Centro',
      imageUrl: 'https://example.com/wash.jpg',
      description: 'Limpieza.',
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
    });
    vehicleReader.listVehicles.mockResolvedValue([{
      id: 'vehicle-1', marca: 'Honda', modelo: 'Civic', anio: 2021, color: 'Azul', placas: 'ABC-123', tipo: 'sedan',
      created_at: '2026-10-01T12:00:00.000Z', updated_at: '2026-10-01T12:00:00.000Z',
    }]);
    availabilityService.getAvailableSpaces.mockResolvedValue({ requiresSpace: false, available: true, spaces: [] });
  });

  it('replaces the informational destination with the reservation wizard', async () => {
    const view = render(<ReservationRoute />);

    await waitFor(() => expect(view.getByText('Selecciona un vehículo')).toBeTruthy());
    expect(view.getByText('Lavado Centro')).toBeTruthy();
    expect(view.getByText('Lavado premium')).toBeTruthy();
    expect(view.queryByText('Las reservaciones aún no están implementadas.')).toBeNull();
  });

  it('keeps the back action available from the wizard', async () => {
    const view = render(<ReservationRoute />);

    await waitFor(() => expect(view.getByText('Selecciona un vehículo')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Volver' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AutolavadoDetailRoute from '../app/(customer)/autolavado/[id]';
import { autolavadoService } from '../services/autolavadoService';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../services/autolavadoService', () => ({
  autolavadoService: {
    listAutolavados: jest.fn(),
    getAutolavado: jest.fn(),
  },
}));

const service = autolavadoService as unknown as {
  listAutolavados: jest.Mock;
  getAutolavado: jest.Mock;
};
const params = useLocalSearchParams as jest.Mock;

const DETAIL = {
  id: 'wash-1',
  name: 'Lavado Centro',
  imageUrl: 'https://example.com/wash-1.jpg',
  description: 'Limpieza exterior e interior para tu vehículo.',
  address: 'Av. Central 123',
  hours: '07:00 - 18:00',
  rating: 4.5,
  reviewCount: 12,
  services: [
    {
      id: 'service-1',
      autolavadoId: 'wash-1',
      name: 'Lavado premium',
      description: 'Incluye limpieza profunda.',
      price: 250,
      approximateDurationMinutes: 45,
    },
  ],
  spaces: [],
};

describe('Autolavado detail screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({ id: 'wash-1' });
    service.getAutolavado.mockResolvedValue(DETAIL);
  });

  it('shows a loading state while detail data is retrieved', () => {
    service.getAutolavado.mockReturnValue(new Promise(() => undefined));

    const view = render(<AutolavadoDetailRoute />);

    expect(view.getByText('Cargando detalles del autolavado…')).toBeTruthy();
  });

  it('shows an error and allows retrying detail data', async () => {
    service.getAutolavado.mockRejectedValueOnce(new Error('Request failed'));
    const view = render(<AutolavadoDetailRoute />);

    await waitFor(() => expect(view.getByText('No se pudieron cargar los detalles del autolavado.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(service.getAutolavado).toHaveBeenCalledTimes(2));
  });

  it('shows an empty state when the requested autolavado does not exist', async () => {
    service.getAutolavado.mockResolvedValue(null);
    const view = render(<AutolavadoDetailRoute />);

    await waitFor(() => expect(view.getByText('No se encontró el autolavado solicitado.')).toBeTruthy());
  });

  it('renders the detail and service fields', async () => {
    const view = render(<AutolavadoDetailRoute />);

    await waitFor(() => expect(view.getByText('Lavado Centro')).toBeTruthy());
    expect(view.getByLabelText('Imagen de Lavado Centro')).toBeTruthy();
    expect(view.getByText('Limpieza exterior e interior para tu vehículo.')).toBeTruthy();
    expect(view.getByText('Av. Central 123')).toBeTruthy();
    expect(view.getByText('Horario: 07:00 - 18:00')).toBeTruthy();
    expect(view.getByText('Calificación: 4.5')).toBeTruthy();
    expect(view.getByText('Lavado premium')).toBeTruthy();
    expect(view.getByText('Incluye limpieza profunda.')).toBeTruthy();
    expect(view.getByText('Precio: $250')).toBeTruthy();
    expect(view.getByText('Duración aproximada: 45 min')).toBeTruthy();
  });

  it('shows an empty service state without inventing service data', async () => {
    service.getAutolavado.mockResolvedValue({ ...DETAIL, services: [] });
    const view = render(<AutolavadoDetailRoute />);

    await waitFor(() => expect(view.getByText('Este autolavado no tiene servicios disponibles.')).toBeTruthy());
  });

  it('navigates to the prepared reservation screen with selected context', async () => {
    const view = render(<AutolavadoDetailRoute />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Reservar' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Reservar' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/reservar',
      params: {
        autolavadoId: 'wash-1',
        autolavadoName: 'Lavado Centro',
        serviceId: 'service-1',
        serviceName: 'Lavado premium',
      },
    });
  });
});

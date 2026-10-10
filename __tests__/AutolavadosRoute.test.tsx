import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import CarWashesRoute from '../app/(customer)/(tabs)/autolavados';
import { autolavadoService } from '../services/autolavadoService';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
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

const WASH = {
  id: 'wash-1',
  name: 'Lavado Centro',
  imageUrl: 'https://example.com/wash-1.jpg',
  address: 'Av. Central 123',
  hours: '07:00 - 18:00',
  rating: 4.5,
  reviewCount: 12,
};

describe('Autolavados screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.listAutolavados.mockResolvedValue([WASH]);
  });

  it('shows a loading state while autolavados are retrieved', () => {
    service.listAutolavados.mockReturnValue(new Promise(() => undefined));

    const view = render(<CarWashesRoute />);

    expect(view.getByText('Cargando autolavados…')).toBeTruthy();
  });

  it('shows an error and retries the list request', async () => {
    service.listAutolavados.mockRejectedValueOnce(new Error('Request failed'));
    const view = render(<CarWashesRoute />);

    await waitFor(() => expect(view.getByText('No se pudieron cargar los autolavados.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(service.listAutolavados).toHaveBeenCalledTimes(2));
  });

  it('shows an empty state when no autolavados are available', async () => {
    service.listAutolavados.mockResolvedValue([]);
    const view = render(<CarWashesRoute />);

    await waitFor(() => expect(view.getByText('No hay autolavados disponibles.')).toBeTruthy());
  });

  it('renders the required card fields and navigates to detail', async () => {
    const view = render(<CarWashesRoute />);

    await waitFor(() => expect(view.getByText('Lavado Centro')).toBeTruthy());
    expect(view.getByLabelText('Imagen de Lavado Centro')).toBeTruthy();
    expect(view.getByText('Av. Central 123')).toBeTruthy();
    expect(view.getByText('Horario: 07:00 - 18:00')).toBeTruthy();
    expect(view.getByText('Calificación: 4.5')).toBeTruthy();
    expect(view.getByText('12 reseñas')).toBeTruthy();

    fireEvent.press(view.getByRole('button', { name: 'Ver detalles de Lavado Centro' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/autolavado/[id]',
      params: { id: 'wash-1' },
    });
  });
});

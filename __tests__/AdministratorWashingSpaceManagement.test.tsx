import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AdministratorWashingSpaceManagement from '../components/AdministratorWashingSpaceManagement';
import type { AdministratorService } from '../types/administrator';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

const WASH = { id: 'wash-1', name: 'Central wash' };
const SPACE = {
  id: 'space-1',
  autolavadoId: 'wash-1',
  name: 'Bay 1',
  status: 'ocupado' as const,
  active: true,
};

function createService(): jest.Mocked<AdministratorService> {
  return {
    getDashboard: jest.fn(),
    listAutolavados: jest.fn(),
    listEmployees: jest.fn(),
    listReservations: jest.fn(),
    updateReservationStatus: jest.fn(),
    listRatings: jest.fn(),
    listServices: jest.fn(),
    createService: jest.fn(),
    updateService: jest.fn(),
    deleteService: jest.fn(),
    listWashingSpaces: jest.fn(),
    createWashingSpace: jest.fn(),
    updateWashingSpace: jest.fn(),
    deleteWashingSpace: jest.fn(),
  };
}

describe('administrator washing-space management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading, request errors, retry, and empty states', async () => {
    const loadingService = createService();
    loadingService.listWashingSpaces.mockReturnValue(new Promise(() => undefined));
    loadingService.listAutolavados.mockResolvedValue([WASH]);
    const loadingView = render(<AdministratorWashingSpaceManagement service={loadingService} />);
    expect(loadingView.getByText('Cargando espacios de lavado…')).toBeTruthy();

    const errorService = createService();
    errorService.listWashingSpaces.mockRejectedValueOnce(new Error('No se pudieron leer los espacios de lavado.')).mockResolvedValue([]);
    errorService.listAutolavados.mockResolvedValue([WASH]);
    const errorView = render(<AdministratorWashingSpaceManagement service={errorService} />);
    await waitFor(() => expect(errorView.getByText('No se pudieron cargar los espacios de lavado: No se pudieron leer los espacios de lavado.')).toBeTruthy());
    fireEvent.press(errorView.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(errorService.listWashingSpaces).toHaveBeenCalledTimes(2));

    const emptyService = createService();
    emptyService.listWashingSpaces.mockResolvedValue([]);
    emptyService.listAutolavados.mockResolvedValue([WASH]);
    const emptyView = render(<AdministratorWashingSpaceManagement service={emptyService} />);
    await waitFor(() => expect(emptyView.getByText('No hay espacios de lavado disponibles.')).toBeTruthy());
  });

  it('creates a washing space with the selected service and refreshes the list', async () => {
    const service = createService();
    service.listWashingSpaces.mockResolvedValueOnce([]).mockResolvedValueOnce([SPACE]);
    service.listAutolavados.mockResolvedValue([WASH]);
    service.createWashingSpace.mockResolvedValue(SPACE);

    const view = render(<AdministratorWashingSpaceManagement service={service} />);
    await waitFor(() => expect(view.getByText('No hay espacios de lavado disponibles.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Agregar espacio de lavado' }));
    fireEvent.changeText(view.getByLabelText('Nombre del espacio de lavado'), 'Bay 1');
    fireEvent.press(view.getByRole('button', { name: 'Ocupado' }));
    fireEvent.press(view.getByRole('button', { name: 'Guardar espacio de lavado' }));

    await waitFor(() => expect(service.createWashingSpace).toHaveBeenCalledWith({
      autolavadoId: 'wash-1',
      name: 'Bay 1',
      status: 'ocupado',
      active: true,
    }));
    await waitFor(() => expect(view.getByText('Espacio de lavado creado correctamente.')).toBeTruthy());
    expect(service.listWashingSpaces).toHaveBeenCalledTimes(2);
    expect(view.getByRole('button', { name: 'Editar espacio de lavado 1' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Eliminar espacio de lavado 1' })).toBeTruthy();
  });

  it('surfaces a referenced-record delete conflict without retrying automatically', async () => {
    const service = createService();
    service.listWashingSpaces.mockResolvedValue([SPACE]);
    service.listAutolavados.mockResolvedValue([WASH]);
    service.deleteWashingSpace.mockRejectedValueOnce(new Error('The washing space is referenced by operational records.'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const view = render(<AdministratorWashingSpaceManagement service={service} />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Eliminar espacio de lavado 1' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Eliminar espacio de lavado 1' }));

    const buttons = alert.mock.calls[0]?.[2] as Array<{ text?: string; onPress?: () => void }> | undefined;
    const confirm = buttons?.find((button) => button.text === 'Eliminar');
    await act(async () => {
      confirm?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(view.getByText(
      'No se pudo eliminar el espacio de lavado: El espacio de lavado está asociado a registros operativos.',
    )).toBeTruthy());
    expect(service.deleteWashingSpace).toHaveBeenCalledTimes(1);
    expect(service.listWashingSpaces).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AdministratorServiceManagement from '../components/AdministratorServiceManagement';
import type { AdministratorService } from '../types/administrator';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

const WASH = { id: 'wash-1', name: 'Central wash' };
const SERVICE = {
  id: 'service-1',
  autolavadoId: 'wash-1',
  name: 'Express wash',
  description: 'Exterior cleaning.',
  price: 250,
  durationMinutes: 45,
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

describe('administrator service management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading, request errors, retry, and empty states', async () => {
    const loadingService = createService();
    loadingService.listServices.mockReturnValue(new Promise(() => undefined));
    loadingService.listAutolavados.mockResolvedValue([WASH]);
    const loadingView = render(<AdministratorServiceManagement service={loadingService} />);
    expect(loadingView.getByText('Cargando servicios…')).toBeTruthy();

    const errorService = createService();
    errorService.listServices.mockRejectedValueOnce(new Error('No se pudo leer el servicio.')).mockResolvedValue([]);
    errorService.listAutolavados.mockResolvedValue([WASH]);
    const errorView = render(<AdministratorServiceManagement service={errorService} />);
    await waitFor(() => expect(errorView.getByText('No se pudieron cargar los servicios: No se pudo leer el servicio.')).toBeTruthy());
    fireEvent.press(errorView.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(errorService.listServices).toHaveBeenCalledTimes(2));

    const emptyService = createService();
    emptyService.listServices.mockResolvedValue([]);
    emptyService.listAutolavados.mockResolvedValue([WASH]);
    const emptyView = render(<AdministratorServiceManagement service={emptyService} />);
    await waitFor(() => expect(emptyView.getByText('No hay servicios disponibles.')).toBeTruthy());
  });

  it('validates and creates a service, then refreshes the service list', async () => {
    const service = createService();
    service.listServices.mockResolvedValueOnce([]).mockResolvedValueOnce([SERVICE]);
    service.listAutolavados.mockResolvedValue([WASH]);
    service.createService.mockResolvedValue(SERVICE);

    const view = render(<AdministratorServiceManagement service={service} />);
    await waitFor(() => expect(view.getByText('No hay servicios disponibles.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Agregar servicio' }));
    fireEvent.press(view.getByRole('button', { name: 'Central wash' }));
    fireEvent.press(view.getByRole('button', { name: 'Guardar servicio' }));
    expect(view.getByText('Ingresa el nombre del servicio.')).toBeTruthy();
    expect(service.createService).not.toHaveBeenCalled();

    fireEvent.changeText(view.getByLabelText('Nombre del servicio'), 'Express wash');
    fireEvent.changeText(view.getByLabelText('Descripción'), 'Exterior cleaning.');
    fireEvent.changeText(view.getByLabelText('Precio'), '250');
    fireEvent.changeText(view.getByLabelText('Duración en minutos'), '45');
    fireEvent.press(view.getByRole('button', { name: 'Guardar servicio' }));

    await waitFor(() => expect(service.createService).toHaveBeenCalledWith({
      autolavadoId: 'wash-1',
      name: 'Express wash',
      description: 'Exterior cleaning.',
      price: 250,
      durationMinutes: 45,
      active: true,
    }));
    await waitFor(() => expect(view.getByText('Servicio creado correctamente.')).toBeTruthy());
    expect(service.listServices).toHaveBeenCalledTimes(2);
    expect(view.getByRole('button', { name: 'Editar Express wash' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Eliminar Express wash' })).toBeTruthy();
  });

  it('rejects a blank price but accepts an explicitly entered zero price', async () => {
    const service = createService();
    service.listServices.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...SERVICE, price: 0 }]);
    service.listAutolavados.mockResolvedValue([WASH]);
    service.createService.mockResolvedValue({ ...SERVICE, price: 0 });

    const view = render(<AdministratorServiceManagement service={service} />);
    await waitFor(() => expect(view.getByText('No hay servicios disponibles.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Agregar servicio' }));
    fireEvent.press(view.getByRole('button', { name: 'Central wash' }));
    fireEvent.changeText(view.getByLabelText('Nombre del servicio'), 'Free wash');
    fireEvent.changeText(view.getByLabelText('Descripción'), 'Promotional service.');
    fireEvent.changeText(view.getByLabelText('Precio'), '   ');
    fireEvent.changeText(view.getByLabelText('Duración en minutos'), '30');
    fireEvent.press(view.getByRole('button', { name: 'Guardar servicio' }));

    expect(view.getByText('Ingresa el precio del servicio.')).toBeTruthy();
    expect(service.createService).not.toHaveBeenCalled();

    fireEvent.changeText(view.getByLabelText('Precio'), '0');
    fireEvent.press(view.getByRole('button', { name: 'Guardar servicio' }));

    await waitFor(() => expect(service.createService).toHaveBeenCalledWith({
      autolavadoId: 'wash-1',
      name: 'Free wash',
      description: 'Promotional service.',
      price: 0,
      durationMinutes: 30,
      active: true,
    }));
    await waitFor(() => expect(view.getByText('Servicio creado correctamente.')).toBeTruthy());
  });

  it('surfaces a referenced-record delete conflict without retrying automatically', async () => {
    const service = createService();
    service.listServices.mockResolvedValue([SERVICE]);
    service.listAutolavados.mockResolvedValue([WASH]);
    service.deleteService.mockRejectedValueOnce(new Error('The service is referenced by an existing reservation.'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const view = render(<AdministratorServiceManagement service={service} />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Eliminar Express wash' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Eliminar Express wash' }));

    const buttons = alert.mock.calls[0]?.[2] as Array<{ text?: string; onPress?: () => void }> | undefined;
    const confirm = buttons?.find((button) => button.text === 'Eliminar');
    await act(async () => {
      confirm?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(view.getByText(
      'No se pudo eliminar el servicio "Express wash": El servicio está asociado a una reservación existente.',
    )).toBeTruthy());
    expect(service.deleteService).toHaveBeenCalledTimes(1);
    expect(service.listServices).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});

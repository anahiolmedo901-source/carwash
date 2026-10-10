import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import VehiclesRoute from '../app/(customer)/(tabs)/vehiculos';
import { vehicleService } from '../services/vehicleService';

jest.mock('../services/vehicleService', () => ({
  vehicleService: {
    listVehicles: jest.fn(),
    getVehicle: jest.fn(),
    createVehicle: jest.fn(),
    updateVehicle: jest.fn(),
    deleteVehicle: jest.fn(),
  },
}));

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

const service = vehicleService as unknown as {
  listVehicles: jest.Mock;
  getVehicle: jest.Mock;
  createVehicle: jest.Mock;
  updateVehicle: jest.Mock;
  deleteVehicle: jest.Mock;
};

describe('Mis vehículos screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.listVehicles.mockResolvedValue([VEHICLE]);
    service.getVehicle.mockResolvedValue(VEHICLE);
    service.createVehicle.mockResolvedValue(VEHICLE);
    service.updateVehicle.mockResolvedValue(VEHICLE);
    service.deleteVehicle.mockResolvedValue(true);
  });

  it('shows a loading state while the list is being retrieved', () => {
    service.listVehicles.mockReturnValue(new Promise(() => undefined));

    const view = render(<VehiclesRoute />);

    expect(view.getByText('Cargando tus vehículos…')).toBeTruthy();
  });

  it('shows an error and allows the customer to retry loading', async () => {
    service.listVehicles.mockRejectedValueOnce(new Error('Request failed'));
    const view = render(<VehiclesRoute />);

    await waitFor(() => expect(view.getByText('No se pudieron cargar tus vehículos.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(service.listVehicles).toHaveBeenCalledTimes(2));
  });

  it('shows an empty state with an action to add the first vehicle', async () => {
    service.listVehicles.mockResolvedValue([]);
    const view = render(<VehiclesRoute />);

    await waitFor(() => expect(view.getByText('Todavía no tienes vehículos registrados.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Agregar vehículo' }));
    expect(view.getByText('Agregar vehículo')).toBeTruthy();
    expect(view.getByLabelText('Marca')).toBeTruthy();
  });

  it('shows the requested card fields and opens an owner-scoped detail view', async () => {
    const view = render(<VehiclesRoute />);

    await waitFor(() => expect(view.getByText('Honda Civic')).toBeTruthy());
    expect(view.getByText('Año: 2021')).toBeTruthy();
    expect(view.getByText('Color: Azul')).toBeTruthy();
    expect(view.getByText('Placas: ABC-123')).toBeTruthy();
    expect(view.getByText('Tipo: Sedán')).toBeTruthy();

    fireEvent.press(view.getByRole('button', { name: 'Ver detalles de Honda Civic' }));
    await waitFor(() => expect(service.getVehicle).toHaveBeenCalledWith(VEHICLE.id));
    expect(view.getByText('Detalles del vehículo')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Editar vehículo' })).toBeTruthy();
  });

  it('creates a vehicle, refreshes the list, and shows success feedback', async () => {
    service.listVehicles.mockResolvedValueOnce([]).mockResolvedValueOnce([VEHICLE]);
    const view = render(<VehiclesRoute />);

    await waitFor(() => expect(view.getByText('Todavía no tienes vehículos registrados.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Agregar vehículo' }));
    fireEvent.changeText(view.getByLabelText('Marca'), 'Honda');
    fireEvent.changeText(view.getByLabelText('Modelo'), 'Civic');
    fireEvent.changeText(view.getByLabelText('Año'), '2021');
    fireEvent.changeText(view.getByLabelText('Color'), 'Azul');
    fireEvent.changeText(view.getByLabelText('Placas'), 'ABC-123');
    fireEvent.press(view.getByRole('button', { name: 'Sedán' }));
    fireEvent.press(view.getByRole('button', { name: 'Guardar vehículo' }));

    await waitFor(() => expect(service.createVehicle).toHaveBeenCalledWith({
      marca: 'Honda', modelo: 'Civic', anio: 2021, color: 'Azul', placas: 'ABC-123', tipo: 'sedan',
    }));
    await waitFor(() => expect(view.getByText('Vehículo guardado correctamente.')).toBeTruthy());
    expect(view.getByText('Honda Civic')).toBeTruthy();
  });

  it('edits a vehicle and refreshes the detail view', async () => {
    const view = render(<VehiclesRoute />);
    await waitFor(() => expect(view.getByText('Honda Civic')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Ver detalles de Honda Civic' }));
    await waitFor(() => expect(view.getByText('Detalles del vehículo')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Editar vehículo' }));
    fireEvent.changeText(view.getByLabelText('Color'), 'Gris');
    fireEvent.press(view.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(service.updateVehicle).toHaveBeenCalledWith(VEHICLE.id, expect.objectContaining({ color: 'Gris' })));
    expect(view.getByText('Vehículo actualizado correctamente.')).toBeTruthy();
  });

  it('requires confirmation before deleting a vehicle', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = render(<VehiclesRoute />);
    await waitFor(() => expect(view.getByText('Honda Civic')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Ver detalles de Honda Civic' }));
    await waitFor(() => expect(view.getByText('Detalles del vehículo')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Eliminar vehículo' }));

    expect(alert).toHaveBeenCalledWith(
      'Eliminar vehículo',
      '¿Quieres retirar este vehículo de tu lista? Se conservará el historial de sus reservaciones.',
      expect.any(Array),
    );
    expect(service.deleteVehicle).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2];
    const confirm = buttons?.find((button) => button.text === 'Eliminar');
    await act(async () => {
      confirm?.onPress?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(service.deleteVehicle).toHaveBeenCalledWith(VEHICLE.id));
    expect(view.getByText('Vehículo eliminado correctamente.')).toBeTruthy();
    alert.mockRestore();
  });

  it('disables duplicate delete submissions and shows pending feedback', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let resolveDelete: ((deleted: boolean) => void) | undefined;
    service.deleteVehicle.mockImplementation(() => new Promise((resolve) => {
      resolveDelete = resolve;
    }));
    const view = render(<VehiclesRoute />);
    await waitFor(() => expect(view.getByText('Honda Civic')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Ver detalles de Honda Civic' }));
    await waitFor(() => expect(view.getByText('Detalles del vehículo')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Eliminar vehículo' }));

    const buttons = alert.mock.calls[0][2];
    const confirm = buttons?.find((button) => button.text === 'Eliminar');
    act(() => {
      confirm?.onPress?.();
      confirm?.onPress?.();
    });

    await waitFor(() => expect(service.deleteVehicle).toHaveBeenCalledTimes(1));
    const pendingButton = view.getByRole('button', { name: 'Eliminando vehículo…' });
    expect(pendingButton.props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      resolveDelete?.(true);
      await Promise.resolve();
    });
    await waitFor(() => expect(view.getByText('Vehículo eliminado correctamente.')).toBeTruthy());
    alert.mockRestore();
  });
});

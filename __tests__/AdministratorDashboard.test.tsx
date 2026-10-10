import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import AdministratorRoute from '../app/(administrator)';
import AdministratorDashboard from '../components/AdministratorDashboard';
import type { AdministratorService } from '../types/administrator';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from '../context/AuthContext';

const WASH = { id: 'wash-1', name: 'Central wash' };
const EMPLOYEE = {
  id: 'employee-1',
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@example.test',
  phone: '5550001',
  active: true,
  assignments: [{ id: 'assignment-1', autolavadoId: 'wash-1', autolavadoName: 'Central wash', active: true }],
};
const RESERVATION = {
  id: 'reservation-1',
  date: '2026-10-20',
  time: '10:30:00',
  status: 'confirmada' as const,
  vehicleId: 'vehicle-1',
  vehicleBrand: 'Honda',
  vehicleModel: 'Civic',
  vehiclePlate: 'ABC-123',
  autolavadoId: 'wash-1',
  autolavadoName: 'Central wash',
  serviceId: 'service-1',
  serviceName: 'Express wash',
  spaceId: 'space-1',
  price: 250,
  durationMinutes: 45,
  customerFirstName: 'María',
  customerLastName: 'López',
  customerEmail: 'maria@example.test',
  customerPhone: '5550003',
  paymentStatus: 'pagado' as const,
  paymentAmount: 250,
  paymentPaidAt: '2026-10-20T10:00:00.000Z',
  createdAt: '2026-10-04T12:00:00.000Z',
  updatedAt: '2026-10-04T12:00:00.000Z',
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

function configureService(service: jest.Mocked<AdministratorService>) {
  service.getDashboard.mockResolvedValue({
    todayReservations: 3,
    collectedRevenue: 750,
    completedServices: 2,
    vehiclesCurrentlyWashing: 1,
    averageRating: 4.5,
    ratingCount: 8,
  });
  service.listAutolavados.mockResolvedValue([WASH]);
  service.listEmployees.mockResolvedValue([EMPLOYEE]);
  service.listReservations.mockResolvedValue([RESERVATION]);
}

describe('administrator dashboard route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      state: {
        status: 'signed-in',
        profile: {
          id: 'administrator-1',
          nombre: 'Ana',
          apellido: 'Pérez',
          correo: 'ana@example.test',
          telefono: '5550001',
          rol: 'administrador',
        },
      },
      signOut: jest.fn(),
    });
  });

  it('shows a loading state while administrator data is retrieved', () => {
    const service = createService();
    service.getDashboard.mockReturnValue(new Promise(() => undefined));
    service.listAutolavados.mockResolvedValue([]);
    service.listEmployees.mockResolvedValue([]);
    service.listReservations.mockResolvedValue([]);

    const view = render(<AdministratorDashboard administratorName="Ana Pérez" onSignOut={jest.fn()} service={service} />);

    expect(view.getByText('Cargando los datos de administración…')).toBeTruthy();
  });

  it('shows the request error and allows a retry', async () => {
    const service = createService();
    configureService(service);
    service.getDashboard.mockRejectedValueOnce(new Error('El panel no está disponible.'));

    const view = render(<AdministratorDashboard administratorName="Ana Pérez" onSignOut={jest.fn()} service={service} />);

    await waitFor(() => expect(view.getByText('No se pudieron cargar los datos de administración: El panel no está disponible.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(service.getDashboard).toHaveBeenCalledTimes(2));
  });

  it('renders metrics and read-only sections without employee or reservation mutation controls', async () => {
    const service = createService();
    configureService(service);

    const view = render(<AdministratorRoute service={service} />);

    await waitFor(() => expect(view.getByText('Reservaciones de hoy')).toBeTruthy());
    expect(view.getByText('3')).toBeTruthy();
    expect(view.getByText('$750.00')).toBeTruthy();
    expect(view.getByText('2')).toBeTruthy();
    expect(view.getByText('1')).toBeTruthy();

    fireEvent.press(view.getByRole('button', { name: 'Catálogo' }));
    expect(view.getAllByText('Central wash').length).toBeGreaterThan(0);

    fireEvent.press(view.getByRole('button', { name: 'Operación' }));
    expect(view.getByText('Ana Pérez')).toBeTruthy();
    expect(view.getAllByText('Express wash').length).toBeGreaterThan(0);
    expect(view.getByText('Cliente: María López')).toBeTruthy();
    expect(view.getByText('Estado: Confirmada')).toBeTruthy();
    expect(view.getByText('Pago: Pagado')).toBeTruthy();
    expect(view.queryByRole('button', { name: /edit employee|delete employee|cancel reservation/i })).toBeNull();
    expect(view.queryByText('database-qr-1')).toBeNull();
    expect(view.queryByText('session-token')).toBeNull();

    fireEvent.press(view.getByRole('button', { name: 'Administrar servicios' }));
    expect(router.push).toHaveBeenCalledWith('/services');
    fireEvent.press(view.getByRole('button', { name: 'Administrar espacios de lavado' }));
    expect(router.push).toHaveBeenCalledWith('/washing-spaces');
  });

  it('shows empty read-only sections and zero-safe metrics', async () => {
    const service = createService();
    service.getDashboard.mockResolvedValue({
      todayReservations: 0,
      collectedRevenue: 0,
      completedServices: 0,
      vehiclesCurrentlyWashing: 0,
      averageRating: 0,
      ratingCount: 0,
    });
    service.listAutolavados.mockResolvedValue([]);
    service.listEmployees.mockResolvedValue([]);
    service.listReservations.mockResolvedValue([]);

    const view = render(<AdministratorDashboard administratorName="Ana Pérez" onSignOut={jest.fn()} service={service} />);

    await waitFor(() => expect(view.getByText('Indicadores de hoy')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Catálogo' }));
    expect(view.getByText('No hay autolavados disponibles.')).toBeTruthy();

    fireEvent.press(view.getByRole('button', { name: 'Operación' }));
    expect(view.getByText('No hay empleados disponibles.')).toBeTruthy();
    expect(view.getByText('No hay reservaciones disponibles.')).toBeTruthy();

    fireEvent.press(view.getByRole('button', { name: 'Resumen' }));
    expect(view.getAllByText('0')).toHaveLength(4);
    expect(view.getByText('$0.00')).toBeTruthy();
  });
});

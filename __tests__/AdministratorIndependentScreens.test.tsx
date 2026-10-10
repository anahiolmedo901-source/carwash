import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AdministratorEmployeeManagement from '../components/AdministratorEmployeeManagement';
import AdministratorRatingManagement from '../components/AdministratorRatingManagement';
import AdministratorReservationManagement from '../components/AdministratorReservationManagement';
import type { AdministratorService } from '../types/administrator';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

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

const EMPLOYEE = {
  id: 'employee-1',
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@example.test',
  phone: '5550001',
  active: true,
  assignments: [{ id: 'assignment-1', autolavadoId: 'wash-1', autolavadoName: 'Central wash', active: true }],
};

const RATING = {
  id: 'rating-1',
  reservationId: 'reservation-1',
  reservationDate: '2026-10-20',
  reservationTime: '10:30:00',
  autolavadoId: 'wash-1',
  autolavadoName: 'Central wash',
  serviceName: 'Express wash',
  customerFirstName: 'María',
  customerLastName: 'López',
  rating: 5,
  comment: 'Excelente servicio.',
  createdAt: '2026-10-20T12:00:00.000Z',
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

describe('independent administrator screens', () => {
  it('filters reservations, opens details, and advances the operational status', async () => {
    const service = createService();
    service.listReservations.mockResolvedValue([RESERVATION]);
    service.updateReservationStatus.mockResolvedValue({
      id: RESERVATION.id,
      status: 'cliente_llego',
      updatedAt: '2026-10-20T12:10:00.000Z',
    });
    const view = render(<AdministratorReservationManagement service={service} />);

    await waitFor(() => expect(view.getByText('Express wash')).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Buscar reservaciones'), 'ABC-123');
    expect(view.getByText('Cliente: María López')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver detalle' }));
    expect(view.getByText('Detalle de reservación')).toBeTruthy();

    const nextStatusButtons = view.getAllByRole('button', { name: 'Cliente llegó' });
    fireEvent.press(nextStatusButtons[nextStatusButtons.length - 1]);
    await waitFor(() => expect(service.updateReservationStatus).toHaveBeenCalledWith('reservation-1', 'cliente_llego'));
  });

  it('searches and reviews employee assignments without mutation controls', async () => {
    const service = createService();
    service.listEmployees.mockResolvedValue([EMPLOYEE]);
    const view = render(<AdministratorEmployeeManagement service={service} />);

    await waitFor(() => expect(view.getByText('Ana Pérez')).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Buscar empleados'), 'Central wash');
    fireEvent.press(view.getByRole('button', { name: 'Revisar empleado' }));
    expect(view.getByText('Detalle de empleado')).toBeTruthy();
    expect(view.getByText('Activa')).toBeTruthy();
    expect(view.queryByRole('button', { name: /editar|eliminar/i })).toBeNull();
  });

  it('shows rating summary and customer feedback detail', async () => {
    const service = createService();
    service.listRatings.mockResolvedValue([RATING]);
    const view = render(<AdministratorRatingManagement service={service} />);

    await waitFor(() => expect(view.getByText('5.00 / 5')).toBeTruthy());
    expect(view.getByText('Excelente servicio.')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Revisar feedback' }));
    expect(view.getByText('Detalle de feedback')).toBeTruthy();
  });
});

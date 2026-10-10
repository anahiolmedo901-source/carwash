import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PaymentHistoryRoute from '../app/(customer)/pagos';
import { paymentService } from '../services/paymentService';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../services/paymentService', () => ({ paymentService: { listPayments: jest.fn() } }));

const service = paymentService as unknown as { listPayments: jest.Mock };

const RESERVATION = {
  reservationId: 'reservation-history-1',
  reservationStatus: 'confirmada' as const,
  reservationDate: '2026-10-22',
  reservationTime: '11:30:00',
  autolavadoId: 'wash-history-1',
  autolavadoName: 'Lavado Norte',
  serviceId: 'service-history-1',
  serviceName: 'Lavado completo',
};

const HISTORY = [
  ['pendiente', 'tarjeta_credito'],
  ['procesando', 'tarjeta_debito'],
  ['pagado', 'mercado_pago'],
  ['rechazado', 'efectivo'],
  ['cancelado', 'otro'],
  ['reembolsado', 'tarjeta_credito'],
].map(([status, method], index) => ({
  payment: {
    id: `payment-history-${index + 1}`,
    reservationId: RESERVATION.reservationId,
    amount: 250 + index,
    method,
    status,
    externalReference: `server-reference-${index + 1}`,
    paidAt: status === 'pagado' || status === 'reembolsado' ? '2026-10-21T11:00:00.000Z' : null,
    createdAt: '2026-10-21T10:55:00.000Z',
  },
  reservation: { ...RESERVATION, reservationId: `reservation-history-${index + 1}` },
}));

describe('customer payment history route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.listPayments.mockResolvedValue({ items: HISTORY });
  });

  it('loads through the history service and displays safe reservation and payment summaries', async () => {
    const view = render(<PaymentHistoryRoute />);

    await waitFor(() => expect(view.getByText('Historial de pagos')).toBeTruthy());
    expect(service.listPayments).toHaveBeenCalledTimes(1);
    expect(view.getAllByText('Lavado Norte')).toHaveLength(6);
    expect(view.getAllByText('Servicio: Lavado completo')).toHaveLength(6);
    expect(view.getAllByText('Fecha: 2026-10-22')).toHaveLength(6);
    expect(view.getAllByText('Hora: 11:30')).toHaveLength(6);
    expect(view.getByText('Monto: $250')).toBeTruthy();
    expect(view.getAllByText('Método: Tarjeta de crédito')).toHaveLength(2);
    expect(view.getByText('Estado del pago: Pendiente')).toBeTruthy();
    expect(view.getByText('Estado del pago: En procesamiento')).toBeTruthy();
    expect(view.getByText('Estado del pago: Pagado')).toBeTruthy();
    expect(view.getByText('Estado del pago: Rechazado')).toBeTruthy();
    expect(view.getByText('Estado del pago: Cancelado')).toBeTruthy();
    expect(view.getByText('Estado del pago: Reembolsado')).toBeTruthy();
    expect(view.queryByText('server-reference-1')).toBeNull();
  });

  it('shows retry and refresh actions that reload only through the history service', async () => {
    service.listPayments
      .mockRejectedValueOnce(new Error('history unavailable'))
      .mockResolvedValueOnce({ items: HISTORY })
      .mockResolvedValueOnce({ items: HISTORY });
    const view = render(<PaymentHistoryRoute />);

    await waitFor(() => expect(view.getByText('No se pudo cargar tu historial de pagos.')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(view.getByText('Estado del pago: Pagado')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Actualizar historial' }));
    await waitFor(() => expect(service.listPayments).toHaveBeenCalledTimes(3));
  });

  it('shows an owner history empty state', async () => {
    service.listPayments.mockResolvedValue({ items: [] });
    const view = render(<PaymentHistoryRoute />);

    await waitFor(() => expect(view.getByText('Todavía no tienes pagos registrados.')).toBeTruthy());
  });
});

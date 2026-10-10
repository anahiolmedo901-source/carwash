import type { AuthServiceStorage } from '../services/authService';
import { createPaymentService } from '../services/paymentService';

const SESSION_TOKEN = 'h'.repeat(64);
const HISTORY_ROW = {
  id: 'payment-history-1',
  reservacion_id: 'reservation-history-1',
  monto: '275.50',
  metodo_pago: 'mercado_pago',
  estado: 'pagado',
  referencia_externa: 'server-reference-history-1',
  fecha_pago: '2026-10-21T11:00:00.000Z',
  created_at: '2026-10-21T10:55:00.000Z',
  reservacion_estado: 'confirmada',
  reservacion_fecha: '2026-10-22',
  reservacion_hora: '11:30:00',
  autolavado_id: 'wash-history-1',
  autolavado_nombre: 'Lavado Norte',
  servicio_id: 'service-history-1',
  servicio_nombre: 'Lavado completo',
};

function createStorage(token: string | null = SESSION_TOKEN): AuthServiceStorage {
  return {
    getItem: jest.fn(async () => token),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
}

function createRpc() {
  return { rpc: jest.fn() };
}

describe('owner-scoped payment history service', () => {
  it('loads and maps every owner-scoped history row through the list RPC', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [HISTORY_ROW], error: null });
    const service = createPaymentService(createStorage(), rpc as never);

    await expect(service.listPayments()).resolves.toEqual({
      items: [{
        payment: {
          id: 'payment-history-1',
          reservationId: 'reservation-history-1',
          amount: 275.5,
          method: 'mercado_pago',
          status: 'pagado',
          externalReference: 'server-reference-history-1',
          paidAt: '2026-10-21T11:00:00.000Z',
          createdAt: '2026-10-21T10:55:00.000Z',
        },
        reservation: {
          reservationId: 'reservation-history-1',
          reservationStatus: 'confirmada',
          reservationDate: '2026-10-22',
          reservationTime: '11:30:00',
          autolavadoId: 'wash-history-1',
          autolavadoName: 'Lavado Norte',
          serviceId: 'service-history-1',
          serviceName: 'Lavado completo',
        },
      }],
    });

    expect(rpc.rpc).toHaveBeenCalledWith('carwash_list_payments', {
      p_session_token: SESSION_TOKEN,
    });
    expect(rpc.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed history rows and does not call the RPC without a session', async () => {
    const invalidRpc = createRpc();
    invalidRpc.rpc.mockResolvedValue({
      data: [{ ...HISTORY_ROW, reservacion_estado: 'unknown' }],
      error: null,
    });
    const invalidService = createPaymentService(createStorage(), invalidRpc as never);

    await expect(invalidService.listPayments()).rejects.toThrow('The payment history response is invalid.');

    const missingSessionRpc = createRpc();
    const missingSessionService = createPaymentService(createStorage(null), missingSessionRpc as never);
    await expect(missingSessionService.listPayments()).rejects.toThrow('session has expired');
    expect(missingSessionRpc.rpc).not.toHaveBeenCalled();
  });
});

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

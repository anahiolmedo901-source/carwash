import type { AuthServiceStorage } from '../services/authService';
import { createPaymentService } from '../services/paymentService';
import type { SandboxPaymentProvider } from '../services/paymentProvider';

const SESSION_TOKEN = 'c'.repeat(64);
const PENDING_PAYMENT_ROW = {
  id: 'payment-1',
  reservacion_id: 'reservation-1',
  monto: '250.00',
  metodo_pago: 'tarjeta_credito',
  estado: 'pendiente',
  referencia_externa: null,
  fecha_pago: null,
  created_at: '2026-10-20T10:00:00.000Z',
};
const APPROVED_PAYMENT_ROW = {
  ...PENDING_PAYMENT_ROW,
  estado: 'pagado',
  referencia_externa: 'server-reference-1',
  fecha_pago: '2026-10-20T10:00:05.000Z',
};

const GET_PAYMENT_ROW = {
  ...APPROVED_PAYMENT_ROW,
  reservacion_estado: 'confirmada',
  reservacion_fecha: '2026-10-20',
  reservacion_hora: '10:30:00',
  autolavado_id: 'wash-1',
  autolavado_nombre: 'Lavado Centro',
  servicio_id: 'service-1',
  servicio_nombre: 'Lavado premium',
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

function createProvider(result = { outcome: 'approved' as const, reference: 'provider-reference-1' }) {
  return { process: jest.fn(async () => result) } as unknown as SandboxPaymentProvider;
}

describe('owner-scoped sandbox payment service', () => {
  it('begins checkout with only the opaque token, reservation id, and allowed method', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [PENDING_PAYMENT_ROW], error: null });
    const service = createPaymentService(createStorage(), rpc as never, createProvider());

    await expect(service.beginCheckout({
      reservationId: 'reservation-1',
      method: 'tarjeta_credito',
    })).resolves.toEqual({
      id: 'payment-1',
      reservationId: 'reservation-1',
      amount: 250,
      method: 'tarjeta_credito',
      status: 'pendiente',
      externalReference: null,
      paidAt: null,
      createdAt: '2026-10-20T10:00:00.000Z',
    });

    expect(rpc.rpc).toHaveBeenCalledWith('carwash_begin_payment', {
      p_session_token: SESSION_TOKEN,
      p_reservation_id: 'reservation-1',
      p_metodo_pago: 'tarjeta_credito',
    });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('usuario_id');
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('monto');
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('estado');
  });

  it('uses the server-derived amount for the provider and sends only the normalized outcome to the process RPC', async () => {
    const rpc = createRpc();
    rpc.rpc
      .mockResolvedValueOnce({ data: [PENDING_PAYMENT_ROW], error: null })
      .mockResolvedValueOnce({ data: [APPROVED_PAYMENT_ROW], error: null });
    const provider = createProvider();
    const service = createPaymentService(createStorage(), rpc as never, provider);

    await expect(service.checkout({
      reservationId: 'reservation-1',
      method: 'tarjeta_credito',
    })).resolves.toEqual({
      payment: {
        id: 'payment-1',
        reservationId: 'reservation-1',
        amount: 250,
        method: 'tarjeta_credito',
        status: 'pagado',
        externalReference: 'server-reference-1',
        paidAt: '2026-10-20T10:00:05.000Z',
        createdAt: '2026-10-20T10:00:00.000Z',
      },
      outcome: 'approved',
    });

    expect(provider.process).toHaveBeenCalledWith({
      paymentId: 'payment-1',
      amount: 250,
      method: 'tarjeta_credito',
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(2, 'carwash_process_sandbox_payment', {
      p_session_token: SESSION_TOKEN,
      p_payment_id: 'payment-1',
      p_outcome: 'approved',
    });
    expect(JSON.stringify(rpc.rpc.mock.calls[1])).not.toContain('provider-reference-1');
    expect(JSON.stringify(rpc.rpc.mock.calls[1])).not.toContain('250');
  });

  it('loads one owner-scoped payment through the get-payment RPC and validates its response', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [GET_PAYMENT_ROW], error: null });
    const service = createPaymentService(createStorage(), rpc as never, createProvider());

    await expect(service.getPayment(' payment-1 ')).resolves.toEqual({
      id: 'payment-1',
      reservationId: 'reservation-1',
      amount: 250,
      method: 'tarjeta_credito',
      status: 'pagado',
      externalReference: 'server-reference-1',
      paidAt: '2026-10-20T10:00:05.000Z',
      createdAt: '2026-10-20T10:00:00.000Z',
    });

    expect(rpc.rpc).toHaveBeenCalledWith('carwash_get_payment', {
      p_session_token: SESSION_TOKEN,
      p_payment_id: 'payment-1',
    });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('usuario_id');
  });

  it('surfaces invalid payment rows, provider failures, and missing sessions clearly', async () => {
    const invalidRpc = createRpc();
    invalidRpc.rpc.mockResolvedValue({ data: [{ ...PENDING_PAYMENT_ROW, estado: 'unknown' }], error: null });
    const invalidService = createPaymentService(createStorage(), invalidRpc as never, createProvider());
    await expect(invalidService.beginCheckout({ reservationId: 'reservation-1', method: 'efectivo' }))
      .rejects.toThrow('The payment response is invalid.');

    const failingProvider = createProvider();
    (failingProvider.process as jest.Mock).mockRejectedValue(new Error('sandbox unavailable'));
    const providerRpc = createRpc();
    providerRpc.rpc.mockResolvedValue({ data: [PENDING_PAYMENT_ROW], error: null });
    const providerService = createPaymentService(createStorage(), providerRpc as never, failingProvider);
    await expect(providerService.checkout({ reservationId: 'reservation-1', method: 'efectivo' }))
      .rejects.toThrow('sandbox unavailable');
    expect(providerRpc.rpc).toHaveBeenCalledTimes(1);

    const missingSessionRpc = createRpc();
    const missingSessionService = createPaymentService(createStorage(null), missingSessionRpc as never, createProvider());
    await expect(missingSessionService.beginCheckout({ reservationId: 'reservation-1', method: 'efectivo' }))
      .rejects.toThrow('session has expired');
    expect(missingSessionRpc.rpc).not.toHaveBeenCalled();
  });
});

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

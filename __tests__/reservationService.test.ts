import type { AuthServiceStorage } from '../services/authService';
import { createReservationService } from '../services/reservationService';
import type { ReservationTableRow } from '../types/database';

const SESSION_TOKEN = 'a'.repeat(64);
const RESERVATION_ROW = {
  id: 'reservation-1',
  vehiculo_id: 'vehicle-1',
  autolavado_id: 'wash-1',
  servicio_id: 'service-1',
  espacio_lavado_id: 'space-1',
  fecha: '2026-10-20',
  hora: '10:30:00',
  estado: 'confirmada',
  codigo_qr: 'database-qr-1',
  autolavado_nombre: 'Lavado Centro',
  servicio_nombre: 'Lavado premium',
  precio: '250.00',
  duracion_aproximada: '45',
  vehiculo_marca: 'Honda',
  vehiculo_modelo: 'Civic',
  vehiculo_placas: 'ABC-123',
  created_at: '2026-10-04T12:00:00.000Z',
  updated_at: '2026-10-04T12:00:00.000Z',
};

const RESERVATION_TABLE_CONTRACT: Pick<ReservationTableRow, 'codigo_qr' | 'precio_snapshot'> = {
  codigo_qr: null,
  precio_snapshot: '250.00',
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

describe('owner-scoped reservation service', () => {
  it('keeps the physical reservation nullability and snapshot contract explicit', () => {
    expect(RESERVATION_TABLE_CONTRACT).toEqual({ codigo_qr: null, precio_snapshot: '250.00' });
  });

  it('maps availability rows and requests them with the opaque session token', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({
      data: [
        { has_spaces: true, available: true, espacio_lavado_id: 'space-1' },
        { has_spaces: true, available: true, espacio_lavado_id: 'space-2' },
      ],
      error: null,
    });
    const service = createReservationService(createStorage(), rpc as never);

    await expect(service.getAvailableSpaces({
      autolavadoId: 'wash-1',
      serviceId: 'service-1',
      date: '2026-10-20',
      time: '10:30',
    })).resolves.toEqual({
      requiresSpace: true,
      available: true,
      spaces: [{ id: 'space-1' }, { id: 'space-2' }],
    });
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_available_spaces', {
      p_session_token: SESSION_TOKEN,
      p_autolavado_id: 'wash-1',
      p_servicio_id: 'service-1',
      p_fecha: '2026-10-20',
      p_hora: '10:30',
    });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('usuario_id');
  });

  it('maps a no-space occupied response without inventing a selectable space', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({
      data: [{ has_spaces: false, available: false, espacio_lavado_id: null }],
      error: null,
    });
    const service = createReservationService(createStorage(), rpc as never);

    await expect(service.getAvailableSpaces({
      autolavadoId: 'wash-1',
      serviceId: 'service-1',
      date: '2026-10-20',
      time: '10:30',
    })).resolves.toEqual({ requiresSpace: false, available: false, spaces: [] });
  });

  it('creates through the atomic RPC and returns the database-generated QR code', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [RESERVATION_ROW], error: null });
    const service = createReservationService(createStorage(), rpc as never);

    await expect(service.createReservation({
      autolavadoId: 'wash-1',
      serviceId: 'service-1',
      vehicleId: 'vehicle-1',
      date: '2026-10-20',
      time: '10:30',
      spaceId: 'space-1',
    })).resolves.toMatchObject({
      id: 'reservation-1',
      status: 'confirmada',
      qrCode: 'database-qr-1',
      price: 250,
      durationMinutes: 45,
    });
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_create_reservation', {
      p_session_token: SESSION_TOKEN,
      p_autolavado_id: 'wash-1',
      p_servicio_id: 'service-1',
      p_vehiculo_id: 'vehicle-1',
      p_fecha: '2026-10-20',
      p_hora: '10:30',
      p_espacio_lavado_id: 'space-1',
    });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('usuario_id');
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('codigo_qr');
  });

  it('preserves a missing database QR code as null', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [{ ...RESERVATION_ROW, codigo_qr: null }], error: null });
    const service = createReservationService(createStorage(), rpc as never);

    await expect(service.getReservation('reservation-1')).resolves.toMatchObject({ qrCode: null });
    await expect(service.getReservation('reservation-1')).resolves.not.toMatchObject({ qrCode: 'null' });
  });

  it('lists and classifies the response inputs without exposing the owner id', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [RESERVATION_ROW], error: null });
    const service = createReservationService(createStorage(), rpc as never);

    await expect(service.listReservations()).resolves.toEqual([
      expect.objectContaining({
        id: 'reservation-1',
        vehicleId: 'vehicle-1',
        autolavadoName: 'Lavado Centro',
        serviceName: 'Lavado premium',
        date: '2026-10-20',
        time: '10:30:00',
      }),
    ]);
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_list_reservations', { p_session_token: SESSION_TOKEN });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('usuario_id');
  });

  it('returns one owned reservation or null when the RPC has no row', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValueOnce({ data: [RESERVATION_ROW], error: null });
    rpc.rpc.mockResolvedValueOnce({ data: [], error: null });
    const service = createReservationService(createStorage(), rpc as never);

    await expect(service.getReservation('reservation-1')).resolves.toEqual(
      expect.objectContaining({ id: 'reservation-1', qrCode: 'database-qr-1' }),
    );
    await expect(service.getReservation('missing')).resolves.toBeNull();
  });

  it('cancels through the server transition and preserves the returned QR/history', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({
      data: [{ ...RESERVATION_ROW, estado: 'cancelada' }],
      error: null,
    });
    const service = createReservationService(createStorage(), rpc as never);

    await expect(service.cancelReservation('reservation-1')).resolves.toMatchObject({
      status: 'cancelada',
      qrCode: 'database-qr-1',
    });
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_cancel_reservation', {
      p_session_token: SESSION_TOKEN,
      p_reservation_id: 'reservation-1',
    });
  });

  it('maps an already-cancelled response repeatedly without deleting or changing its history', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({
      data: [{ ...RESERVATION_ROW, estado: 'cancelada' }],
      error: null,
    });
    const service = createReservationService(createStorage(), rpc as never);

    await expect(service.cancelReservation('reservation-1')).resolves.toMatchObject({ status: 'cancelada' });
    await expect(service.cancelReservation('reservation-1')).resolves.toMatchObject({
      status: 'cancelada',
      qrCode: 'database-qr-1',
    });
    expect(rpc.rpc).toHaveBeenCalledTimes(2);
  });

  it('surfaces conflict and later-state cancellation errors', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValueOnce({ data: null, error: { message: 'The selected time is occupied.' } });
    rpc.rpc.mockResolvedValueOnce({ data: null, error: { message: 'This reservation cannot be cancelled.' } });
    const service = createReservationService(createStorage(), rpc as never);

    await expect(service.createReservation({
      autolavadoId: 'wash-1', serviceId: 'service-1', vehicleId: 'vehicle-1',
      date: '2026-10-20', time: '10:30', spaceId: null,
    })).rejects.toThrow('The selected time is occupied.');
    await expect(service.cancelReservation('reservation-1')).rejects.toThrow('This reservation cannot be cancelled.');
  });

  it('does not call reservation RPCs without the locally stored session token', async () => {
    const rpc = createRpc();
    const service = createReservationService(createStorage(null), rpc as never);

    await expect(service.listReservations()).rejects.toThrow('Your session has expired. Sign in again.');
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
});

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

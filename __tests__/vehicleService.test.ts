import { createVehicleService, VEHICLE_TYPES } from '../services/vehicleService';
import type { AuthServiceStorage } from '../services/authService';

const SESSION_TOKEN = 'b'.repeat(64);
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
const INPUT = {
  marca: 'Honda',
  modelo: 'Civic',
  anio: 2021,
  color: 'Azul',
  placas: 'ABC-123',
  tipo: 'sedan' as const,
};

function createStorage(token: string | null = SESSION_TOKEN) {
  const storage: AuthServiceStorage = {
    getItem: jest.fn(async () => token),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
  return storage;
}

function createRpc() {
  return { rpc: jest.fn() };
}

describe('owner-scoped vehicle service', () => {
  it('lists typed vehicle rows using only the opaque session token', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [VEHICLE], error: null });
    const service = createVehicleService(createStorage(), rpc as never);

    await expect(service.listVehicles()).resolves.toEqual([VEHICLE]);
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_list_vehicles', { p_session_token: SESSION_TOKEN });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('usuario_id');
  });

  it('loads one owner-scoped detail by vehicle id and opaque token', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [VEHICLE], error: null });
    const service = createVehicleService(createStorage(), rpc as never);

    await expect(service.getVehicle(VEHICLE.id)).resolves.toEqual(VEHICLE);
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_get_vehicle', {
      p_session_token: SESSION_TOKEN,
      p_vehicle_id: VEHICLE.id,
    });
  });

  it('creates a vehicle without accepting an owner id from the caller', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [VEHICLE], error: null });
    const service = createVehicleService(createStorage(), rpc as never);

    await expect(service.createVehicle(INPUT)).resolves.toEqual(VEHICLE);
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_create_vehicle', {
      p_session_token: SESSION_TOKEN,
      p_marca: INPUT.marca,
      p_modelo: INPUT.modelo,
      p_anio: INPUT.anio,
      p_color: INPUT.color,
      p_placas: INPUT.placas,
      p_tipo: INPUT.tipo,
    });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('usuario_id');
  });

  it('updates a vehicle using only the vehicle id and editable fields', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [VEHICLE], error: null });
    const service = createVehicleService(createStorage(), rpc as never);

    await expect(service.updateVehicle(VEHICLE.id, INPUT)).resolves.toEqual(VEHICLE);
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_update_vehicle', {
      p_session_token: SESSION_TOKEN,
      p_vehicle_id: VEHICLE.id,
      p_marca: INPUT.marca,
      p_modelo: INPUT.modelo,
      p_anio: INPUT.anio,
      p_color: INPUT.color,
      p_placas: INPUT.placas,
      p_tipo: INPUT.tipo,
    });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toContain('usuario_id');
  });

  it('deletes a vehicle through the owner-scoped RPC', async () => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: true, error: null });
    const service = createVehicleService(createStorage(), rpc as never);

    await expect(service.deleteVehicle(VEHICLE.id)).resolves.toBe(true);
    expect(rpc.rpc).toHaveBeenCalledWith('carwash_delete_vehicle', {
      p_session_token: SESSION_TOKEN,
      p_vehicle_id: VEHICLE.id,
    });
  });

  it.each(VEHICLE_TYPES)('accepts the permitted type %s', async (tipo) => {
    const rpc = createRpc();
    rpc.rpc.mockResolvedValue({ data: [VEHICLE], error: null });
    const service = createVehicleService(createStorage(), rpc as never);

    await expect(service.createVehicle({ ...INPUT, tipo })).resolves.toEqual(VEHICLE);
  });

  it('rejects unsupported types before making an RPC request', async () => {
    const rpc = createRpc();
    const service = createVehicleService(createStorage(), rpc as never);

    await expect(service.createVehicle({ ...INPUT, tipo: 'limousine' as never })).rejects.toThrow(
      'Choose a permitted vehicle type.',
    );
    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  it('does not access vehicle RPCs when there is no locally stored session token', async () => {
    const rpc = createRpc();
    const service = createVehicleService(createStorage(null), rpc as never);

    await expect(service.listVehicles()).rejects.toThrow('Your session has expired. Sign in again.');
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
});

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

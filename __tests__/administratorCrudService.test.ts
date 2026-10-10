import type { AuthServiceStorage } from '../services/authService';
import { createAdministratorService } from '../services/administratorService';

const SESSION_TOKEN = 'e'.repeat(64);

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

const SERVICE_ROW = {
  id: 'service-1',
  autolavado_id: 'wash-1',
  nombre: 'Premium wash',
  descripcion: 'Interior and exterior cleaning.',
  precio: '250.50',
  duracion_aproximada: '45',
  activo: true,
};

const SPACE_ROW = {
  id: 'space-1',
  autolavado_id: 'wash-1',
  nombre: 'Bay 1',
  estado: 'disponible',
  activo: true,
};

describe('administrator CRUD service', () => {
  it('uses only the opaque token and preserves same-car-wash service and space edits', async () => {
    const rpc = createRpc();
    rpc.rpc
      .mockResolvedValueOnce({ data: [SERVICE_ROW], error: null })
      .mockResolvedValueOnce({ data: [SERVICE_ROW], error: null })
      .mockResolvedValueOnce({ data: [{ ...SERVICE_ROW, nombre: 'Updated wash' }], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: [SPACE_ROW], error: null })
      .mockResolvedValueOnce({ data: [SPACE_ROW], error: null })
      .mockResolvedValueOnce({ data: [{ ...SPACE_ROW, estado: 'ocupado' }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const service = createAdministratorService(createStorage(), rpc as never);

    await expect(service.listServices()).resolves.toEqual([{
      id: 'service-1',
      autolavadoId: 'wash-1',
      name: 'Premium wash',
      description: 'Interior and exterior cleaning.',
       price: 250.5,
       durationMinutes: 45,
       active: true,
    }]);
    await expect(service.createService({
      autolavadoId: 'wash-1',
      name: ' Premium wash ',
      description: ' Interior and exterior cleaning. ',
       price: 250.5,
       durationMinutes: 45,
       active: true,
     })).resolves.toMatchObject({ id: 'service-1', price: 250.5 });
    await expect(service.updateService(' service-1 ', {
      autolavadoId: 'wash-1',
      name: 'Updated wash',
      description: 'Updated description.',
       price: 275,
       durationMinutes: 50,
       active: false,
    })).resolves.toMatchObject({ id: 'service-1', name: 'Updated wash' });
    await expect(service.deleteService(' service-1 ')).resolves.toBe(true);

    await expect(service.listWashingSpaces()).resolves.toEqual([{
      id: 'space-1',
      autolavadoId: 'wash-1',
      name: 'Bay 1',
      status: 'disponible',
      active: true,
    }]);
    await expect(service.createWashingSpace({
      autolavadoId: 'wash-1',
      name: 'Bay 1',
      status: 'disponible',
      active: true,
    })).resolves.toMatchObject({ id: 'space-1', status: 'disponible' });
    await expect(service.updateWashingSpace(' space-1 ', {
      autolavadoId: 'wash-1',
      name: 'Bay 1',
      status: 'ocupado',
      active: true,
    })).resolves.toMatchObject({ id: 'space-1', status: 'ocupado' });
    await expect(service.deleteWashingSpace(' space-1 ')).resolves.toBe(true);

    expect(rpc.rpc).toHaveBeenNthCalledWith(1, 'carwash_administrator_list_services', {
      p_session_token: SESSION_TOKEN,
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(2, 'carwash_administrator_create_service', {
      p_session_token: SESSION_TOKEN,
      p_autolavado_id: 'wash-1',
      p_nombre: 'Premium wash',
      p_descripcion: 'Interior and exterior cleaning.',
       p_precio: 250.5,
       p_duracion_aproximada: 45,
       p_activo: true,
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(3, 'carwash_administrator_update_service', {
      p_session_token: SESSION_TOKEN,
      p_servicio_id: 'service-1',
      p_autolavado_id: 'wash-1',
      p_nombre: 'Updated wash',
      p_descripcion: 'Updated description.',
       p_precio: 275,
       p_duracion_aproximada: 50,
       p_activo: false,
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(4, 'carwash_administrator_delete_service', {
      p_session_token: SESSION_TOKEN,
      p_servicio_id: 'service-1',
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(5, 'carwash_administrator_list_washing_spaces', {
      p_session_token: SESSION_TOKEN,
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(6, 'carwash_administrator_create_washing_space', {
      p_session_token: SESSION_TOKEN,
      p_autolavado_id: 'wash-1',
      p_nombre: 'Bay 1',
      p_estado: 'disponible',
      p_activo: true,
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(7, 'carwash_administrator_update_washing_space', {
      p_session_token: SESSION_TOKEN,
      p_espacio_id: 'space-1',
      p_autolavado_id: 'wash-1',
      p_nombre: 'Bay 1',
      p_estado: 'ocupado',
      p_activo: true,
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(8, 'carwash_administrator_delete_washing_space', {
      p_session_token: SESSION_TOKEN,
      p_espacio_id: 'space-1',
    });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toMatch(/(?:rol|usuario_id|password|token_hash)/i);
  });

  it('rejects invalid CRUD fields before making an RPC call', async () => {
    const rpc = createRpc();
    const service = createAdministratorService(createStorage(), rpc as never);

    await expect(service.createService({
      autolavadoId: 'wash-1',
      name: 'Wash',
      description: 'Description',
       price: 10.123,
       durationMinutes: 30,
       active: true,
    })).rejects.toThrow('at most two decimals');
    await expect(service.createService({
      autolavadoId: 'wash-1',
      name: 'Wash',
      description: 'Description',
       price: 10,
       durationMinutes: 0,
       active: true,
    })).rejects.toThrow('duration must be positive');
    await expect(service.createWashingSpace({
      autolavadoId: 'wash-1',
      name: 'Bay 1',
      status: 'invalid' as never,
      active: true,
    })).rejects.toThrow('status is not allowed');

    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  it('does not call CRUD RPCs without the stored opaque session token', async () => {
    const rpc = createRpc();
    const service = createAdministratorService(createStorage(null), rpc as never);

    await expect(service.listWashingSpaces()).rejects.toThrow('Your session has expired. Sign in again.');
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
});

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

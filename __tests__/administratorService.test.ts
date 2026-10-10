import type { AuthServiceStorage } from '../services/authService';
import { createAdministratorService } from '../services/administratorService';

const SESSION_TOKEN = 'd'.repeat(64);

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

describe('administrator read service', () => {
  it('uses only the opaque session token and maps all bounded read projections', async () => {
    const rpc = createRpc();
    rpc.rpc
      .mockResolvedValueOnce({
        data: [{
          today_reservations: '3',
          collected_revenue: '750.00',
          completed_services: 2,
          vehicles_in_lavado: '1',
          average_rating: '4.50',
          rating_count: '8',
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'wash-1', nombre: 'Lavado Centro' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'employee-1',
            nombre: 'Ana',
            apellido: 'Pérez',
            correo: 'ana@example.test',
            telefono: '5550001',
            activo: true,
            asignacion_id: 'assignment-1',
            autolavado_id: 'wash-1',
            autolavado_nombre: 'Lavado Centro',
            asignacion_activa: true,
          },
          {
            id: 'employee-1',
            nombre: 'Ana',
            apellido: 'Pérez',
            correo: 'ana@example.test',
            telefono: '5550001',
            activo: true,
            asignacion_id: 'assignment-2',
            autolavado_id: 'wash-2',
            autolavado_nombre: 'Lavado Norte',
            asignacion_activa: false,
          },
          {
            id: 'employee-2',
            nombre: 'Luis',
            apellido: 'Soto',
            correo: 'luis@example.test',
            telefono: '5550002',
            activo: false,
            asignacion_id: null,
            autolavado_id: null,
            autolavado_nombre: null,
            asignacion_activa: null,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          id: 'reservation-1',
          fecha: '2026-10-20',
          hora: '10:30:00',
          estado: 'confirmada',
          vehiculo_id: 'vehicle-1',
          vehiculo_marca: 'Honda',
          vehiculo_modelo: 'Civic',
          vehiculo_placas: 'ABC-123',
          autolavado_id: 'wash-1',
          autolavado_nombre: 'Lavado Centro',
          servicio_id: 'service-1',
          servicio_nombre: 'Lavado premium',
          espacio_lavado_id: 'space-1',
          precio: '250.00',
          duracion_aproximada: 45,
          cliente_nombre: 'María',
          cliente_apellido: 'López',
          cliente_correo: 'maria@example.test',
          cliente_telefono: '5550003',
          payment_status: 'pagado',
          payment_amount: '250.00',
          payment_paid_at: '2026-10-20T10:00:00.000Z',
          created_at: '2026-10-04T12:00:00.000Z',
          updated_at: '2026-10-04T12:00:00.000Z',
        }],
        error: null,
      });
    const service = createAdministratorService(createStorage(), rpc as never);

    await expect(service.getDashboard()).resolves.toEqual({
      todayReservations: 3,
      collectedRevenue: 750,
      completedServices: 2,
      vehiclesCurrentlyWashing: 1,
      averageRating: 4.5,
      ratingCount: 8,
    });
    await expect(service.listAutolavados()).resolves.toEqual([
      { id: 'wash-1', name: 'Lavado Centro' },
    ]);
    await expect(service.listEmployees()).resolves.toEqual([
      {
        id: 'employee-1',
        firstName: 'Ana',
        lastName: 'Pérez',
        email: 'ana@example.test',
        phone: '5550001',
        active: true,
        assignments: [
          {
            id: 'assignment-1',
            autolavadoId: 'wash-1',
            autolavadoName: 'Lavado Centro',
            active: true,
          },
          {
            id: 'assignment-2',
            autolavadoId: 'wash-2',
            autolavadoName: 'Lavado Norte',
            active: false,
          },
        ],
      },
      {
        id: 'employee-2',
        firstName: 'Luis',
        lastName: 'Soto',
        email: 'luis@example.test',
        phone: '5550002',
        active: false,
        assignments: [],
      },
    ]);
    await expect(service.listReservations()).resolves.toEqual([
      expect.objectContaining({
        id: 'reservation-1',
        price: 250,
        customerFirstName: 'María',
        paymentStatus: 'pagado',
        paymentAmount: 250,
      }),
    ]);

    expect(rpc.rpc).toHaveBeenNthCalledWith(1, 'carwash_administrator_dashboard', {
      p_session_token: SESSION_TOKEN,
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(2, 'carwash_administrator_list_autolavados', {
      p_session_token: SESSION_TOKEN,
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(3, 'carwash_administrator_list_employees', {
      p_session_token: SESSION_TOKEN,
    });
    expect(rpc.rpc).toHaveBeenNthCalledWith(4, 'carwash_administrator_list_reservations', {
      p_session_token: SESSION_TOKEN,
    });
    expect(JSON.stringify(rpc.rpc.mock.calls)).not.toMatch(/(?:rol|usuario_id|autolavado_id|estado|precio|monto)/i);
  });

  it('does not call administrator RPCs without a locally stored session token', async () => {
    const rpc = createRpc();
    const service = createAdministratorService(createStorage(null), rpc as never);

    await expect(service.getDashboard()).rejects.toThrow('Your session has expired. Sign in again.');
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
});

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

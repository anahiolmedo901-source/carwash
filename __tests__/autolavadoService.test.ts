import { createAutolavadoService } from '../services/autolavadoService';
import type { ExplorationQueryClient, ExplorationTableName } from '../types/autolavado';

const LIST_ROW = {
  id: 'wash-1',
  nombre: 'Lavado Centro',
  imagen_url: 'https://example.com/wash-1.jpg',
  direccion: 'Av. Central 123',
  horario: '08:00 - 20:00',
  calificacion: 4.5,
  cantidad_resenas: 12,
};

const DETAIL_ROW = {
  ...LIST_ROW,
  descripcion: 'Limpieza exterior e interior para tu vehículo.',
};

const SERVICE_ROW = {
  id: 'service-1',
  autolavado_id: 'wash-1',
  nombre: 'Lavado premium',
  descripcion: 'Incluye limpieza profunda.',
  precio: 250,
  duracion_minutos: 45,
};

const SPACE_ROW = {
  id: 'space-1',
  autolavado_id: 'wash-1',
  nombre: 'Bay 1',
  estado: 'disponible',
  activo: true,
};

type Response = { data: Record<string, unknown>[] | null; error: unknown | null };

function createQueryClient(responses: Partial<Record<ExplorationTableName, Response>> = {}) {
  const select = jest.fn(async (table: ExplorationTableName) => responses[table] ?? { data: [], error: null });
  const from = jest.fn((table: ExplorationTableName) => ({
    select: (columns: '*') => {
      expect(columns).toBe('*');
      return select(table);
    },
  }));

  return { client: { from } as unknown as ExplorationQueryClient, from, select };
}

describe('autolavado exploration service', () => {
  it('lists and normalizes rows from vista_autolavados', async () => {
    const { client, from } = createQueryClient({ vista_autolavados: { data: [LIST_ROW], error: null } });
    const service = createAutolavadoService(client);

    await expect(service.listAutolavados()).resolves.toEqual([
      {
        id: 'wash-1',
        name: 'Lavado Centro',
        imageUrl: 'https://example.com/wash-1.jpg',
        address: 'Av. Central 123',
        hours: '07:00 - 18:00',
        rating: 4.5,
        reviewCount: 12,
      },
    ]);
    expect(from).toHaveBeenCalledWith('vista_autolavados');
  });

  it('returns an empty list when the view has no rows', async () => {
    const { client } = createQueryClient({ vista_autolavados: { data: [], error: null } });
    const service = createAutolavadoService(client);

    await expect(service.listAutolavados()).resolves.toEqual([]);
  });

  it('surfaces the view failure when the table fallback also fails', async () => {
    const { client } = createQueryClient({
      vista_autolavados: { data: null, error: { message: 'view unavailable' } },
      autolavados: { data: null, error: { message: 'table unavailable' } },
    });
    const service = createAutolavadoService(client);

    await expect(service.listAutolavados()).rejects.toThrow('Failed to read vista_autolavados: view unavailable');
  });

  it('falls back to the autolavados table when the view fails', async () => {
    const { client, from } = createQueryClient({
      vista_autolavados: { data: null, error: { message: 'view unavailable' } },
      autolavados: { data: [LIST_ROW], error: null },
    });
    const service = createAutolavadoService(client);

    await expect(service.listAutolavados()).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledWith('autolavados');
  });

  it('falls back to the autolavados table when the view is empty', async () => {
    const { client } = createQueryClient({
      vista_autolavados: { data: [], error: null },
      autolavados: { data: [LIST_ROW], error: null },
    });
    const service = createAutolavadoService(client);

    await expect(service.listAutolavados()).resolves.toHaveLength(1);
  });

  it('uses safe defaults for missing optional display data instead of hiding the car wash', async () => {
    const { client } = createQueryClient({
      vista_autolavados: {
        data: [{ id: 'wash-9', nombre: 'Sin datos extra' }],
        error: null,
      },
    });
    const service = createAutolavadoService(client);

    await expect(service.listAutolavados()).resolves.toEqual([
      {
        id: 'wash-9',
        name: 'Sin datos extra',
        imageUrl: '',
        address: 'Dirección no disponible',
        hours: '07:00 - 18:00',
        rating: 0,
        reviewCount: 0,
      },
    ]);
  });

  it('maps detail fields and reads all three detail objects', async () => {
    const { client, from } = createQueryClient({
      autolavados: { data: [DETAIL_ROW], error: null },
      servicios: { data: [SERVICE_ROW], error: null },
      espacios_lavado: { data: [SPACE_ROW], error: null },
    });
    const service = createAutolavadoService(client);

    await expect(service.getAutolavado('wash-1')).resolves.toMatchObject({
      id: 'wash-1',
      name: 'Lavado Centro',
      imageUrl: 'https://example.com/wash-1.jpg',
      description: 'Limpieza exterior e interior para tu vehículo.',
      address: 'Av. Central 123',
      hours: '07:00 - 18:00',
      rating: 4.5,
      services: [
        {
          id: 'service-1',
          autolavadoId: 'wash-1',
          name: 'Lavado premium',
          description: 'Incluye limpieza profunda.',
          price: 250,
          approximateDurationMinutes: 45,
        },
      ],
      spaces: [{
        id: 'space-1',
        autolavadoId: 'wash-1',
        name: 'Bay 1',
        status: 'disponible',
        active: true,
      }],
    });
    expect(from).toHaveBeenCalledWith('autolavados');
    expect(from).toHaveBeenCalledWith('servicios');
    expect(from).toHaveBeenCalledWith('espacios_lavado');
  });

  it('keeps detail spaces scoped to the selected autolavado', async () => {
    const { client } = createQueryClient({
      autolavados: { data: [DETAIL_ROW], error: null },
      servicios: { data: [SERVICE_ROW], error: null },
      espacios_lavado: {
        data: [
          SPACE_ROW,
          { ...SPACE_ROW, id: 'space-2', autolavado_id: 'wash-2' },
        ],
        error: null,
      },
    });
    const service = createAutolavadoService(client);

    await expect(service.getAutolavado('wash-1')).resolves.toMatchObject({
      spaces: [{ id: 'space-1', autolavadoId: 'wash-1' }],
    });
  });

  it('does not infer a service association through espacios_lavado', async () => {
    const { client } = createQueryClient({
      autolavados: { data: [DETAIL_ROW], error: null },
      servicios: {
        data: [{ ...SERVICE_ROW, autolavado_id: undefined }],
        error: null,
      },
      espacios_lavado: { data: [SPACE_ROW], error: null },
    });
    const service = createAutolavadoService(client);

    await expect(service.getAutolavado('wash-1')).rejects.toThrow(
      'Autolavado schema contract error: missing service association',
    );
  });

  it('skips rows without identity or name and keeps the valid ones', async () => {
    const { client } = createQueryClient({
      vista_autolavados: {
        data: [{ ...LIST_ROW, nombre: undefined }, LIST_ROW, { ...LIST_ROW, id: 'wash-off', activo: false }],
        error: null,
      },
    });
    const service = createAutolavadoService(client);

    const result = await service.listAutolavados();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('wash-1');
  });

  it('throws when service association data is absent', async () => {
    const { client } = createQueryClient({
      autolavados: { data: [DETAIL_ROW], error: null },
      servicios: { data: [{ ...SERVICE_ROW, autolavado_id: undefined }], error: null },
      espacios_lavado: { data: [], error: null },
    });
    const service = createAutolavadoService(client);

    await expect(service.getAutolavado('wash-1')).rejects.toThrow(
      'Autolavado schema contract error: missing service association',
    );
  });
});

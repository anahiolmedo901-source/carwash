import { createPhotoService, toDataUri } from '../services/photoService';
import { SESSION_TOKEN_STORAGE_KEY } from '../services/authService';

const storage = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };

function clientWith(result: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

describe('photoService', () => {
  beforeEach(() => {
    storage.getItem.mockReset().mockResolvedValue('a'.repeat(64));
  });

  it('lista las fotos antes/después como data URI', async () => {
    const { client, rpc } = clientWith({
      data: [
        { momento: 'antes', imagen_base64: 'AAA', created_at: '2026-10-08T10:00:00Z' },
        { momento: 'despues', imagen_base64: 'BBB', created_at: '2026-10-08T11:00:00Z' },
      ],
      error: null,
    });
    const service = createPhotoService(storage as never, client);
    const photos = await service.listPhotos('res-1');
    expect(storage.getItem).toHaveBeenCalledWith(SESSION_TOKEN_STORAGE_KEY);
    expect(rpc).toHaveBeenCalledWith('carwash_list_reservation_photos', { p_session_token: 'a'.repeat(64), p_reservation_id: 'res-1' });
    expect(photos.map((photo) => photo.moment)).toEqual(['antes', 'despues']);
    expect(photos[0].uri).toBe(toDataUri('AAA'));
  });

  it('guarda una foto y devuelve la fila guardada', async () => {
    const { client, rpc } = clientWith({ data: [{ momento: 'antes', imagen_base64: 'XYZ', created_at: 'now' }], error: null });
    const service = createPhotoService(storage as never, client);
    const saved = await service.savePhoto('res-1', 'antes', 'XYZ');
    expect(rpc).toHaveBeenCalledWith('carwash_save_reservation_photo', expect.objectContaining({ p_momento: 'antes', p_imagen_base64: 'XYZ' }));
    expect(saved.uri).toBe(toDataUri('XYZ'));
  });

  it('rechaza fotos vacías, sesión expirada y errores del servidor', async () => {
    const ok = createPhotoService(storage as never, clientWith({ data: [], error: null }).client);
    await expect(ok.savePhoto('res-1', 'antes', '')).rejects.toThrow('vacía');

    storage.getItem.mockResolvedValue(null);
    await expect(ok.listPhotos('res-1')).rejects.toThrow('sesión expiró');

    storage.getItem.mockResolvedValue('a'.repeat(64));
    const failing = createPhotoService(storage as never, clientWith({ data: null, error: { message: 'boom' } }).client);
    await expect(failing.listPhotos('res-1')).rejects.toThrow('boom');
  });
});

describe('photoService migración faltante', () => {
  it('explica cómo resolver el error de función no encontrada', async () => {
    storage.getItem.mockResolvedValue('a'.repeat(64));
    const failing = createPhotoService(
      storage as never,
      clientWith({ data: null, error: { message: 'Could not find the function public.carwash_list_reservation_photos in the schema cache' } }).client,
    );
    await expect(failing.listPhotos('res-1')).rejects.toThrow('APLICAR_EN_SQL_EDITOR.sql');
  });
});

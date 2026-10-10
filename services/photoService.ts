import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database, ReservationPhotoRpcRow } from '../types/database';
import { SESSION_TOKEN_STORAGE_KEY, type AuthServiceStorage } from './authService';

export type PhotoMoment = 'antes' | 'despues';

export interface ReservationPhoto {
  moment: PhotoMoment;
  /** Lista para usar como source.uri de <Image>. */
  uri: string;
  createdAt: string;
}

export interface PhotoService {
  listPhotos(reservationId: string): Promise<ReservationPhoto[]>;
  savePhoto(reservationId: string, moment: PhotoMoment, base64: string): Promise<ReservationPhoto>;
}

const MISSING_MIGRATION_MESSAGE =
  'Falta aplicar la actualización de la base de datos. Ejecuta supabase/APLICAR_EN_SQL_EDITOR.sql en el SQL Editor de Supabase.';

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return /could not find the function|schema cache/i.test(error.message) ? MISSING_MIGRATION_MESSAGE : error.message;
  }
  return 'No se pudo completar la operación con las fotografías.';
}

export function toDataUri(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

function mapPhoto(row: ReservationPhotoRpcRow): ReservationPhoto {
  return { moment: row.momento, uri: toDataUri(row.imagen_base64), createdAt: String(row.created_at) };
}

export function createPhotoService(
  storage: AuthServiceStorage = AsyncStorage,
  client: Pick<SupabaseClient<Database>, 'rpc'> = supabase,
): PhotoService {
  async function sessionToken(): Promise<string> {
    const token = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (!token) {
      throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
    }
    return token;
  }

  return {
    async listPhotos(reservationId) {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_list_reservation_photos', {
        p_session_token: token,
        p_reservation_id: reservationId,
      });
      if (error) {
        throw new Error(messageOf(error));
      }
      return (data ?? []).map(mapPhoto);
    },

    async savePhoto(reservationId, moment, base64) {
      if (!base64) {
        throw new Error('La fotografía está vacía.');
      }
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_save_reservation_photo', {
        p_session_token: token,
        p_reservation_id: reservationId,
        p_momento: moment,
        p_imagen_base64: base64,
      });
      if (error) {
        throw new Error(messageOf(error));
      }
      const row = data?.[0];
      if (!row) {
        throw new Error('No se pudo guardar la fotografía.');
      }
      return mapPhoto(row);
    },
  };
}

export const photoService = createPhotoService();

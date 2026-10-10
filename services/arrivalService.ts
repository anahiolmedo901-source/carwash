import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ArrivalContextRpcRow, Database } from '../types/database';
import type { Reservation, ReservationStatus } from '../types/reservation';
import { reservationService } from './reservationService';
import { SESSION_TOKEN_STORAGE_KEY, type AuthServiceStorage } from './authService';
import { ARRIVAL_RADIUS_METERS, isValidCoordinates, type Coordinates } from '../utils/geo';

type ArrivalRpcClient = Pick<SupabaseClient<Database>, 'rpc'>;

export interface ArrivalContext {
  reservationId: string;
  status: ReservationStatus;
  autolavadoName: string;
  /** null cuando el autolavado todavía no tiene coordenadas registradas. */
  coordinates: Coordinates | null;
  radiusMeters: number;
}

export interface ConfirmArrivalInput {
  reservationId: string;
  coordinates: Coordinates | null;
  qrCode: string | null;
}

export interface ArrivalService {
  getArrivalContext(reservationId: string): Promise<ArrivalContext | null>;
  confirmArrival(input: ConfirmArrivalInput): Promise<Reservation>;
}

const MISSING_MIGRATION_MESSAGE =
  'Falta aplicar la actualización de la base de datos. Ejecuta supabase/APLICAR_EN_SQL_EDITOR.sql en el SQL Editor de Supabase.';

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return /could not find the function|schema cache/i.test(error.message) ? MISSING_MIGRATION_MESSAGE : error.message;
  }
  return 'No se pudo completar la solicitud de llegada.';
}

function mapContext(row: ArrivalContextRpcRow): ArrivalContext {
  const coordinates = { latitude: Number(row.latitud), longitude: Number(row.longitud) };
  const radius = Number(row.radio_llegada_metros);
  return {
    reservationId: String(row.reservacion_id),
    status: row.estado,
    autolavadoName: String(row.autolavado_nombre),
    coordinates: row.latitud !== null && row.longitud !== null && isValidCoordinates(coordinates) ? coordinates : null,
    radiusMeters: Number.isFinite(radius) && radius > 0 ? radius : ARRIVAL_RADIUS_METERS,
  };
}

export function createArrivalService(
  storage: AuthServiceStorage = AsyncStorage,
  client: ArrivalRpcClient = supabase,
  reservations: Pick<typeof reservationService, 'getReservation'> = reservationService,
): ArrivalService {
  async function sessionToken(): Promise<string> {
    const token = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (!token) {
      throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
    }
    return token;
  }

  return {
    async getArrivalContext(reservationId) {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_get_arrival_context', {
        p_session_token: token,
        p_reservation_id: reservationId,
      });
      if (error) {
        throw new Error(messageOf(error));
      }
      const row = data?.[0];
      return row ? mapContext(row) : null;
    },

    async confirmArrival(input) {
      const token = await sessionToken();
      const { error } = await client.rpc('carwash_confirm_arrival', {
        p_session_token: token,
        p_reservation_id: input.reservationId,
        p_latitud: input.coordinates ? input.coordinates.latitude : null,
        p_longitud: input.coordinates ? input.coordinates.longitude : null,
        p_codigo_qr: input.qrCode,
      });
      if (error) {
        throw new Error(messageOf(error));
      }
      const reservation = await reservations.getReservation(input.reservationId);
      if (!reservation) {
        throw new Error('No se encontró la reservación.');
      }
      return reservation;
    },
  };
}

export const arrivalService = createArrivalService();

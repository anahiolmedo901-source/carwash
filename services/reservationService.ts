import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type {
  Database,
  ReservationAvailabilityRpcRow,
  ReservationRpcRow,
} from '../types/database';
import {
  RESERVATION_STATUSES,
  type Reservation,
  type ReservationAvailability,
  type ReservationAvailabilityInput,
  type ReservationCreateInput,
} from '../types/reservation';
import { SESSION_TOKEN_STORAGE_KEY, type AuthServiceStorage } from './authService';

type ReservationRpcClient = Pick<SupabaseClient<Database>, 'rpc'>;

export interface ReservationService {
  getAvailableSpaces(input: ReservationAvailabilityInput): Promise<ReservationAvailability>;
  createReservation(input: ReservationCreateInput): Promise<Reservation>;
  listReservations(): Promise<Reservation[]>;
  getReservation(reservationId: string): Promise<Reservation | null>;
  cancelReservation(reservationId: string): Promise<Reservation>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'The reservation request could not be completed.';
}

function throwRpcError(error: unknown): never {
  throw new Error(errorMessage(error));
}

function firstRow<T>(data: T[] | null | undefined): T | null {
  return data?.[0] ?? null;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`The reservation ${field} is required.`);
  }
  return normalized;
}

function toNumber(value: number | string, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`The reservation response has an invalid ${field}.`);
  }
  return parsed;
}

function mapReservation(row: ReservationRpcRow): Reservation {
  if (!(RESERVATION_STATUSES as readonly string[]).includes(row.estado)) {
    throw new Error('The reservation response has an invalid status.');
  }

  return {
    id: String(row.id),
    vehicleId: String(row.vehiculo_id),
    autolavadoId: String(row.autolavado_id),
    serviceId: String(row.servicio_id),
    spaceId: row.espacio_lavado_id === null ? null : String(row.espacio_lavado_id),
    date: String(row.fecha),
    time: String(row.hora),
    status: row.estado,
    qrCode: row.codigo_qr,
    autolavadoName: String(row.autolavado_nombre),
    serviceName: String(row.servicio_nombre),
    price: toNumber(row.precio, 'price'),
    durationMinutes: toNumber(row.duracion_aproximada, 'duration'),
    vehicleBrand: String(row.vehiculo_marca),
    vehicleModel: String(row.vehiculo_modelo),
    vehiclePlate: String(row.vehiculo_placas),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAvailability(rows: ReservationAvailabilityRpcRow[] | null): ReservationAvailability {
  const normalizedRows = rows ?? [];
  const requiresSpace = normalizedRows.some((row) => row.has_spaces);
  const spaces = normalizedRows
    .filter((row) => row.available && row.espacio_lavado_id !== null)
    .map((row) => ({ id: String(row.espacio_lavado_id) }));
  const available = normalizedRows.some((row) => row.available);

  return { requiresSpace, available, spaces };
}

export function createReservationService(
  storage: AuthServiceStorage = AsyncStorage,
  client: ReservationRpcClient = supabase,
): ReservationService {
  async function sessionToken(): Promise<string> {
    const token = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (!token) {
      throw new Error('Your session has expired. Sign in again.');
    }
    return token;
  }

  async function requireReservation(data: ReservationRpcRow[] | null): Promise<Reservation> {
    const row = firstRow(data);
    if (!row) {
      throw new Error('The reservation could not be found.');
    }
    return mapReservation(row);
  }

  return {
    async getAvailableSpaces(input) {
      const token = await sessionToken();
      const autolavadoId = requireText(input.autolavadoId, 'car wash');
      const serviceId = requireText(input.serviceId, 'service');
      const date = requireText(input.date, 'date');
      const time = requireText(input.time, 'time');
      const { data, error } = await client.rpc('carwash_available_spaces', {
        p_session_token: token,
        p_autolavado_id: autolavadoId,
        p_servicio_id: serviceId,
        p_fecha: date,
        p_hora: time,
      });
      if (error) {
        throwRpcError(error);
      }
      return mapAvailability(data);
    },

    async createReservation(input) {
      const token = await sessionToken();
      const autolavadoId = requireText(input.autolavadoId, 'car wash');
      const serviceId = requireText(input.serviceId, 'service');
      const vehicleId = requireText(input.vehicleId, 'vehicle');
      const date = requireText(input.date, 'date');
      const time = requireText(input.time, 'time');
      const { data, error } = await client.rpc('carwash_create_reservation', {
        p_session_token: token,
        p_autolavado_id: autolavadoId,
        p_servicio_id: serviceId,
        p_vehiculo_id: vehicleId,
        p_fecha: date,
        p_hora: time,
        p_espacio_lavado_id: input.spaceId,
      });
      if (error) {
        throwRpcError(error);
      }
      return requireReservation(data);
    },

    async listReservations() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_list_reservations', { p_session_token: token });
      if (error) {
        throwRpcError(error);
      }
      return (data ?? []).map(mapReservation);
    },

    async getReservation(reservationId) {
      const token = await sessionToken();
      const id = requireText(reservationId, 'id');
      const { data, error } = await client.rpc('carwash_get_reservation', {
        p_session_token: token,
        p_reservation_id: id,
      });
      if (error) {
        throwRpcError(error);
      }
      const row = firstRow(data);
      return row ? mapReservation(row) : null;
    },

    async cancelReservation(reservationId) {
      const token = await sessionToken();
      const id = requireText(reservationId, 'id');
      const { data, error } = await client.rpc('carwash_cancel_reservation', {
        p_session_token: token,
        p_reservation_id: id,
      });
      if (error) {
        throwRpcError(error);
      }
      return requireReservation(data);
    },
  };
}

export const reservationService = createReservationService();

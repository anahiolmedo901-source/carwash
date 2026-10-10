import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database, VehiculoInput, VehicleRpcRow, VehicleType } from '../types/database';
import { VEHICLE_TYPES } from '../types/database';
import { SESSION_TOKEN_STORAGE_KEY } from './authService';
import type { AuthServiceStorage } from './authService';

export { VEHICLE_TYPES };

type VehicleRpcClient = Pick<SupabaseClient<Database>, 'rpc'>;

function throwRpcError(error: unknown): never {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'The vehicle request could not be completed.';
  throw new Error(message);
}

export interface VehicleService {
  listVehicles(): Promise<VehicleRpcRow[]>;
  getVehicle(vehicleId: string): Promise<VehicleRpcRow | null>;
  createVehicle(input: VehiculoInput): Promise<VehicleRpcRow>;
  updateVehicle(vehicleId: string, input: VehiculoInput): Promise<VehicleRpcRow>;
  deleteVehicle(vehicleId: string): Promise<boolean>;
}

export function isVehicleType(value: unknown): value is VehicleType {
  return typeof value === 'string' && (VEHICLE_TYPES as readonly string[]).includes(value);
}

export function validateVehicleInput(input: VehiculoInput): VehiculoInput {
  if (!isVehicleType(input.tipo)) {
    throw new Error('Choose a permitted vehicle type.');
  }
  if (
    !input.marca.trim() ||
    !input.modelo.trim() ||
    !Number.isInteger(input.anio) ||
    input.anio < 1886 ||
    !input.color.trim() ||
    !input.placas.trim()
  ) {
    throw new Error('Complete all vehicle fields with a valid year.');
  }

  return {
    marca: input.marca.trim(),
    modelo: input.modelo.trim(),
    anio: input.anio,
    color: input.color.trim(),
    placas: input.placas.trim(),
    tipo: input.tipo,
  };
}

function firstRow(data: VehicleRpcRow[] | null): VehicleRpcRow | null {
  return data?.[0] ?? null;
}

export function createVehicleService(
  storage: AuthServiceStorage = AsyncStorage,
  client: VehicleRpcClient = supabase,
): VehicleService {
  async function sessionToken(): Promise<string> {
    const token = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (!token) {
      throw new Error('Your session has expired. Sign in again.');
    }
    return token;
  }

  async function requireVehicle(data: VehicleRpcRow[] | null): Promise<VehicleRpcRow> {
    const row = firstRow(data);
    if (!row) {
      throw new Error('The vehicle could not be found.');
    }
    return row;
  }

  return {
    async listVehicles() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_list_vehicles', { p_session_token: token });
      if (error) {
        throwRpcError(error);
      }
      return data ?? [];
    },

    async getVehicle(vehicleId: string) {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_get_vehicle', {
        p_session_token: token,
        p_vehicle_id: vehicleId,
      });
      if (error) {
        throwRpcError(error);
      }
      return firstRow(data);
    },

    async createVehicle(input: VehiculoInput) {
      const vehicle = validateVehicleInput(input);
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_create_vehicle', {
        p_session_token: token,
        p_marca: vehicle.marca,
        p_modelo: vehicle.modelo,
        p_anio: vehicle.anio,
        p_color: vehicle.color,
        p_placas: vehicle.placas,
        p_tipo: vehicle.tipo,
      });
      if (error) {
        throwRpcError(error);
      }
      return requireVehicle(data);
    },

    async updateVehicle(vehicleId: string, input: VehiculoInput) {
      const vehicle = validateVehicleInput(input);
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_update_vehicle', {
        p_session_token: token,
        p_vehicle_id: vehicleId,
        p_marca: vehicle.marca,
        p_modelo: vehicle.modelo,
        p_anio: vehicle.anio,
        p_color: vehicle.color,
        p_placas: vehicle.placas,
        p_tipo: vehicle.tipo,
      });
      if (error) {
        throwRpcError(error);
      }
      return requireVehicle(data);
    },

    async deleteVehicle(vehicleId: string) {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_delete_vehicle', {
        p_session_token: token,
        p_vehicle_id: vehicleId,
      });
      if (error) {
        throwRpcError(error);
      }
      return data === true;
    },
  };
}

export const vehicleService = createVehicleService();

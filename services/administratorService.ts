import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type {
  AdministratorAutolavadoRpcRow,
  AdministratorDashboardRpcRow,
  AdministratorEmployeeRpcRow,
  AdministratorRatingRpcRow,
  AdministratorReservationRpcRow,
  AdministratorReservationStatusRpcRow,
  AdministratorServiceRpcRow,
  AdministratorWashingSpaceRpcRow,
  Database,
} from '../types/database';
import type {
  AdministratorAutolavado,
  AdministratorDashboard,
  AdministratorEmployee,
  AdministratorEmployeeAssignment,
  AdministratorManagedService,
  AdministratorRating,
  AdministratorReservation,
  AdministratorReservationStatusUpdate,
  AdministratorServiceInput,
  AdministratorWashingSpace,
  AdministratorWashingSpaceInput,
  AdministratorService,
} from '../types/administrator';
import { isPaymentStatus } from '../types/payment';
import { RESERVATION_STATUSES } from '../types/reservation';
import { isSpaceStatus } from '../types/realtime';
import { SESSION_TOKEN_STORAGE_KEY, type AuthServiceStorage } from './authService';

type AdministratorRpcClient = Pick<SupabaseClient<Database>, 'rpc'>;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'The administrator request could not be completed.';
}

function throwRpcError(error: unknown): never {
  throw new Error(errorMessage(error));
}

function firstRow<T>(data: T[] | null | undefined): T | null {
  return data?.[0] ?? null;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`The administrator response has an invalid ${field}.`);
  }
  return value;
}

function optionalText(value: unknown, field: string): string | null {
  if (value == null) {
    return null;
  }
  return requiredText(value, field);
}

function finiteNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`The administrator response has an invalid ${field}.`);
  }
  return parsed;
}

function nonNegativeNumber(value: unknown, field: string): number {
  const parsed = finiteNumber(value, field);
  if (parsed < 0) {
    throw new Error(`The administrator response has an invalid ${field}.`);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = nonNegativeNumber(value, field);
  if (!Number.isInteger(parsed)) {
    throw new Error(`The administrator response has an invalid ${field}.`);
  }
  return parsed;
}

const MAX_SERVICE_PRICE = 9999999999.99;

function requiredInputText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`The administrator ${field} is required.`);
  }
  return value.trim();
}

function requiredInputId(value: unknown, field: string): string {
  return requiredInputText(value, `${field} id`);
}

function validMoney(value: unknown, field: string): number {
  if (typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
    || value > MAX_SERVICE_PRICE
    || Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) {
    throw new Error(`The administrator ${field} must be a non-negative amount with at most two decimals.`);
  }
  return value;
}

function validDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error('The administrator service duration must be positive and a whole number.');
  }
  return value;
}

function normalizeServiceInput(input: AdministratorServiceInput): AdministratorServiceInput {
  const autolavadoId = requiredInputId(input?.autolavadoId, 'car wash');
  const name = requiredInputText(input?.name, 'service name');
  const description = requiredInputText(input?.description, 'service description');
  const price = validMoney(input?.price, 'service price');
  const durationMinutes = validDuration(input?.durationMinutes);
  if (typeof input?.active !== 'boolean') {
    throw new Error('The administrator service active flag must be true or false.');
  }

  return { autolavadoId, name, description, price, durationMinutes, active: input.active };
}

function normalizeWashingSpaceInput(input: AdministratorWashingSpaceInput): AdministratorWashingSpaceInput {
  const autolavadoId = requiredInputId(input?.autolavadoId, 'car wash');
  const name = requiredInputText(input?.name, 'washing space name');
  if (!isSpaceStatus(input?.status)) {
    throw new Error('The washing space status is not allowed.');
  }
  if (typeof input?.active !== 'boolean') {
    throw new Error('The washing space active flag must be true or false.');
  }
  return { autolavadoId, name, status: input.status, active: input.active };
}

function mapManagedService(row: AdministratorServiceRpcRow): AdministratorManagedService {
  return {
    id: requiredText(row.id, 'service id'),
    autolavadoId: requiredText(row.autolavado_id, 'service car wash id'),
    name: requiredText(row.nombre, 'service name'),
    description: requiredText(row.descripcion, 'service description'),
    price: validMoney(finiteNumber(row.precio, 'service price'), 'service price'),
    durationMinutes: validDuration(finiteNumber(row.duracion_aproximada, 'service duration')),
    active: row.activo === true,
  };
}

function mapWashingSpace(row: AdministratorWashingSpaceRpcRow): AdministratorWashingSpace {
  if (!isSpaceStatus(row.estado)) {
    throw new Error('The administrator response has an invalid washing space status.');
  }
  if (typeof row.activo !== 'boolean') {
    throw new Error('The administrator response has an invalid washing space active flag.');
  }
  return {
    id: requiredText(row.id, 'washing space id'),
    autolavadoId: requiredText(row.autolavado_id, 'space car wash id'),
    name: requiredText(row.nombre, 'washing space name'),
    status: row.estado,
    active: row.activo,
  };
}

function mapDashboard(row: AdministratorDashboardRpcRow): AdministratorDashboard {
  return {
    todayReservations: nonNegativeInteger(row.today_reservations, 'today reservations'),
    collectedRevenue: nonNegativeNumber(row.collected_revenue, 'collected revenue'),
    completedServices: nonNegativeInteger(row.completed_services, 'completed services'),
    vehiclesCurrentlyWashing: nonNegativeInteger(row.vehicles_in_lavado, 'vehicles currently washing'),
    averageRating: nonNegativeNumber(row.average_rating, 'average rating'),
    ratingCount: nonNegativeInteger(row.rating_count, 'rating count'),
  };
}

function mapAutolavado(row: AdministratorAutolavadoRpcRow): AdministratorAutolavado {
  return {
    id: requiredText(row.id, 'car wash id'),
    name: requiredText(row.nombre, 'car wash name'),
  };
}

function mapAssignment(row: AdministratorEmployeeRpcRow): AdministratorEmployeeAssignment | null {
  if (row.asignacion_id === null) {
    return null;
  }
  return {
    id: requiredText(row.asignacion_id, 'assignment id'),
    autolavadoId: requiredText(row.autolavado_id, 'assignment car wash id'),
    autolavadoName: requiredText(row.autolavado_nombre, 'assignment car wash name'),
    active: row.asignacion_activa === true,
  };
}

function mapEmployees(rows: AdministratorEmployeeRpcRow[]): AdministratorEmployee[] {
  const employees = new Map<string, AdministratorEmployee>();

  for (const row of rows) {
    const id = requiredText(row.id, 'employee id');
    let employee = employees.get(id);
    if (!employee) {
      employee = {
        id,
        firstName: requiredText(row.nombre, 'employee first name'),
        lastName: requiredText(row.apellido, 'employee last name'),
        email: requiredText(row.correo, 'employee email'),
        phone: requiredText(row.telefono, 'employee phone'),
        active: row.activo === true,
        assignments: [],
      };
      employees.set(id, employee);
    }

    const assignment = mapAssignment(row);
    if (assignment && !employee.assignments.some((item) => item.id === assignment.id)) {
      employee.assignments.push(assignment);
    }
  }

  return [...employees.values()];
}

function mapReservation(row: AdministratorReservationRpcRow): AdministratorReservation {
  if (!(RESERVATION_STATUSES as readonly string[]).includes(row.estado)) {
    throw new Error('The administrator response has an invalid reservation status.');
  }
  if (row.payment_status !== null && !isPaymentStatus(row.payment_status)) {
    throw new Error('The administrator response has an invalid payment status.');
  }

  return {
    id: requiredText(row.id, 'reservation id'),
    date: requiredText(row.fecha, 'reservation date'),
    time: requiredText(row.hora, 'reservation time'),
    status: row.estado,
    vehicleId: requiredText(row.vehiculo_id, 'vehicle id'),
    vehicleBrand: requiredText(row.vehiculo_marca, 'vehicle brand'),
    vehicleModel: requiredText(row.vehiculo_modelo, 'vehicle model'),
    vehiclePlate: requiredText(row.vehiculo_placas, 'vehicle plate'),
    autolavadoId: requiredText(row.autolavado_id, 'car wash id'),
    autolavadoName: requiredText(row.autolavado_nombre, 'car wash name'),
    serviceId: requiredText(row.servicio_id, 'service id'),
    serviceName: requiredText(row.servicio_nombre, 'service name'),
    spaceId: optionalText(row.espacio_lavado_id, 'washing space id'),
    price: nonNegativeNumber(row.precio, 'reservation price'),
    durationMinutes: nonNegativeNumber(row.duracion_aproximada, 'service duration'),
    customerFirstName: requiredText(row.cliente_nombre, 'customer first name'),
    customerLastName: requiredText(row.cliente_apellido, 'customer last name'),
    customerEmail: requiredText(row.cliente_correo, 'customer email'),
    customerPhone: requiredText(row.cliente_telefono, 'customer phone'),
    paymentStatus: row.payment_status,
    paymentAmount: row.payment_amount === null
      ? null
      : nonNegativeNumber(row.payment_amount, 'payment amount'),
    paymentPaidAt: optionalText(row.payment_paid_at, 'payment paid at'),
    createdAt: requiredText(row.created_at, 'reservation creation time'),
    updatedAt: requiredText(row.updated_at, 'reservation update time'),
  };
}

function mapRating(row: AdministratorRatingRpcRow): AdministratorRating {
  const rating = finiteNumber(row.puntuacion, 'rating');
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    throw new Error('The administrator response has an invalid rating.');
  }

  return {
    id: requiredText(row.id, 'rating id'),
    reservationId: requiredText(row.reservacion_id, 'rating reservation id'),
    reservationDate: requiredText(row.reservacion_fecha, 'rating reservation date'),
    reservationTime: requiredText(row.reservacion_hora, 'rating reservation time'),
    autolavadoId: requiredText(row.autolavado_id, 'rating car wash id'),
    autolavadoName: requiredText(row.autolavado_nombre, 'rating car wash name'),
    serviceName: requiredText(row.servicio_nombre, 'rating service name'),
    customerFirstName: requiredText(row.cliente_nombre, 'rating customer first name'),
    customerLastName: requiredText(row.cliente_apellido, 'rating customer last name'),
    rating,
    comment: optionalText(row.comentario, 'rating comment'),
    createdAt: requiredText(row.created_at, 'rating creation time'),
  };
}

function mapReservationStatusUpdate(row: AdministratorReservationStatusRpcRow): AdministratorReservationStatusUpdate {
  if (!(RESERVATION_STATUSES as readonly string[]).includes(row.estado)) {
    throw new Error('The administrator response has an invalid reservation status.');
  }

  return {
    id: requiredText(row.id, 'reservation id'),
    status: row.estado,
    updatedAt: requiredText(row.updated_at, 'reservation update time'),
  };
}

function firstManagedService(data: AdministratorServiceRpcRow[] | null | undefined): AdministratorManagedService {
  const row = firstRow(data);
  if (!row) {
    throw new Error('The administrator service response is empty.');
  }
  return mapManagedService(row);
}

function firstWashingSpace(data: AdministratorWashingSpaceRpcRow[] | null | undefined): AdministratorWashingSpace {
  const row = firstRow(data);
  if (!row) {
    throw new Error('The administrator washing space response is empty.');
  }
  return mapWashingSpace(row);
}

export function createAdministratorService(
  storage: AuthServiceStorage = AsyncStorage,
  client: AdministratorRpcClient = supabase,
): AdministratorService {
  async function sessionToken(): Promise<string> {
    const token = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (!token) {
      throw new Error('Your session has expired. Sign in again.');
    }
    return token;
  }

  return {
    async getDashboard() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_dashboard', {
        p_session_token: token,
      });
      if (error) {
        throwRpcError(error);
      }
      const row = firstRow(data);
      if (!row) {
        throw new Error('The administrator dashboard response is empty.');
      }
      return mapDashboard(row);
    },

    async listAutolavados() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_list_autolavados', {
        p_session_token: token,
      });
      if (error) {
        throwRpcError(error);
      }
      return (data ?? []).map(mapAutolavado);
    },

    async listEmployees() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_list_employees', {
        p_session_token: token,
      });
      if (error) {
        throwRpcError(error);
      }
      return mapEmployees(data ?? []);
    },

    async listReservations() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_list_reservations', {
        p_session_token: token,
      });
      if (error) {
        throwRpcError(error);
      }
      return (data ?? []).map(mapReservation);
    },

    async updateReservationStatus(reservationId, status) {
      const id = requiredInputId(reservationId, 'reservation');
      if (!(RESERVATION_STATUSES as readonly string[]).includes(status)) {
        throw new Error('The reservation status is not allowed.');
      }
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_update_reservation_status', {
        p_session_token: token,
        p_reservation_id: id,
        p_estado: status,
      });
      if (error) {
        throwRpcError(error);
      }
      const row = firstRow(data);
      if (!row) {
        throw new Error('The administrator reservation status response is empty.');
      }
      return mapReservationStatusUpdate(row);
    },

    async listRatings() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_list_ratings', {
        p_session_token: token,
      });
      if (error) {
        throwRpcError(error);
      }
      return (data ?? []).map(mapRating);
    },

    async listServices() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_list_services', {
        p_session_token: token,
      });
      if (error) {
        throwRpcError(error);
      }
      return (data ?? []).map(mapManagedService);
    },

    async createService(input) {
      const serviceInput = normalizeServiceInput(input);
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_create_service', {
        p_session_token: token,
        p_autolavado_id: serviceInput.autolavadoId,
        p_nombre: serviceInput.name,
        p_descripcion: serviceInput.description,
        p_precio: serviceInput.price,
        p_duracion_aproximada: serviceInput.durationMinutes,
        p_activo: serviceInput.active,
      });
      if (error) {
        throwRpcError(error);
      }
      return firstManagedService(data);
    },

    async updateService(serviceId, input) {
      const id = requiredInputId(serviceId, 'service');
      const serviceInput = normalizeServiceInput(input);
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_update_service', {
        p_session_token: token,
        p_servicio_id: id,
        p_autolavado_id: serviceInput.autolavadoId,
        p_nombre: serviceInput.name,
        p_descripcion: serviceInput.description,
        p_precio: serviceInput.price,
        p_duracion_aproximada: serviceInput.durationMinutes,
        p_activo: serviceInput.active,
      });
      if (error) {
        throwRpcError(error);
      }
      return firstManagedService(data);
    },

    async deleteService(serviceId) {
      const id = requiredInputId(serviceId, 'service');
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_delete_service', {
        p_session_token: token,
        p_servicio_id: id,
      });
      if (error) {
        throwRpcError(error);
      }
      return data === true;
    },

    async listWashingSpaces() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_list_washing_spaces', {
        p_session_token: token,
      });
      if (error) {
        throwRpcError(error);
      }
      return (data ?? []).map(mapWashingSpace);
    },

    async createWashingSpace(input) {
      const spaceInput = normalizeWashingSpaceInput(input);
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_create_washing_space', {
        p_session_token: token,
        p_autolavado_id: spaceInput.autolavadoId,
        p_nombre: spaceInput.name,
        p_estado: spaceInput.status,
        p_activo: spaceInput.active,
      });
      if (error) {
        throwRpcError(error);
      }
      return firstWashingSpace(data);
    },

    async updateWashingSpace(spaceId, input) {
      const id = requiredInputId(spaceId, 'washing space');
      const spaceInput = normalizeWashingSpaceInput(input);
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_update_washing_space', {
        p_session_token: token,
        p_espacio_id: id,
        p_autolavado_id: spaceInput.autolavadoId,
        p_nombre: spaceInput.name,
        p_estado: spaceInput.status,
        p_activo: spaceInput.active,
      });
      if (error) {
        throwRpcError(error);
      }
      return firstWashingSpace(data);
    },

    async deleteWashingSpace(spaceId) {
      const id = requiredInputId(spaceId, 'washing space');
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_administrator_delete_washing_space', {
        p_session_token: token,
        p_espacio_id: id,
      });
      if (error) {
        throwRpcError(error);
      }
      return data === true;
    },
  };
}

export const administratorService = createAdministratorService();

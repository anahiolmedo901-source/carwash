import {
  RESERVATION_STATUSES,
  type ReservationStatus,
} from './reservation';

export const SPACE_STATUSES = [
  'disponible',
  'reservado',
  'ocupado',
  'mantenimiento',
] as const;

export type SpaceStatus = (typeof SPACE_STATUSES)[number];

export const RESERVATION_BROADCAST_EVENT = 'reservation_status';
export const SPACE_BROADCAST_EVENT = 'space_status';

export interface ReservationStatusUpdate {
  entityId: string;
  status: ReservationStatus;
  updatedAt: string;
}

export interface SpaceStatusUpdate {
  entityId: string;
  status: SpaceStatus;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireExactPayloadKeys(payload: Record<string, unknown>): void {
  const keys = Object.keys(payload).sort();
  if (keys.length !== 3 || keys.join('|') !== 'id|status|updated_at') {
    throw new Error('Realtime payload contains fields outside the status contract.');
  }
}

function requirePayloadFields(payload: unknown, entity: string): { id: string; status: string; updatedAt: string } {
  if (!isRecord(payload)) {
    throw new Error(`Realtime ${entity} payload is not an object.`);
  }
  requireExactPayloadKeys(payload);

  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const status = typeof payload.status === 'string' ? payload.status : '';
  const updatedAt = typeof payload.updated_at === 'string' ? payload.updated_at.trim() : '';
  if (!id || !status || !updatedAt) {
    throw new Error(`Realtime ${entity} payload is incomplete.`);
  }
  return { id, status, updatedAt };
}

export function isReservationStatus(value: unknown): value is ReservationStatus {
  return typeof value === 'string'
    && (RESERVATION_STATUSES as readonly string[]).includes(value);
}

export function isSpaceStatus(value: unknown): value is SpaceStatus {
  return typeof value === 'string'
    && (SPACE_STATUSES as readonly string[]).includes(value);
}

export function parseReservationStatusUpdate(payload: unknown): ReservationStatusUpdate {
  const fields = requirePayloadFields(payload, 'reservation status');
  if (!isReservationStatus(fields.status)) {
    throw new Error(`Realtime reservation status is invalid: ${fields.status}.`);
  }
  return { entityId: fields.id, status: fields.status, updatedAt: fields.updatedAt };
}

export function parseSpaceStatusUpdate(payload: unknown): SpaceStatusUpdate {
  const fields = requirePayloadFields(payload, 'space status');
  if (!isSpaceStatus(fields.status)) {
    throw new Error(`Realtime space status is invalid: ${fields.status}.`);
  }
  return { entityId: fields.id, status: fields.status, updatedAt: fields.updatedAt };
}

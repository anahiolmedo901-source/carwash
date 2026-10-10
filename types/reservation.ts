export const RESERVATION_STATUSES = [
  'pendiente',
  'confirmada',
  'cliente_llego',
  'en_espera',
  'en_lavado',
  'finalizada',
  'cancelada',
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const ACTIVE_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'pendiente',
  'confirmada',
  'cliente_llego',
  'en_espera',
  'en_lavado',
];

export interface AvailableSpace {
  id: string;
}

export interface ReservationAvailability {
  requiresSpace: boolean;
  available: boolean;
  spaces: AvailableSpace[];
}

export interface ReservationAvailabilityInput {
  autolavadoId: string;
  serviceId: string;
  date: string;
  time: string;
}

export interface ReservationCreateInput extends ReservationAvailabilityInput {
  vehicleId: string;
  spaceId: string | null;
}

export interface Reservation {
  id: string;
  vehicleId: string;
  autolavadoId: string;
  serviceId: string;
  spaceId: string | null;
  date: string;
  time: string;
  status: ReservationStatus;
  qrCode: string | null;
  autolavadoName: string;
  serviceName: string;
  price: number;
  durationMinutes: number;
  vehicleBrand: string;
  vehicleModel: string;
  vehiclePlate: string;
  createdAt: string;
  updatedAt: string;
}

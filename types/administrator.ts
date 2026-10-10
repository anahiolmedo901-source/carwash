import type { PaymentStatus } from './payment';
import type { ReservationStatus } from './reservation';
import type { SpaceStatus } from './realtime';

export interface AdministratorDashboard {
  todayReservations: number;
  collectedRevenue: number;
  completedServices: number;
  vehiclesCurrentlyWashing: number;
  averageRating: number;
  ratingCount: number;
}

export interface AdministratorAutolavado {
  id: string;
  name: string;
}

export interface AdministratorEmployeeAssignment {
  id: string;
  autolavadoId: string;
  autolavadoName: string;
  active: boolean;
}

export interface AdministratorEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  active: boolean;
  assignments: AdministratorEmployeeAssignment[];
}

export interface AdministratorReservation {
  id: string;
  date: string;
  time: string;
  status: ReservationStatus;
  vehicleId: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehiclePlate: string;
  autolavadoId: string;
  autolavadoName: string;
  serviceId: string;
  serviceName: string;
  spaceId: string | null;
  price: number;
  durationMinutes: number;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  paymentStatus: PaymentStatus | null;
  paymentAmount: number | null;
  paymentPaidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdministratorRating {
  id: string;
  reservationId: string;
  reservationDate: string;
  reservationTime: string;
  autolavadoId: string;
  autolavadoName: string;
  serviceName: string;
  customerFirstName: string;
  customerLastName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface AdministratorReservationStatusUpdate {
  id: string;
  status: ReservationStatus;
  updatedAt: string;
}

export interface AdministratorManagedService {
  id: string;
  autolavadoId: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  active: boolean;
}

export interface AdministratorServiceInput {
  autolavadoId: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  active: boolean;
}

export interface AdministratorWashingSpace {
  id: string;
  autolavadoId: string;
  name: string;
  status: SpaceStatus;
  active: boolean;
}

export interface AdministratorWashingSpaceInput {
  autolavadoId: string;
  name: string;
  status: SpaceStatus;
  active: boolean;
}

export interface AdministratorService {
  getDashboard(): Promise<AdministratorDashboard>;
  listAutolavados(): Promise<AdministratorAutolavado[]>;
  listEmployees(): Promise<AdministratorEmployee[]>;
  listReservations(): Promise<AdministratorReservation[]>;
  updateReservationStatus(
    reservationId: string,
    status: ReservationStatus,
  ): Promise<AdministratorReservationStatusUpdate>;
  listRatings(): Promise<AdministratorRating[]>;
  listServices(): Promise<AdministratorManagedService[]>;
  createService(input: AdministratorServiceInput): Promise<AdministratorManagedService>;
  updateService(serviceId: string, input: AdministratorServiceInput): Promise<AdministratorManagedService>;
  deleteService(serviceId: string): Promise<boolean>;
  listWashingSpaces(): Promise<AdministratorWashingSpace[]>;
  createWashingSpace(input: AdministratorWashingSpaceInput): Promise<AdministratorWashingSpace>;
  updateWashingSpace(spaceId: string, input: AdministratorWashingSpaceInput): Promise<AdministratorWashingSpace>;
  deleteWashingSpace(spaceId: string): Promise<boolean>;
}

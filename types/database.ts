import type { ReservationStatus } from './reservation';
import type {
  PaymentMethod,
  PaymentOutcome,
  PaymentStatus,
} from './payment';
import type { SpaceStatus } from './realtime';

export type UserRole = 'cliente' | 'empleado' | 'administrador';

export const VEHICLE_TYPES = [
  'sedan',
  'hatchback',
  'suv',
  'pickup',
  'van',
  'deportivo',
  'otro',
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

export type VehiculoRow = {
  id: string;
  usuario_id: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string;
  placas: string;
  tipo: VehicleType;
  created_at: string;
  updated_at: string;
};

export type VehiculoTableRow = VehiculoRow & {
  activo: boolean;
  eliminado_en: string | null;
};

export type VehicleRpcRow = Omit<VehiculoRow, 'usuario_id'>;

export type VehiculoInput = Pick<VehiculoRow, 'marca' | 'modelo' | 'anio' | 'color' | 'placas' | 'tipo'>;

export type AuthProfileRpcRow = {
  user_id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  rol: UserRole;
};

export type AuthSessionRpcRow = AuthProfileRpcRow & {
  expires_at: string;
};

export type LoginSessionRpcRow = AuthSessionRpcRow & { session_token: string };

export type RegistrationRpcArgs = {
  p_nombre: string;
  p_apellido: string;
  p_correo: string;
  p_telefono: string;
  p_password: string;
};

export type RegistrationRpcRow = AuthProfileRpcRow;

export type ReservationRpcRow = {
  id: string;
  vehiculo_id: string;
  autolavado_id: string;
  servicio_id: string;
  espacio_lavado_id: string | null;
  fecha: string;
  hora: string;
  estado: ReservationStatus;
  codigo_qr: string | null;
  autolavado_nombre: string;
  servicio_nombre: string;
  precio: number | string;
  duracion_aproximada: number | string;
  vehiculo_marca: string;
  vehiculo_modelo: string;
  vehiculo_placas: string;
  created_at: string;
  updated_at: string;
};

export type ArrivalContextRpcRow = {
  reservacion_id: string;
  estado: ReservationStatus;
  autolavado_nombre: string;
  latitud: number | null;
  longitud: number | null;
  radio_llegada_metros: number | null;
};

export type ReservationPhotoRpcRow = {
  momento: 'antes' | 'despues';
  imagen_base64: string;
  created_at: string;
};

export type ReservationTableRow = {
  id: string;
  usuario_id: string;
  vehiculo_id: string;
  autolavado_id: string;
  servicio_id: string;
  espacio_id: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  estado: string;
  codigo_qr: string | null;
  precio_snapshot: number | string;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export type ServicioTableRow = {
  id: string;
  autolavado_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number | string | null;
  duracion_minutos: number | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type EspacioLavadoTableRow = {
  id: string;
  autolavado_id: string;
  nombre: string;
  estado: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type ReservationAvailabilityRpcRow = {
  has_spaces: boolean;
  available: boolean;
  espacio_lavado_id: string | null;
};

export type ReservationAvailabilityRpcArgs = {
  p_session_token: string;
  p_autolavado_id: string;
  p_servicio_id: string;
  p_fecha: string;
  p_hora: string;
};

export type PagoRow = {
  id: string;
  reservacion_id: string;
  usuario_id: string;
  monto: number | string;
  metodo_pago: PaymentMethod;
  estado: PaymentStatus;
  referencia_externa: string | null;
  fecha_pago: string | null;
  created_at: string;
};

export type PaymentRpcRow = Omit<PagoRow, 'usuario_id'>;

export type PaymentHistoryRpcRow = PaymentRpcRow & {
  reservacion_estado: ReservationStatus;
  reservacion_fecha: string;
  reservacion_hora: string;
  autolavado_id: string;
  autolavado_nombre: string;
  servicio_id: string;
  servicio_nombre: string;
};

export type CalificacionTableRow = {
  id: string;
  reservacion_id: string;
  usuario_id: string;
  autolavado_id: string;
  puntuacion: number;
  comentario: string | null;
  created_at: string;
  updated_at: string;
};

export type PushTokenTableRow = {
  token: string;
  usuario_id: string;
  platform: 'android' | 'ios';
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type DeviceTableRow = PushTokenTableRow;

export type NotificationTableRow = {
  id: string;
  usuario_id: string;
  reservacion_id: string | null;
  pago_id: string | null;
  tipo: string;
  titulo: string;
  mensaje: string;
  datos: Record<string, unknown>;
  enviada: boolean;
  leida: boolean;
  error: string | null;
  created_at: string;
  enviada_at: string | null;
};

export type PaymentBeginRpcArgs = {
  p_session_token: string;
  p_reservation_id: string;
  p_metodo_pago: PaymentMethod;
};

export type PaymentProcessSandboxRpcArgs = {
  p_session_token: string;
  p_payment_id: string;
  p_outcome: PaymentOutcome;
};

export type StripePaymentEventStatus =
  | 'succeeded'
  | 'processing'
  | 'failed'
  | 'canceled'
  | 'refunded';

export type ReservationCreateRpcArgs = ReservationAvailabilityRpcArgs & {
  p_vehiculo_id: string;
  p_espacio_lavado_id: string | null;
};

export type AdministratorDashboardRpcRow = {
  today_reservations: number | string;
  collected_revenue: number | string;
  completed_services: number | string;
  vehicles_in_lavado: number | string;
  average_rating: number | string;
  rating_count: number | string;
};

export type AdministratorAutolavadoRpcRow = {
  id: string;
  nombre: string;
};

export type AdministratorEmployeeRpcRow = {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  activo: boolean;
  asignacion_id: string | null;
  autolavado_id: string | null;
  autolavado_nombre: string | null;
  asignacion_activa: boolean | null;
};

export type AdministratorReservationRpcRow = {
  id: string;
  fecha: string;
  hora: string;
  estado: ReservationStatus;
  vehiculo_id: string;
  vehiculo_marca: string;
  vehiculo_modelo: string;
  vehiculo_placas: string;
  autolavado_id: string;
  autolavado_nombre: string;
  servicio_id: string;
  servicio_nombre: string;
  espacio_lavado_id: string | null;
  precio: number | string;
  duracion_aproximada: number | string;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_correo: string;
  cliente_telefono: string;
  payment_status: PaymentStatus | null;
  payment_amount: number | string | null;
  payment_paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdministratorServiceRpcRow = {
  id: string;
  autolavado_id: string;
  nombre: string;
  descripcion: string;
  precio: number | string;
  duracion_aproximada: number | string;
  activo: boolean;
};

export type AdministratorWashingSpaceRpcRow = {
  id: string;
  autolavado_id: string;
  nombre: string;
  estado: SpaceStatus;
  activo: boolean;
};

export type AdministratorServiceRpcFields = {
  p_autolavado_id: string;
  p_nombre: string;
  p_descripcion: string;
  p_precio: number;
  p_duracion_aproximada: number;
  p_activo: boolean;
};

export type AdministratorServiceCreateRpcArgs = {
  p_session_token: string;
} & AdministratorServiceRpcFields;

export type AdministratorServiceUpdateRpcArgs = AdministratorServiceCreateRpcArgs & {
  p_servicio_id: string;
};

export type AdministratorWashingSpaceFields = {
  p_autolavado_id: string;
  p_nombre: string;
  p_estado: SpaceStatus;
  p_activo: boolean;
};

export type AdministratorWashingSpaceCreateRpcArgs = {
  p_session_token: string;
} & AdministratorWashingSpaceFields;

export type AdministratorWashingSpaceUpdateRpcArgs = AdministratorWashingSpaceCreateRpcArgs & {
  p_espacio_id: string;
};

export type AdministratorRatingRpcRow = {
  id: string;
  reservacion_id: string;
  reservacion_fecha: string;
  reservacion_hora: string;
  autolavado_id: string;
  autolavado_nombre: string;
  servicio_nombre: string;
  cliente_nombre: string;
  cliente_apellido: string;
  puntuacion: number;
  comentario: string | null;
  created_at: string;
};

export type AdministratorReservationStatusRpcRow = {
  id: string;
  estado: ReservationStatus;
  updated_at: string;
};

export type UserProfile = {
  id: string;
  auth_id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  rol: UserRole;
  foto_url: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

type UsuarioInsert = Omit<UserProfile, 'id' | 'foto_url' | 'created_at' | 'updated_at'> & {
  id?: string;
  foto_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

type VehiculoInsert = Omit<VehiculoTableRow, 'id' | 'created_at' | 'updated_at' | 'activo' | 'eliminado_en'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  activo?: boolean;
  eliminado_en?: string | null;
};

type VehicleInputRpcArgs = {
  p_session_token: string;
  p_marca: string;
  p_modelo: string;
  p_anio: number;
  p_color: string;
  p_placas: string;
  p_tipo: VehicleType;
};

export interface Database {
  public: {
    Tables: {
      usuarios: {
        Row: UserProfile;
        Insert: UsuarioInsert;
        Update: Partial<UsuarioInsert>;
        Relationships: [];
      };
      vehiculos: {
        Row: VehiculoTableRow;
        Insert: VehiculoInsert;
        Update: Partial<VehiculoInsert>;
        Relationships: [];
      };
      reservaciones: {
        Row: ReservationTableRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      servicios: {
        Row: ServicioTableRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      espacios_lavado: {
        Row: EspacioLavadoTableRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      pagos: {
        Row: PagoRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      calificaciones: {
        Row: CalificacionTableRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      carwash_push_tokens: {
        Row: PushTokenTableRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      dispositivos: {
        Row: DeviceTableRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      notificaciones: {
        Row: NotificationTableRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      carwash_register: {
        Args: RegistrationRpcArgs;
        Returns: RegistrationRpcRow[];
      };
      carwash_login: {
        Args: { p_telefono: string; p_password: string };
        Returns: LoginSessionRpcRow[];
      };
      carwash_restore_session: {
        Args: { p_session_token: string };
        Returns: AuthSessionRpcRow[];
      };
      carwash_revoke_session: {
        Args: { p_session_token: string };
        Returns: undefined;
      };
      carwash_register_push_token: {
        Args: { p_session_token: string; p_token: string; p_platform: 'android' | 'ios' };
        Returns: boolean;
      };
      carwash_unregister_push_token: {
        Args: { p_session_token: string; p_token: string };
        Returns: boolean;
      };
      carwash_list_vehicles: {
        Args: { p_session_token: string };
        Returns: VehicleRpcRow[];
      };
      carwash_get_vehicle: {
        Args: { p_session_token: string; p_vehicle_id: string };
        Returns: VehicleRpcRow[];
      };
      carwash_create_vehicle: {
        Args: VehicleInputRpcArgs;
        Returns: VehicleRpcRow[];
      };
      carwash_update_vehicle: {
        Args: VehicleInputRpcArgs & { p_vehicle_id: string };
        Returns: VehicleRpcRow[];
      };
      carwash_delete_vehicle: {
        Args: { p_session_token: string; p_vehicle_id: string };
        Returns: boolean;
      };
      carwash_available_spaces: {
        Args: ReservationAvailabilityRpcArgs;
        Returns: ReservationAvailabilityRpcRow[];
      };
      carwash_create_reservation: {
        Args: ReservationCreateRpcArgs;
        Returns: ReservationRpcRow[];
      };
      carwash_list_reservations: {
        Args: { p_session_token: string };
        Returns: ReservationRpcRow[];
      };
      carwash_get_reservation: {
        Args: { p_session_token: string; p_reservation_id: string };
        Returns: ReservationRpcRow[];
      };
      carwash_cancel_reservation: {
        Args: { p_session_token: string; p_reservation_id: string };
        Returns: ReservationRpcRow[];
      };
      carwash_save_reservation_photo: {
        Args: { p_session_token: string; p_reservation_id: string; p_momento: string; p_imagen_base64: string };
        Returns: ReservationPhotoRpcRow[];
      };
      carwash_list_reservation_photos: {
        Args: { p_session_token: string; p_reservation_id: string };
        Returns: ReservationPhotoRpcRow[];
      };
      carwash_get_arrival_context: {
        Args: { p_session_token: string; p_reservation_id: string };
        Returns: ArrivalContextRpcRow[];
      };
      carwash_confirm_arrival: {
        Args: {
          p_session_token: string;
          p_reservation_id: string;
          p_latitud: number | null;
          p_longitud: number | null;
          p_codigo_qr: string | null;
        };
        Returns: ReservationRpcRow[];
      };
      carwash_begin_payment: {
        Args: PaymentBeginRpcArgs;
        Returns: PaymentRpcRow[];
      };
      carwash_link_stripe_payment: {
        Args: {
          p_session_token: string;
          p_payment_id: string;
          p_payment_intent_id: string;
        };
        Returns: PaymentRpcRow[];
      };
      carwash_apply_stripe_payment_event: {
        Args: {
          p_payment_intent_id: string;
          p_event_id: string;
          p_stripe_status: StripePaymentEventStatus;
          p_amount_cents: number;
          p_currency: string;
        };
        Returns: PaymentRpcRow[];
      };
      carwash_process_sandbox_payment: {
        Args: PaymentProcessSandboxRpcArgs;
        Returns: PaymentRpcRow[];
      };
      carwash_get_payment: {
        Args: { p_session_token: string; p_payment_id: string };
        Returns: PaymentHistoryRpcRow[];
      };
      carwash_list_payments: {
        Args: { p_session_token: string };
        Returns: PaymentHistoryRpcRow[];
      };
      carwash_administrator_dashboard: {
        Args: { p_session_token: string };
        Returns: AdministratorDashboardRpcRow[];
      };
      carwash_administrator_list_autolavados: {
        Args: { p_session_token: string };
        Returns: AdministratorAutolavadoRpcRow[];
      };
      carwash_administrator_list_employees: {
        Args: { p_session_token: string };
        Returns: AdministratorEmployeeRpcRow[];
      };
      carwash_administrator_list_reservations: {
        Args: { p_session_token: string };
        Returns: AdministratorReservationRpcRow[];
      };
      carwash_administrator_list_services: {
        Args: { p_session_token: string };
        Returns: AdministratorServiceRpcRow[];
      };
      carwash_administrator_list_washing_spaces: {
        Args: { p_session_token: string };
        Returns: AdministratorWashingSpaceRpcRow[];
      };
      carwash_administrator_list_ratings: {
        Args: { p_session_token: string };
        Returns: AdministratorRatingRpcRow[];
      };
      carwash_administrator_update_reservation_status: {
        Args: { p_session_token: string; p_reservation_id: string; p_estado: ReservationStatus };
        Returns: AdministratorReservationStatusRpcRow[];
      };
      carwash_administrator_create_service: {
        Args: AdministratorServiceCreateRpcArgs;
        Returns: AdministratorServiceRpcRow[];
      };
      carwash_administrator_update_service: {
        Args: AdministratorServiceUpdateRpcArgs;
        Returns: AdministratorServiceRpcRow[];
      };
      carwash_administrator_delete_service: {
        Args: { p_session_token: string; p_servicio_id: string };
        Returns: boolean;
      };
      carwash_administrator_create_washing_space: {
        Args: AdministratorWashingSpaceCreateRpcArgs;
        Returns: AdministratorWashingSpaceRpcRow[];
      };
      carwash_administrator_update_washing_space: {
        Args: AdministratorWashingSpaceUpdateRpcArgs;
        Returns: AdministratorWashingSpaceRpcRow[];
      };
      carwash_administrator_delete_washing_space: {
        Args: { p_session_token: string; p_espacio_id: string };
        Returns: boolean;
      };
      carwash_create_calificacion: {
        Args: {
          p_session_token: string;
          p_reservation_id: string;
          p_puntuacion: number;
          p_comentario: string | null;
        };
        Returns: Array<{
          id: string;
          reservacion_id: string;
          autolavado_id: string;
          puntuacion: number;
          comentario: string | null;
          created_at: string;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

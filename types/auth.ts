import type { UserRole } from './database';

export interface AuthProfile {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  rol: UserRole;
}

export interface LoginCredentials {
  telefono: string;
  password: string;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; error?: string }
  | { status: 'signed-in'; profile: AuthProfile };

export interface RegistrationInput {
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  password: string;
}

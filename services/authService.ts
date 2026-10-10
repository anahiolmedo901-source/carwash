import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AuthProfile, LoginCredentials, RegistrationInput } from '../types/auth';
import type {
  AuthProfileRpcRow,
  AuthSessionRpcRow,
  Database,
  LoginSessionRpcRow,
  RegistrationRpcRow,
  UserRole,
} from '../types/database';
import { normalizePhoneNumber } from '../utils/authValidation';

export const SESSION_TOKEN_STORAGE_KEY = '@carwashnow/custom-session-token';

export interface AuthServiceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type AuthRpcClient = Pick<SupabaseClient<Database>, 'rpc'>;

const USER_ROLES: readonly UserRole[] = ['cliente', 'empleado', 'administrador'];

export interface AuthService {
  restoreSession(): Promise<AuthProfile | null>;
  signIn(credentials: LoginCredentials): Promise<AuthProfile>;
  register(input: RegistrationInput): Promise<AuthProfile>;
  signOut(): Promise<void>;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'An unexpected authentication error occurred.';
}

function profileFromRow(row: AuthProfileRpcRow | AuthSessionRpcRow): AuthProfile {
  if (!isUserRole(row.rol)) {
    throw new Error('Invalid authentication role.');
  }

  return {
    id: row.user_id,
    nombre: row.nombre,
    apellido: row.apellido,
    correo: row.correo,
    telefono: row.telefono,
    rol: row.rol,
  };
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

function firstRow<T>(data: T[] | null): T | null {
  return data?.[0] ?? null;
}

export function createAuthService(
  storage: AuthServiceStorage = AsyncStorage,
  client: AuthRpcClient = supabase,
): AuthService {
  return {
    async restoreSession() {
      const sessionToken = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
      if (!sessionToken) {
        return null;
      }

      const { data, error } = await client.rpc('carwash_restore_session', {
        p_session_token: sessionToken,
      });
      if (error) {
        throw new Error(getErrorMessage(error));
      }

      const row = firstRow(data);
      if (!row) {
        await storage.removeItem(SESSION_TOKEN_STORAGE_KEY);
        return null;
      }

      return profileFromRow(row);
    },

    async signIn(credentials: LoginCredentials) {
      const { data, error } = await client.rpc('carwash_login', {
        p_telefono: normalizePhoneNumber(credentials.telefono),
        p_password: credentials.password,
      });
      if (error) {
        throw new Error(getErrorMessage(error));
      }

      const row: LoginSessionRpcRow | null = firstRow(data);
      if (!row || !/^[0-9a-f]{64}$/i.test(row.session_token)) {
        throw new Error('Invalid phone or password.');
      }

      const profile = profileFromRow(row);

      try {
        await storage.setItem(SESSION_TOKEN_STORAGE_KEY, row.session_token);
      } catch (storageError) {
        try {
          await client.rpc('carwash_revoke_session', { p_session_token: row.session_token });
        } catch {
          // Session expiry remains the server-side cleanup boundary if best-effort revocation fails.
        }
        throw storageError;
      }

      return profile;
    },

    async register(input: RegistrationInput) {
      const { data, error } = await client.rpc('carwash_register', {
        p_nombre: input.nombre.trim(),
        p_apellido: input.apellido.trim(),
        p_correo: input.correo.trim().toLowerCase(),
        p_telefono: normalizePhoneNumber(input.telefono),
        p_password: input.password,
      });
      if (error) {
        throw new Error(getErrorMessage(error));
      }

      const row: RegistrationRpcRow | null = firstRow(data);
      if (!row) {
        throw new Error('Registration did not return a profile.');
      }

      const profile = profileFromRow(row);
      if (profile.rol !== 'cliente') {
        throw new Error('Invalid registration profile.');
      }

      return profile;
    },

    async signOut() {
      const sessionToken = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
      if (sessionToken) {
        const { error } = await client.rpc('carwash_revoke_session', {
          p_session_token: sessionToken,
        });
        if (error) {
          throw new Error(getErrorMessage(error));
        }
      }

      await storage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    },
  };
}

export const authService = createAuthService();

import type { AuthState } from '../types/auth';

export function getRouteForAuthState(state: AuthState): string | null {
  switch (state.status) {
    case 'loading':
      return null;
    case 'signed-out':
      return '/(auth)/login';
    case 'signed-in':
      switch (state.profile.rol) {
        case 'cliente':
          return '/(customer)/(tabs)';
        case 'empleado':
          return '/(employee)';
        case 'administrador':
          return '/(administrator)';
      }
  }
}

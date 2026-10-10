export interface RegistrationFormValues {
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  password: string;
  confirmPassword: string;
}

export interface LoginFormValues {
  telefono: string;
  password: string;
}

export type RegistrationErrors = Partial<Record<keyof RegistrationFormValues, string>>;
export type LoginErrors = Partial<Record<keyof LoginFormValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEPHONE_PATTERN = /^\+?[\d\s().-]+$/;

export function normalizePhoneNumber(telephone: string): string {
  return telephone.replace(/[\s().-]/g, '');
}

export function validateRegistration(values: RegistrationFormValues): RegistrationErrors {
  const errors: RegistrationErrors = {};
  const email = values.correo.trim();
  const telephone = values.telefono.trim();
  const telephoneDigits = telephone.replace(/\D/g, '').length;

  if (!values.nombre.trim()) {
    errors.nombre = 'Ingresa tu nombre.';
  }
  if (!values.apellido.trim()) {
    errors.apellido = 'Ingresa tu apellido.';
  }
  if (!email) {
    errors.correo = 'Ingresa tu correo electrónico.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.correo = 'Ingresa un correo electrónico válido.';
  }
  if (!telephone) {
    errors.telefono = 'Ingresa tu número de teléfono.';
  } else if (!TELEPHONE_PATTERN.test(telephone) || telephoneDigits < 7 || telephoneDigits > 15) {
    errors.telefono = 'Ingresa un número de teléfono válido con entre 7 y 15 dígitos.';
  }
  if (!values.password) {
    errors.password = 'Ingresa una contraseña.';
  } else if (
    values.password.length < 8 ||
    !/[a-z]/.test(values.password) ||
    !/[A-Z]/.test(values.password) ||
    !/\d/.test(values.password)
  ) {
    errors.password = 'Usa al menos 8 caracteres, incluyendo mayúsculas, minúsculas y un número.';
  }
  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirma tu contraseña.';
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return errors;
}

export function validateLogin(values: LoginFormValues): LoginErrors {
  const errors: LoginErrors = {};
  const telephone = values.telefono.trim();
  const telephoneDigits = telephone.replace(/\D/g, '').length;

  if (!telephone) {
    errors.telefono = 'Introduce tu teléfono.';
  } else if (!TELEPHONE_PATTERN.test(telephone) || telephoneDigits < 7 || telephoneDigits > 15) {
    errors.telefono = 'Introduce un teléfono válido.';
  }
  if (!values.password) {
    errors.password = 'Introduce tu contraseña.';
  }

  return errors;
}

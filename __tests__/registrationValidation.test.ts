import { validateLogin, validateRegistration } from '../utils/authValidation';
import {
  createTestEmail,
  createTestPhone,
  createTestPassword,
  createWeakTestPassword,
} from '../test-utils/testCredentials';

const validRegistration = {
  nombre: 'Ana',
  apellido: 'Pérez',
  correo: createTestEmail(),
  telefono: createTestPhone(),
  password: createTestPassword(),
  confirmPassword: '',
};
validRegistration.confirmPassword = validRegistration.password;

describe('registration validation', () => {
  it('accepts a complete registration with a strong matching password', () => {
    expect(validateRegistration(validRegistration)).toEqual({});
  });

  it('requires every registration value', () => {
    const errors = validateRegistration({
      nombre: '',
      apellido: '',
      correo: '',
      telefono: '',
      password: '',
      confirmPassword: '',
    });

    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining(['nombre', 'apellido', 'correo', 'telefono', 'password', 'confirmPassword']),
    );
  });

  it('rejects invalid email, telephone, weak password, and mismatched confirmation', () => {
    const errors = validateRegistration({
      ...validRegistration,
      correo: 'ana-at-example',
      telefono: '12 ab',
      password: createWeakTestPassword(),
      confirmPassword: createWeakTestPassword(),
    });

    expect(errors.correo).toBeTruthy();
    expect(errors.telefono).toBeTruthy();
    expect(errors.password).toBeTruthy();
    expect(errors.confirmPassword).toBeTruthy();
  });
});

describe('login validation', () => {
  it('requires a valid phone and password without applying registration strength rules', () => {
    expect(validateLogin({ telefono: createTestPhone(), password: createWeakTestPassword() })).toEqual({});
    expect(validateLogin({ telefono: 'bad-phone', password: '' })).toEqual({
      telefono: expect.any(String),
      password: expect.any(String),
    });
  });
});

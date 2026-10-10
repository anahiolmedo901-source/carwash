import { randomBytes, randomInt, randomUUID } from 'node:crypto';

export function createTestPassword(): string {
  let password = '';
  do {
    password = randomBytes(32).toString('base64url');
  } while (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password));
  return password;
}

export function createWeakTestPassword(): string {
  return randomBytes(32).toString('hex');
}

export function createTestPhone(): string {
  return `+${Array.from({ length: 11 }, () => randomInt(0, 10)).join('')}`;
}

export function createTestEmail(): string {
  return `${randomUUID()}@example.invalid`;
}

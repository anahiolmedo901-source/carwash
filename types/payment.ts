import {
  RESERVATION_STATUSES,
  type ReservationStatus,
} from './reservation';

export const PAYMENT_STATUSES = [
  'pendiente',
  'procesando',
  'pagado',
  'rechazado',
  'cancelado',
  'reembolsado',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  'tarjeta_credito',
  'tarjeta_debito',
  'mercado_pago',
  'efectivo',
  'otro',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_OUTCOMES = [
  'approved',
  'pending',
  'rejected',
  'cancelled',
  'refunded',
] as const;

export type PaymentOutcome = (typeof PAYMENT_OUTCOMES)[number];

export interface Payment {
  id: string;
  reservationId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  externalReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentReservationSummary {
  reservationId: string;
  reservationStatus: ReservationStatus;
  reservationDate: string;
  reservationTime: string;
  autolavadoId: string;
  autolavadoName: string;
  serviceId: string;
  serviceName: string;
}

export interface PaymentCheckoutInput {
  reservationId: string;
  method: PaymentMethod;
}

export type PaymentCheckoutRequest = PaymentCheckoutInput;

export interface PaymentCheckout {
  payment: Payment;
  reservation: PaymentReservationSummary;
}

export interface PaymentResult {
  payment: Payment;
  outcome: PaymentOutcome;
}

export interface StripePaymentIntentSession {
  payment: Payment;
  clientSecret: string;
  currency: string;
}

export interface PaymentHistoryItem {
  payment: Payment;
  reservation: PaymentReservationSummary;
}

export interface PaymentHistory {
  items: PaymentHistoryItem[];
}

export interface SandboxPaymentRequest {
  paymentId: string;
  amount: number;
  method: PaymentMethod;
}

export interface SandboxPaymentProviderResult {
  outcome: PaymentOutcome;
  reference: string;
}

export type PaymentProviderResult = SandboxPaymentProviderResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length
    && keys.join('|') === [...expectedKeys].sort().join('|');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string'
    && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string'
    && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isPaymentOutcome(value: unknown): value is PaymentOutcome {
  return typeof value === 'string'
    && (PAYMENT_OUTCOMES as readonly string[]).includes(value);
}

export function isSandboxPaymentRequest(value: unknown): value is SandboxPaymentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ['paymentId', 'amount', 'method'])) {
    return false;
  }
  return isNonEmptyString(value.paymentId)
    && isFiniteAmount(value.amount)
    && isPaymentMethod(value.method);
}

export function isSandboxPaymentProviderResult(
  value: unknown,
): value is SandboxPaymentProviderResult {
  if (!isRecord(value) || !hasExactKeys(value, ['outcome', 'reference'])) {
    return false;
  }
  return isPaymentOutcome(value.outcome) && isNonEmptyString(value.reference);
}

export function isPayment(value: unknown): value is Payment {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id',
    'reservationId',
    'amount',
    'method',
    'status',
    'externalReference',
    'paidAt',
    'createdAt',
  ])) {
    return false;
  }
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.reservationId)
    && isFiniteAmount(value.amount)
    && isPaymentMethod(value.method)
    && isPaymentStatus(value.status)
    && (value.externalReference === null || isNonEmptyString(value.externalReference))
    && (value.paidAt === null || isNonEmptyString(value.paidAt))
    && isNonEmptyString(value.createdAt);
}

function isPaymentReservationSummary(value: unknown): value is PaymentReservationSummary {
  if (!isRecord(value) || !hasExactKeys(value, [
    'reservationId',
    'reservationStatus',
    'reservationDate',
    'reservationTime',
    'autolavadoId',
    'autolavadoName',
    'serviceId',
    'serviceName',
  ])) {
    return false;
  }
  return isNonEmptyString(value.reservationId)
    && typeof value.reservationStatus === 'string'
    && (RESERVATION_STATUSES as readonly string[]).includes(value.reservationStatus)
    && isNonEmptyString(value.reservationDate)
    && isNonEmptyString(value.reservationTime)
    && isNonEmptyString(value.autolavadoId)
    && isNonEmptyString(value.autolavadoName)
    && isNonEmptyString(value.serviceId)
    && isNonEmptyString(value.serviceName);
}

export function isPaymentCheckout(value: unknown): value is PaymentCheckout {
  return isRecord(value)
    && hasExactKeys(value, ['payment', 'reservation'])
    && isPayment(value.payment)
    && isPaymentReservationSummary(value.reservation);
}

export function isPaymentResult(value: unknown): value is PaymentResult {
  return isRecord(value)
    && hasExactKeys(value, ['payment', 'outcome'])
    && isPayment(value.payment)
    && isPaymentOutcome(value.outcome);
}

export function isStripePaymentIntentSession(value: unknown): value is StripePaymentIntentSession {
  return isRecord(value)
    && hasExactKeys(value, ['payment', 'clientSecret', 'currency'])
    && isPayment(value.payment)
    && isNonEmptyString(value.clientSecret)
    && isNonEmptyString(value.currency);
}

export function isPaymentHistoryItem(value: unknown): value is PaymentHistoryItem {
  return isRecord(value)
    && hasExactKeys(value, ['payment', 'reservation'])
    && isPayment(value.payment)
    && isPaymentReservationSummary(value.reservation);
}

export function isPaymentHistory(value: unknown): value is PaymentHistory {
  return isRecord(value)
    && hasExactKeys(value, ['items'])
    && Array.isArray(value.items)
    && value.items.every(isPaymentHistoryItem);
}

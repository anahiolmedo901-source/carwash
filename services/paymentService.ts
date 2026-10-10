import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import {
  isPayment,
  isPaymentHistory,
  isPaymentHistoryItem,
  isPaymentMethod,
  isPaymentResult,
  isSandboxPaymentProviderResult,
  isStripePaymentIntentSession,
  type Payment,
  type PaymentCheckoutInput,
  type PaymentHistory,
  type PaymentHistoryItem,
  type PaymentResult,
  type StripePaymentIntentSession,
} from '../types/payment';
import {
  sandboxPaymentProvider,
  type PaymentProvider,
} from './paymentProvider';
import { SESSION_TOKEN_STORAGE_KEY, type AuthServiceStorage } from './authService';

type PaymentRpcClient = Pick<SupabaseClient<Database>, 'rpc' | 'functions'>;

export interface PaymentService {
  beginCheckout(input: PaymentCheckoutInput): Promise<Payment>;
  createStripePaymentIntent(reservationId: string): Promise<StripePaymentIntentSession>;
  processSandboxPayment(payment: Payment): Promise<PaymentResult>;
  checkout(input: PaymentCheckoutInput): Promise<PaymentResult>;
  getPayment(paymentId: string): Promise<Payment>;
  listPayments(): Promise<PaymentHistory>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'The payment request could not be completed.';
}

async function functionErrorMessage(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context && typeof context === 'object' && 'json' in context && typeof context.json === 'function') {
      try {
        const body = await (context as { json(): Promise<unknown> }).json();
        if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error.trim()) {
          return body.error;
        }
      } catch {
        // Fall back to the SDK error when the response body is unavailable.
      }
    }
  }
  return errorMessage(error);
}

function throwRpcError(error: unknown): never {
  throw new Error(errorMessage(error));
}

function requireReservationId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('A reservation id is required.');
  }
  return value.trim();
}

function requirePaymentId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('A payment id is required.');
  }
  return value.trim();
}

function normalizeCheckoutInput(input: PaymentCheckoutInput): PaymentCheckoutInput {
  const reservationId = requireReservationId(input?.reservationId);
  if (!isPaymentMethod(input?.method)) {
    throw new Error('The payment method is not allowed.');
  }
  return { reservationId, method: input.method };
}

function toAmount(value: unknown): number | null {
  const amount = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function mapPaymentRow(row: unknown): Payment {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('The payment response is invalid.');
  }

  const raw = row as Record<string, unknown>;
  const payment = {
    id: raw.id,
    reservationId: raw.reservacion_id,
    amount: toAmount(raw.monto),
    method: raw.metodo_pago,
    status: raw.estado,
    externalReference: raw.referencia_externa,
    paidAt: raw.fecha_pago,
    createdAt: raw.created_at,
  };

  if (!isPayment(payment)) {
    throw new Error('The payment response is invalid.');
  }
  return payment;
}

function mapPaymentResponse(data: unknown): Payment {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('The payment response is invalid.');
  }
  return mapPaymentRow(data[0]);
}

function requirePaymentForReservation(payment: Payment, reservationId: string): Payment {
  if (payment.reservationId !== reservationId) {
    throw new Error('The payment response does not belong to the reservation.');
  }
  return payment;
}

function mapPaymentHistoryRow(row: unknown): PaymentHistoryItem {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('The payment history response is invalid.');
  }

  const raw = row as Record<string, unknown>;
  let payment: Payment;
  try {
    payment = mapPaymentRow(row);
  } catch {
    throw new Error('The payment history response is invalid.');
  }

  const item = {
    payment,
    reservation: {
      reservationId: raw.reservacion_id,
      reservationStatus: raw.reservacion_estado,
      reservationDate: raw.reservacion_fecha,
      reservationTime: raw.reservacion_hora,
      autolavadoId: raw.autolavado_id,
      autolavadoName: raw.autolavado_nombre,
      serviceId: raw.servicio_id,
      serviceName: raw.servicio_nombre,
    },
  };

  if (!isPaymentHistoryItem(item)) {
    throw new Error('The payment history response is invalid.');
  }
  return item;
}

function mapPaymentHistoryResponse(data: unknown): PaymentHistory {
  if (!Array.isArray(data)) {
    throw new Error('The payment history response is invalid.');
  }

  const history = { items: data.map(mapPaymentHistoryRow) };
  if (!isPaymentHistory(history)) {
    throw new Error('The payment history response is invalid.');
  }
  return history;
}

export function createPaymentService(
  storage: AuthServiceStorage = AsyncStorage,
  client: PaymentRpcClient = supabase,
  provider: PaymentProvider = sandboxPaymentProvider,
): PaymentService {
  async function sessionToken(): Promise<string> {
    const token = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (!token) {
      throw new Error('Your session has expired. Sign in again.');
    }
    return token;
  }

  return {
    async createStripePaymentIntent(reservationId) {
      const id = requireReservationId(reservationId);
      const token = await sessionToken();
      const { data, error } = await client.functions.invoke('stripe-create-payment-intent', {
        body: { reservationId: id },
        headers: { 'x-carwash-session-token': token },
      });
      if (error) {
        throw new Error(await functionErrorMessage(error));
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('The Stripe payment response is invalid.');
      }
      const raw = data as Record<string, unknown>;
      const session = {
        payment: mapPaymentRow(raw.payment),
        clientSecret: raw.clientSecret,
        currency: raw.currency,
      };
      if (!isStripePaymentIntentSession(session)) {
        throw new Error('The Stripe payment response is invalid.');
      }
      requirePaymentForReservation(session.payment, id);
      return session;
    },

    async beginCheckout(input) {
      const checkoutInput = normalizeCheckoutInput(input);
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_begin_payment', {
        p_session_token: token,
        p_reservation_id: checkoutInput.reservationId,
        p_metodo_pago: checkoutInput.method,
      });
      if (error) {
        throwRpcError(error);
      }
      return requirePaymentForReservation(
        mapPaymentResponse(data),
        checkoutInput.reservationId,
      );
    },

    async processSandboxPayment(payment) {
      if (!isPayment(payment)) {
        throw new Error('The payment to process is invalid.');
      }

      const token = await sessionToken();
      let providerResult: unknown;
      try {
        providerResult = await provider.process({
          paymentId: payment.id,
          amount: payment.amount,
          method: payment.method,
        });
      } catch (error) {
        throw new Error(`The sandbox payment provider failed: ${errorMessage(error)}`);
      }

      if (!isSandboxPaymentProviderResult(providerResult)) {
        throw new Error('The sandbox payment provider returned an invalid result.');
      }

      const { data, error } = await client.rpc('carwash_process_sandbox_payment', {
        p_session_token: token,
        p_payment_id: payment.id,
        p_outcome: providerResult.outcome,
      });
      if (error) {
        throwRpcError(error);
      }

      const result = {
        payment: requirePaymentForReservation(mapPaymentResponse(data), payment.reservationId),
        outcome: providerResult.outcome,
      };
      if (!isPaymentResult(result)) {
        throw new Error('The payment result is invalid.');
      }
      return result;
    },

    async checkout(input) {
      const payment = await this.beginCheckout(input);
      return this.processSandboxPayment(payment);
    },

    async getPayment(paymentId) {
      const id = requirePaymentId(paymentId);
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_get_payment', {
        p_session_token: token,
        p_payment_id: id,
      });
      if (error) {
        throwRpcError(error);
      }
      return mapPaymentResponse(data);
    },

    async listPayments() {
      const token = await sessionToken();
      const { data, error } = await client.rpc('carwash_list_payments', {
        p_session_token: token,
      });
      if (error) {
        throwRpcError(error);
      }
      return mapPaymentHistoryResponse(data);
    },
  };
}

export const paymentService = createPaymentService();

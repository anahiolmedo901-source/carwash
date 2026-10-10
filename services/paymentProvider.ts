import {
  isPaymentOutcome,
  isSandboxPaymentRequest,
  type PaymentOutcome,
  type SandboxPaymentProviderResult,
  type SandboxPaymentRequest,
} from '../types/payment';

/**
 * Deterministic, sandbox-only boundary. A trusted provider can implement the
 * same contract later without changing payment services or route components.
 */
export interface SandboxPaymentProvider {
  process(request: SandboxPaymentRequest): Promise<SandboxPaymentProviderResult>;
}

export type PaymentProvider = SandboxPaymentProvider;

export type SandboxOutcomeResolver = (
  request: Readonly<SandboxPaymentRequest>,
) => PaymentOutcome;

export type SandboxReferenceFactory = (
  request: Readonly<SandboxPaymentRequest>,
  outcome: PaymentOutcome,
) => string;

export interface SandboxPaymentProviderOptions {
  outcome?: PaymentOutcome | SandboxOutcomeResolver;
  referenceFactory?: SandboxReferenceFactory;
}

function normalizeRequest(request: SandboxPaymentRequest): SandboxPaymentRequest {
  if (!isSandboxPaymentRequest(request)) {
    throw new Error('The sandbox payment request is invalid.');
  }
  return {
    paymentId: request.paymentId.trim(),
    amount: request.amount,
    method: request.method,
  };
}

export function createSandboxPaymentProvider(
  options: SandboxPaymentProviderOptions = {},
): SandboxPaymentProvider {
  const configuredOutcome = options.outcome ?? ((request: Readonly<SandboxPaymentRequest>) => (
    request.method === 'efectivo' || request.method === 'otro'
      ? 'pending'
      : 'approved'
  ));
  const referenceFactory = options.referenceFactory
    ?? ((request: Readonly<SandboxPaymentRequest>) => `sandbox-${request.paymentId}`);

  return {
    async process(request) {
      const normalizedRequest = normalizeRequest(request);
      const outcome = typeof configuredOutcome === 'function'
        ? configuredOutcome(normalizedRequest)
        : configuredOutcome;

      if (!isPaymentOutcome(outcome)) {
        throw new Error('The sandbox outcome is invalid.');
      }

      const reference = referenceFactory(normalizedRequest, outcome);
      if (typeof reference !== 'string' || reference.trim().length === 0) {
        throw new Error('The sandbox reference is invalid.');
      }

      return {
        outcome,
        reference: reference.trim(),
      };
    },
  };
}

export const sandboxPaymentProvider = createSandboxPaymentProvider();

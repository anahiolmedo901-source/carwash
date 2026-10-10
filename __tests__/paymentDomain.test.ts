import {
  PAYMENT_METHODS,
  PAYMENT_OUTCOMES,
  PAYMENT_STATUSES,
  isPaymentMethod,
  isPaymentOutcome,
  isPaymentStatus,
  isSandboxPaymentProviderResult,
} from '../types/payment';

describe('payment domain contract', () => {
  it('exposes the exact payment statuses and methods', () => {
    expect(PAYMENT_STATUSES).toEqual([
      'pendiente',
      'procesando',
      'pagado',
      'rechazado',
      'cancelado',
      'reembolsado',
    ]);
    expect(PAYMENT_METHODS).toEqual([
      'tarjeta_credito',
      'tarjeta_debito',
      'mercado_pago',
      'efectivo',
      'otro',
    ]);
    expect(PAYMENT_OUTCOMES).toEqual([
      'approved',
      'pending',
      'rejected',
      'cancelled',
      'refunded',
    ]);
  });

  it('rejects values outside each exact runtime union', () => {
    expect(isPaymentStatus('pagado')).toBe(true);
    expect(isPaymentStatus('paid')).toBe(false);
    expect(isPaymentMethod('mercado_pago')).toBe(true);
    expect(isPaymentMethod('paypal')).toBe(false);
    expect(isPaymentOutcome('approved')).toBe(true);
    expect(isPaymentOutcome('processing')).toBe(false);
  });

  it('accepts only the normalized provider result shape', () => {
    expect(isSandboxPaymentProviderResult({
      outcome: 'approved',
      reference: 'sandbox-payment-1',
    })).toBe(true);
    expect(isSandboxPaymentProviderResult({
      outcome: 'approved',
      reference: 'sandbox-payment-1',
      amount: 250,
    })).toBe(false);
    expect(isSandboxPaymentProviderResult({ outcome: 'approved', reference: '' })).toBe(false);
    expect(isSandboxPaymentProviderResult(null)).toBe(false);
  });
});

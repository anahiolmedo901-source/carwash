import {
  createSandboxPaymentProvider,
  type SandboxPaymentProvider,
} from '../services/paymentProvider';

const REQUEST = {
  paymentId: 'payment-1',
  amount: 250,
  method: 'tarjeta_credito' as const,
};

describe('deterministic sandbox payment provider', () => {
  it('returns only a normalized approved outcome and deterministic opaque reference', async () => {
    const provider: SandboxPaymentProvider = createSandboxPaymentProvider();

    await expect(provider.process(REQUEST)).resolves.toEqual({
      outcome: 'approved',
      reference: 'sandbox-payment-1',
    });
  });

  it('does not auto-confirm offline methods in the sandbox', async () => {
    const provider = createSandboxPaymentProvider();

    await expect(provider.process({ ...REQUEST, method: 'efectivo' })).resolves.toEqual({
      outcome: 'pending',
      reference: 'sandbox-payment-1',
    });
  });

  it('injects an outcome and reference strategy without network calls', async () => {
    const received: unknown[] = [];
    const provider = createSandboxPaymentProvider({
      outcome: (request) => {
        received.push(request);
        return request.method === 'efectivo' ? 'pending' : 'rejected';
      },
      referenceFactory: (request, outcome) => `test-${request.paymentId}-${outcome}`,
    });

    await expect(provider.process({ ...REQUEST, method: 'efectivo' })).resolves.toEqual({
      outcome: 'pending',
      reference: 'test-payment-1-pending',
    });
    expect(received).toEqual([{ ...REQUEST, method: 'efectivo' }]);
  });

  it('rejects a provider strategy that returns an unsupported outcome or reference', async () => {
    const invalidOutcome = createSandboxPaymentProvider({ outcome: () => 'processing' as never });
    await expect(invalidOutcome.process(REQUEST)).rejects.toThrow('sandbox outcome');

    const invalidReference = createSandboxPaymentProvider({ referenceFactory: () => '  ' });
    await expect(invalidReference.process(REQUEST)).rejects.toThrow('sandbox reference');
  });
});

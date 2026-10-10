import { getStripePublishableKey, hasStripePublishableKey } from '../lib/stripe';

describe('Stripe configuration', () => {
  it('accepts test and live publishable keys', () => {
    expect(getStripePublishableKey({
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_51abc123',
    })).toBe('pk_test_51abc123');
    expect(hasStripePublishableKey({
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_51abc123',
    })).toBe(true);
  });

  it('rejects missing, secret, and malformed keys', () => {
    for (const value of [undefined, 'sk_test_51abc123', 'pk_test_']) {
      expect(hasStripePublishableKey({ EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: value })).toBe(false);
    }
  });
});

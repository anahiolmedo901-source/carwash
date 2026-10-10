process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }) => React.createElement(Text, { accessibilityLabel: name }, name),
  };
});

jest.mock('@stripe/stripe-react-native', () => ({
  PaymentSheetError: { Canceled: 'Canceled' },
  StripeProvider: ({ children }) => children,
  useStripe: () => ({
    handleURLCallback: jest.fn().mockResolvedValue(false),
    initPaymentSheet: jest.fn().mockResolvedValue({ error: undefined }),
    presentPaymentSheet: jest.fn().mockResolvedValue({ error: undefined }),
  }),
}));

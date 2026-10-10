import React from 'react';
import { render } from '@testing-library/react-native';
import CustomerTabsLayout from '../app/(customer)/(tabs)/_layout';

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  const MockTabScreen = ({ name, options }: { name: string; options: { title: string } }) =>
    React.createElement(
      Text,
      { testID: 'customer-tab', accessibilityLabel: `${name}:${options.title}` },
      options.title,
    );
  const MockTabs = Object.assign(
    ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    { Screen: MockTabScreen },
  );

  return { Tabs: MockTabs };
});

describe('customer tab navigation', () => {
  it('exposes the five requested destinations in order', () => {
    const view = render(<CustomerTabsLayout />);
    const tabs = view.getAllByTestId('customer-tab');

    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      'index:Inicio',
      'autolavados:Autolavados',
      'reservaciones:Reservaciones',
      'vehiculos:Vehículos',
      'profile:Perfil',
    ]);
  });
});

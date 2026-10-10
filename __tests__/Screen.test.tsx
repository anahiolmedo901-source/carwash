import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Screen } from '../components/Screen';

describe('Screen keyboard handling', () => {
  it('resizes and keeps the form scrollable while the keyboard is open', () => {
    const view = render(
      <Screen>
        <Text>Contenido del formulario</Text>
      </Screen>,
    );

    const keyboardAvoidingView = view.UNSAFE_getByType(KeyboardAvoidingView);
    const scrollView = view.UNSAFE_getByType(ScrollView);

    expect(keyboardAvoidingView.props.behavior).toBe(Platform.OS === 'ios' ? 'padding' : 'height');
    expect(keyboardAvoidingView.props.keyboardVerticalOffset).toBe(0);
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scrollView.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
  });
});

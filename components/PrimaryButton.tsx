import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii, shadows, spacing } from '../constants/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
}

export function PrimaryButton({ label, onPress, disabled = false, loading = false, variant = 'primary' }: PrimaryButtonProps) {
  const unavailable = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !unavailable && (variant === 'primary' || variant === 'danger' ? styles.pressed : styles.pressedSecondary),
        unavailable && styles.disabled,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.surface : colors.primary} /> : (
        <Text style={[styles.label, variant === 'primary' || variant === 'danger' ? styles.labelLight : styles.labelDark]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    ...shadows.card,
    shadowOpacity: 0.12,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowOpacity: 0.04 },
  quiet: { backgroundColor: colors.softBlue, shadowOpacity: 0 },
  danger: { backgroundColor: colors.danger },
  pressed: {
    backgroundColor: colors.primaryDark,
  },
  pressedSecondary: {
    backgroundColor: colors.softBlue,
    borderColor: colors.primary,
  },
  disabled: {
    opacity: 0.65,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
  labelLight: { color: colors.surface },
  labelDark: { color: colors.primaryDark },
});

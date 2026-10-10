import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '../constants/theme';

interface BackButtonProps {
  label?: string;
  accessibilityLabel?: string;
  fallback?: string;
  onPress?: () => void;
}

export function BackButton({
  label = 'Volver',
  accessibilityLabel = 'Volver',
  fallback = '/',
  onPress,
}: BackButtonProps) {
  const goBack = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (typeof router.canGoBack !== 'function' || router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback as never);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={goBack}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="arrow-back" size={20} color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    minHeight: 42,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  pressed: { backgroundColor: colors.softBlue },
  arrow: { color: colors.primary, fontSize: 21, lineHeight: 22, fontWeight: '700' },
  label: { color: colors.primary, fontSize: 15, fontWeight: '700' },
});

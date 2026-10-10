import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../constants/theme';

interface AuthNoticeProps {
  message: string | null;
  onDismiss(): void;
}

export function AuthNotice({ message, onDismiss }: AuthNoticeProps) {
  if (!message) {
    return null;
  }

  return (
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.notice}>
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso" onPress={onDismiss}>
          <Text style={styles.dismiss}>Cerrar</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.softBlue,
    elevation: 4,
  },
  message: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  dismiss: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});

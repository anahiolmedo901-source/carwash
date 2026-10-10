import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from './Screen';
import { colors, spacing } from '../constants/theme';

interface InformationalPlaceholderProps {
  title: string;
  description: string;
}

export function InformationalPlaceholder({ title, description }: InformationalPlaceholderProps) {
  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
});

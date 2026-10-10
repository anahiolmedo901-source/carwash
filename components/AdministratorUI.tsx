import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BackButton } from './BackButton';
import { colors, spacing } from '../constants/theme';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function getAdministratorErrorMessage(error: unknown, fallback: string): string {
  return getUserFacingErrorMessage(error, fallback);
}

export function formatAdministratorCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

interface AdministratorPageHeaderProps {
  title: string;
  subtitle: string;
  onBack(): void;
  eyebrow?: string;
}

export function AdministratorPageHeader({
  title,
  subtitle,
  onBack,
  eyebrow = 'CENTRO DE OPERACIONES',
}: AdministratorPageHeaderProps) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderTop}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        </View>
        <BackButton label="Panel" accessibilityLabel="Volver al panel" onPress={onBack} />
      </View>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSubtitle}>{subtitle}</Text>
    </View>
  );
}

type AdministratorStatusTone = 'positive' | 'warning' | 'danger' | 'neutral' | 'info';

export function AdministratorStatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: AdministratorStatusTone;
}) {
  return (
    <View style={[styles.statusBadge, styles[`statusBadge_${tone}`]]}>
      <Text style={[styles.statusBadgeText, styles[`statusBadgeText_${tone}`]]}>{label}</Text>
    </View>
  );
}

interface SecondaryButtonProps {
  label: string;
  onPress(): void;
  disabled?: boolean;
}

export function AdministratorSecondaryButton({ label, onPress, disabled = false }: SecondaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

interface DestructiveButtonProps extends SecondaryButtonProps {}

export function AdministratorDestructiveButton({ label, onPress, disabled = false }: DestructiveButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.destructiveButton, pressed && !disabled && styles.destructivePressed, disabled && styles.disabled]}
    >
      <Text style={styles.destructiveButtonText}>{label}</Text>
    </Pressable>
  );
}

interface ChoiceButtonProps {
  label: string;
  selected: boolean;
  onPress(): void;
  disabled?: boolean;
}

export function AdministratorChoiceButton({ label, selected, onPress, disabled = false }: ChoiceButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceButton,
        selected && styles.choiceButtonSelected,
        pressed && !disabled && styles.choiceButtonPressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.choiceButtonText, selected && styles.choiceButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  secondaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.softBlue },
  disabled: { opacity: 0.55 },
  secondaryButtonText: { color: colors.primary, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  destructiveButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  destructivePressed: { backgroundColor: '#FDECEC' },
  destructiveButtonText: { color: colors.danger, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  choiceButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  choiceButtonSelected: { backgroundColor: colors.primary },
  choiceButtonPressed: { opacity: 0.8 },
  choiceButtonText: { color: colors.text, fontSize: 14 },
  choiceButtonTextSelected: { color: colors.surface, fontWeight: '700' },
  pageHeader: { gap: spacing.sm },
  pageHeaderTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, flex: 1 },
  eyebrowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.1 },
  pageTitle: { color: colors.navy, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  pageSubtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, maxWidth: 720 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 999 },
  statusBadgeText: { fontSize: 12, fontWeight: '800' },
  statusBadge_positive: { backgroundColor: colors.successSoft },
  statusBadge_warning: { backgroundColor: colors.warningSoft },
  statusBadge_danger: { backgroundColor: colors.dangerSoft },
  statusBadge_neutral: { backgroundColor: colors.surfaceSubtle },
  statusBadge_info: { backgroundColor: colors.softBlue },
  statusBadgeText_positive: { color: colors.success },
  statusBadgeText_warning: { color: colors.warning },
  statusBadgeText_danger: { color: colors.danger },
  statusBadgeText_neutral: { color: colors.muted },
  statusBadgeText_info: { color: colors.primary },
});

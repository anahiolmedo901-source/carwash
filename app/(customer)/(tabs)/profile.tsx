import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { Screen } from '../../../components/Screen';
import { colors, radii, shadows, spacing } from '../../../constants/theme';
import { useAuth } from '../../../context/AuthContext';
import { useSignOutFeedback } from '../../../hooks/useSignOutFeedback';

export default function CustomerProfileRoute() {
  const { state, signOut } = useAuth();
  const { leaveAccount } = useSignOutFeedback(signOut);

  if (state.status !== 'signed-in') {
    return null;
  }

  return (
    <Screen>
      <View style={styles.card}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{state.profile.nombre.charAt(0).toUpperCase()}</Text></View>
          <View style={styles.profileCopy}>
            <Text style={styles.kicker}>MI CUENTA</Text>
            <Text style={styles.title}>Tu perfil</Text>
            <Text style={styles.name}>{`${state.profile.nombre} ${state.profile.apellido}`}</Text>
          </View>
          <View style={styles.rolePill}><Text style={styles.roleText}>CLIENTE</Text></View>
        </View>
        <View style={styles.contactBlock}>
          <Text style={styles.detail}>{state.profile.correo}</Text>
          <Text style={styles.detail}>{state.profile.telefono}</Text>
        </View>
        <View style={styles.menuBlock}>
          <Text style={styles.menuKicker}>ACCESOS</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver historial de pagos"
            onPress={() => router.push('/pagos')}
            style={({ pressed }) => [styles.historyButton, pressed && styles.historyButtonPressed]}
          >
            <View><Text style={styles.historyButtonText}>Historial de pagos</Text><Text style={styles.historyButtonSubtext}>Consulta tus pagos y estados</Text></View>
             <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>
        <PrimaryButton label="Cerrar sesión" onPress={leaveAccount} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    ...shadows.card,
    shadowOpacity: 0.06,
  },
  profileHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  avatar: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.primary },
  avatarText: { color: colors.surface, fontSize: 25, fontWeight: '900' },
  profileCopy: { flex: 1, gap: 2 },
  kicker: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  rolePill: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.successSoft },
  roleText: { color: colors.success, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  contactBlock: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  detail: {
    color: colors.muted,
    fontSize: 15,
  },
  menuBlock: { gap: spacing.sm },
  menuKicker: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  historyButton: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  historyButtonPressed: { backgroundColor: colors.softBlue, borderColor: colors.primary },
  historyButtonText: { color: colors.navy,
    fontSize: 15,
    fontWeight: '700',
  },
  historyButtonSubtext: { color: colors.muted, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.primary, fontSize: 20, fontWeight: '700' },
});

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../../../components/Screen';
import { useAuth } from '../../../context/AuthContext';
import { colors, radii, shadows, spacing } from '../../../constants/theme';

export default function CustomerHomeRoute() {
  const { state } = useAuth();
  const firstName = state.status === 'signed-in' ? state.profile.nombre : 'cliente';

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}><Text style={styles.brandInitial}>C</Text></View>
              <View>
                <Text style={styles.brand}>CARWASHNOW</Text>
                <Text style={styles.brandSubline}>CUIDADO QUE SE NOTA</Text>
              </View>
            </View>
            <View style={styles.statusPill}><View style={styles.statusDot} /><Text style={styles.statusText}>CLIENTE</Text></View>
          </View>
          <Text style={styles.eyebrow}>HOLA, {firstName.toUpperCase()}</Text>
          <Text style={styles.title}>Tu auto limpio, sin perder el día.</Text>
          <Text style={styles.description}>Encuentra un autolavado, reserva tu espacio y sigue el servicio desde tu celular.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explorar autolavados"
            onPress={() => router.push('/autolavados')}
            style={({ pressed }) => [styles.heroButton, pressed && styles.heroButtonPressed]}
          >
            <Text style={styles.heroButtonText}>Explorar autolavados</Text>
            <Ionicons name="arrow-forward" size={22} color={colors.navy} />
          </Pressable>
          <View style={styles.heroFooter}>
            <View><Text style={styles.heroStatValue}>01</Text><Text style={styles.heroStatLabel}>elige tu lugar</Text></View>
            <View><Text style={styles.heroStatValue}>02</Text><Text style={styles.heroStatLabel}>reserva tu hora</Text></View>
            <View><Text style={styles.heroStatValue}>03</Text><Text style={styles.heroStatLabel}>llega y disfruta</Text></View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionKicker}>PARA EMPEZAR</Text>
            <Text style={styles.sectionTitle}>¿Qué necesitas hoy?</Text>
          </View>
          <Text style={styles.sectionHint}>Accesos rápidos</Text>
        </View>

        <View style={styles.actionGrid}>
          <ActionTile title="Buscar autolavado" description="Compara servicios y horarios" accent={colors.primary} onPress={() => router.push('/autolavados')} />
          <ActionTile title="Mi vehículo" description="Ten tus datos listos para reservar" accent={colors.accent} onPress={() => router.push('/vehiculos')} />
          <ActionTile title="Mis reservaciones" description="Revisa estados y próximos turnos" accent={colors.success} onPress={() => router.push('/reservaciones')} />
          <ActionTile title="Diagnóstico" description="Comprueba cámara y ubicación" accent={colors.primaryDark} onPress={() => router.push('/diagnostico')} />
        </View>

        <View style={styles.infoCard}>
           <View style={styles.infoIcon}><Ionicons name="information" size={18} color={colors.navy} /></View>
          <View style={styles.infoCopy}>
            <Text style={styles.infoTitle}>Tu visita, más simple</Text>
            <Text style={styles.infoText}>Registra al menos un vehículo para que tu próxima reservación sea más rápida.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Ver mis vehículos" onPress={() => router.push('/vehiculos')}>
            <Text style={styles.infoLink}>Ver</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function ActionTile({
  title,
  description,
  accent,
  onPress,
}: {
  title: string;
  description: string;
  accent: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, pressed && styles.actionTilePressed]}
    >
      <View style={[styles.actionMarker, { backgroundColor: accent }]} />
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionDescription}>{description}</Text>
       <Ionicons name="arrow-forward" size={20} color={accent} style={styles.actionArrow} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  hero: {
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.navy,
    ...shadows.card,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  brandMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primary },
  brandInitial: { color: colors.surface, fontSize: 23, fontWeight: '900' },
  brand: { color: colors.surface, fontSize: 13, fontWeight: '900', letterSpacing: 1.3 },
  brandSubline: { color: '#9AC9D0', fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginTop: 2 },
  statusPill: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: '#214658' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#64D29B' },
  statusText: { color: '#CBE9E6', fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  eyebrow: { color: '#8CBBC5', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginTop: spacing.md },
  title: {
    color: colors.surface,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.7,
    lineHeight: 35,
  },
  description: {
    color: '#C4DCE1',
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 480,
  },
  heroButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: colors.accent, marginTop: spacing.sm },
  heroButtonPressed: { backgroundColor: '#D7972D' },
  heroButtonText: { color: colors.navy, fontSize: 16, fontWeight: '800' },
  heroButtonArrow: { color: colors.navy, fontSize: 24, fontWeight: '500' },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.sm },
  heroStatValue: { color: colors.surface, fontSize: 17, fontWeight: '800' },
  heroStatLabel: { color: '#9BBAC4', fontSize: 11, marginTop: 2 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  sectionKicker: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 3 },
  sectionTitle: { color: colors.navy, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  sectionHint: { color: colors.muted, fontSize: 12, fontWeight: '600', paddingBottom: 2 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionTile: { flexGrow: 1, flexBasis: '46%', minWidth: 145, minHeight: 142, justifyContent: 'space-between', padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, ...shadows.card, shadowOpacity: 0.045 },
  actionTilePressed: { borderColor: colors.primary, backgroundColor: colors.softBlue, transform: [{ scale: 0.985 }] },
  actionMarker: { width: 10, height: 10, borderRadius: 5, marginBottom: spacing.sm },
  actionTitle: { color: colors.navy, fontSize: 16, fontWeight: '800', lineHeight: 20 },
  actionDescription: { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
  actionArrow: { alignSelf: 'flex-end', fontSize: 20, fontWeight: '700', marginTop: spacing.sm },
  infoCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  infoIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.accent },
  infoIconText: { color: colors.navy, fontSize: 18, fontWeight: '900' },
  infoCopy: { flex: 1, gap: 2 },
  infoTitle: { color: colors.navy, fontSize: 14, fontWeight: '800' },
  infoText: { color: colors.inkSoft, fontSize: 12, lineHeight: 17 },
  infoLink: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
});

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { colors, spacing } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { getRouteForAuthState } from '../utils/authRouting';

export default function IndexRoute() {
  const { state } = useAuth();
  const route = getRouteForAuthState(state);

  if (route) {
    return <Redirect href={route as never} />;
  }

  return (
    <View style={styles.loading}>
      <View style={styles.logo}><Text style={styles.logoLetter}>C</Text></View>
      <Text style={styles.brand}>CARWASHNOW</Text>
      <Text style={styles.tagline}>CUIDADO QUE SE NOTA</Text>
      <ActivityIndicator color={colors.primary} size="small" />
      <Text style={styles.label}>Verificando la sesión…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  logo: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.primary },
  logoLetter: { color: colors.surface, fontSize: 37, fontWeight: '900' },
  brand: { color: colors.navy, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  tagline: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginTop: -spacing.sm },
  label: {
    color: colors.muted,
    fontSize: 15,
  },
});

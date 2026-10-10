import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { colors } from '../../../constants/theme';

export default function CustomerTabsLayout() {
  const { width } = useWindowDimensions();
  const insets = React.useContext(SafeAreaInsetsContext) ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const compact = width < 440;
  const wide = width >= 900;
  const bottomPadding = Math.max(insets.bottom, 8);
  const tabBarHeight = 64 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: colors.softBlue,
        tabBarStyle: [
          styles.tabBar,
          { height: tabBarHeight, paddingBottom: bottomPadding },
          wide && styles.tabBarWide,
        ],
        tabBarLabelStyle: [styles.tabBarLabel, compact && styles.tabBarLabelCompact],
        tabBarItemStyle: [styles.tabBarItem, compact && styles.tabBarItemCompact, wide && styles.tabBarItemWide],
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarAccessibilityLabel: 'Inicio',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="autolavados"
        options={{
          title: compact ? 'Buscar' : 'Autolavados',
          tabBarAccessibilityLabel: 'Buscar autolavados',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reservaciones"
        options={{
          title: compact ? 'Turnos' : 'Reservaciones',
          tabBarAccessibilityLabel: 'Mis reservaciones',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="vehiculos"
        options={{
          title: compact ? 'Autos' : 'Vehículos',
          tabBarAccessibilityLabel: 'Mis vehículos',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'car' : 'car-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarAccessibilityLabel: 'Mi perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingTop: 6,
    paddingHorizontal: 3,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabBarWide: {
    alignSelf: 'center',
    maxWidth: 1180,
    paddingHorizontal: 20,
  },
  tabBarLabel: { fontSize: 11, fontWeight: '700' },
  tabBarLabelCompact: { fontSize: 10 },
  tabBarItem: { borderRadius: 14, marginHorizontal: 2 },
  tabBarItemCompact: { marginHorizontal: 0 },
  tabBarItemWide: { marginHorizontal: 8 },
});

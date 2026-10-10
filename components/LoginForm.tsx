import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadows, spacing } from '../constants/theme';
import type { LoginCredentials } from '../types/auth';
import type { LoginErrors } from '../utils/authValidation';
import { validateLogin } from '../utils/authValidation';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import { FormSurface } from './FormSurface';
import { PrimaryButton } from './PrimaryButton';
import { Screen } from './Screen';
import { TextField } from './TextField';

interface LoginFormProps {
  onSubmit(credentials: LoginCredentials): Promise<void>;
  onAuthenticated(): void;
  onRegister(): void;
  initialError?: string;
}

export function LoginForm({ onSubmit, onAuthenticated, onRegister, initialError }: LoginFormProps) {
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState(initialError ?? '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const validationErrors = validateLogin({ telefono, password });
    setErrors(validationErrors);
    setFormError('');
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const credentials = { telefono: telefono.trim(), password };
    setSubmitting(true);
    setTelefono('');
    setPassword('');
    try {
      await onSubmit(credentials);
      onAuthenticated();
    } catch (error) {
      setFormError(getUserFacingErrorMessage(error, 'No se pudo iniciar sesión. Inténtalo de nuevo.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen centered>
      <View style={styles.card}>
        <View style={styles.brandMark}>
          <Text style={styles.brandInitial}>C</Text>
        </View>
        <Text style={styles.brand}>CarWashNow</Text>
        <Text style={styles.eyebrow}>TODO LISTO PARA TU PRÓXIMA VISITA</Text>
        <Text style={styles.title}>Bienvenido de nuevo</Text>
        <Text style={styles.subtitle}>
          Ingresa con el teléfono y la contraseña asociados a tu cuenta.
        </Text>
        <FormSurface onSubmit={() => void submit()}>
          <TextField
            autoCapitalize="none"
            autoComplete="tel"
            error={errors.telefono}
            keyboardType="phone-pad"
            label="Teléfono"
            onChangeText={setTelefono}
            placeholder="+54 11 1234 5678"
            textContentType="telephoneNumber"
            value={telefono}
          />
          <TextField
            autoCapitalize="none"
            autoComplete="password"
            error={errors.password}
            label="Contraseña"
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            value={password}
          />
          {formError ? <Text accessibilityRole="alert" style={styles.error}>{formError}</Text> : null}
          <PrimaryButton label="Iniciar sesión" loading={submitting} onPress={() => void submit()} />
        </FormSurface>
        <View style={styles.footer}>
          <Text style={styles.footerText}>¿No tienes una cuenta?</Text>
          <Pressable accessibilityRole="button" onPress={onRegister}>
            <Text style={styles.link}>Crear una</Text>
          </Pressable>
        </View>
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
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softBlue,
  },
  brandInitial: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '800',
  },
  brand: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: -spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  footerText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});

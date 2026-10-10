import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RegistrationInput } from '../types/auth';
import type { RegistrationErrors, RegistrationFormValues } from '../utils/authValidation';
import { validateRegistration } from '../utils/authValidation';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import { colors, radii, shadows, spacing } from '../constants/theme';
import { FormSurface } from './FormSurface';
import { PrimaryButton } from './PrimaryButton';
import { Screen } from './Screen';
import { TextField } from './TextField';

interface RegistrationFormProps {
  onSubmit(input: RegistrationInput): Promise<void>;
  onSignIn(): void;
}

const INITIAL_VALUES: RegistrationFormValues = {
  nombre: '',
  apellido: '',
  correo: '',
  telefono: '',
  password: '',
  confirmPassword: '',
};

export function RegistrationForm({ onSubmit, onSignIn }: RegistrationFormProps) {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field: keyof RegistrationFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  };

  const submit = async () => {
    const validationErrors = validateRegistration(values);
    setErrors(validationErrors);
    setFormError('');
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const input: RegistrationInput = {
      nombre: values.nombre.trim(),
      apellido: values.apellido.trim(),
      correo: values.correo.trim(),
      telefono: values.telefono.trim(),
      password: values.password,
    };

    setSubmitting(true);
    try {
      await onSubmit(input);
      onSignIn();
    } catch (error) {
      setFormError(getUserFacingErrorMessage(error, 'No se pudo crear la cuenta. Inténtalo de nuevo.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.card}>
        <View style={styles.brandMark}><Text style={styles.brandInitial}>C</Text></View>
        <Text style={styles.brand}>CarWashNow</Text>
        <Text style={styles.eyebrow}>EMPIEZA EN MENOS DE UN MINUTO</Text>
        <Text style={styles.title}>Crea tu cuenta</Text>
        <Text style={styles.subtitle}>Ingresa tus datos para comenzar.</Text>
        <FormSurface onSubmit={() => void submit()}>
          <TextField
            autoComplete="name"
            error={errors.nombre}
            label="Nombre"
            onChangeText={(value) => updateField('nombre', value)}
            placeholder="Tu nombre"
            textContentType="name"
            value={values.nombre}
          />
          <TextField
            autoComplete="name"
            error={errors.apellido}
            label="Apellido"
            onChangeText={(value) => updateField('apellido', value)}
            placeholder="Tu apellido"
            textContentType="name"
            value={values.apellido}
          />
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            error={errors.correo}
            keyboardType="email-address"
            label="Correo electrónico"
            onChangeText={(value) => updateField('correo', value)}
            placeholder="nombre@ejemplo.com"
            textContentType="emailAddress"
            value={values.correo}
          />
          <TextField
            autoComplete="tel"
            error={errors.telefono}
            keyboardType="phone-pad"
            label="Teléfono"
            onChangeText={(value) => updateField('telefono', value)}
            placeholder="+1 555 234 5678"
            textContentType="telephoneNumber"
            value={values.telefono}
          />
          <TextField
            autoCapitalize="none"
            autoComplete="new-password"
            error={errors.password}
            label="Contraseña"
            onChangeText={(value) => updateField('password', value)}
            secureTextEntry
            textContentType="newPassword"
            helperText="Mínimo 8 caracteres, con mayúscula, minúscula y número."
            value={values.password}
          />
          <TextField
            autoCapitalize="none"
            autoComplete="new-password"
            error={errors.confirmPassword}
            label="Confirmar contraseña"
            onChangeText={(value) => updateField('confirmPassword', value)}
            secureTextEntry
            textContentType="newPassword"
            value={values.confirmPassword}
          />
          {formError ? <Text accessibilityRole="alert" style={styles.error}>{formError}</Text> : null}
          <PrimaryButton label="Crear cuenta" loading={submitting} onPress={() => void submit()} />
        </FormSurface>
        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes una cuenta?</Text>
          <Pressable accessibilityRole="button" onPress={onSignIn}>
            <Text style={styles.link}>Iniciar sesión</Text>
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
  brandMark: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.softBlue },
  brandInitial: { color: colors.primary, fontSize: 24, fontWeight: '900' },
  brand: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: -spacing.xs },
  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  footerText: {
    color: colors.muted,
    fontSize: 14,
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});

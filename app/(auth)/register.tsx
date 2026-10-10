import React from 'react';
import { router } from 'expo-router';
import { RegistrationForm } from '../../components/RegistrationForm';
import { useAuth } from '../../context/AuthContext';

export default function RegisterRoute() {
  const { register } = useAuth();

  return (
    <RegistrationForm
      onSignIn={() => router.replace('/(auth)/login')}
      onSubmit={register}
    />
  );
}

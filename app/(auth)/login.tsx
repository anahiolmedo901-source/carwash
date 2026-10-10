import React from 'react';
import { router } from 'expo-router';
import { LoginForm } from '../../components/LoginForm';
import { useAuth } from '../../context/AuthContext';

export default function LoginRoute() {
  const { signIn, state } = useAuth();

  return (
    <LoginForm
      initialError={state.status === 'signed-out' ? state.error : undefined}
      onAuthenticated={() => router.replace('/')}
      onRegister={() => router.push('/(auth)/register')}
      onSubmit={signIn}
    />
  );
}

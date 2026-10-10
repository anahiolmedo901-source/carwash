import React from 'react';
import AdministratorDashboard from '../../components/AdministratorDashboard';
import { useAuth } from '../../context/AuthContext';
import { useSignOutFeedback } from '../../hooks/useSignOutFeedback';
import type { AdministratorService } from '../../types/administrator';

interface AdministratorRouteProps {
  service?: AdministratorService;
}

export default function AdministratorRoute({ service }: AdministratorRouteProps) {
  const { state, signOut } = useAuth();
  const administratorName = state.status === 'signed-in'
    ? `${state.profile.nombre} ${state.profile.apellido}`
    : 'Administrador';
  const { leaveAccount } = useSignOutFeedback(signOut);

  return <AdministratorDashboard administratorName={administratorName} onSignOut={leaveAccount} service={service} />;
}

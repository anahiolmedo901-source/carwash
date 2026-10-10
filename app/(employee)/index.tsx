import React from 'react';
import { RolePlaceholder } from '../../components/RolePlaceholder';
import { useAuth } from '../../context/AuthContext';
import { useSignOutFeedback } from '../../hooks/useSignOutFeedback';

export default function EmployeeRoute() {
  const { signOut } = useAuth();
  const { leaveAccount } = useSignOutFeedback(signOut);

  return (
    <RolePlaceholder
      title="Cuenta de empleado"
      description="Tu cuenta tiene acceso de empleado. Esta pantalla es informativa y no incluye herramientas operativas."
      onSignOut={leaveAccount}
    />
  );
}

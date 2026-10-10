import React from 'react';
import AdministratorEmployeeManagement from '../../components/AdministratorEmployeeManagement';
import { administratorService } from '../../services/administratorService';
import type { AdministratorService } from '../../types/administrator';

interface AdministratorEmployeesRouteProps {
  service?: AdministratorService;
}

export default function AdministratorEmployeesRoute({
  service = administratorService,
}: AdministratorEmployeesRouteProps) {
  return <AdministratorEmployeeManagement service={service} />;
}

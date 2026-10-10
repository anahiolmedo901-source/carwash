import React from 'react';
import AdministratorServiceManagement from '../../components/AdministratorServiceManagement';
import { administratorService } from '../../services/administratorService';
import type { AdministratorService } from '../../types/administrator';

interface AdministratorServicesRouteProps {
  service?: AdministratorService;
}

export default function AdministratorServicesRoute({ service = administratorService }: AdministratorServicesRouteProps) {
  return <AdministratorServiceManagement service={service} />;
}

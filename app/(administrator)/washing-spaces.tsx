import React from 'react';
import AdministratorWashingSpaceManagement from '../../components/AdministratorWashingSpaceManagement';
import { administratorService } from '../../services/administratorService';
import type { AdministratorService } from '../../types/administrator';

interface AdministratorWashingSpacesRouteProps {
  service?: AdministratorService;
}

export default function AdministratorWashingSpacesRoute({
  service = administratorService,
}: AdministratorWashingSpacesRouteProps) {
  return <AdministratorWashingSpaceManagement service={service} />;
}

import React from 'react';
import AdministratorRatingManagement from '../../components/AdministratorRatingManagement';
import { administratorService } from '../../services/administratorService';
import type { AdministratorService } from '../../types/administrator';

interface AdministratorRatingsRouteProps {
  service?: AdministratorService;
}

export default function AdministratorRatingsRoute({
  service = administratorService,
}: AdministratorRatingsRouteProps) {
  return <AdministratorRatingManagement service={service} />;
}

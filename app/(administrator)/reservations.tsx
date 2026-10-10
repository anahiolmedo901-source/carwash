import React from 'react';
import AdministratorReservationManagement from '../../components/AdministratorReservationManagement';
import { administratorService } from '../../services/administratorService';
import type { AdministratorService } from '../../types/administrator';

interface AdministratorReservationsRouteProps {
  service?: AdministratorService;
}

export default function AdministratorReservationsRoute({
  service = administratorService,
}: AdministratorReservationsRouteProps) {
  return <AdministratorReservationManagement service={service} />;
}

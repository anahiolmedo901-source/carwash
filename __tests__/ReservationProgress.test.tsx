import React from 'react';
import { render } from '@testing-library/react-native';
import {
  RESERVATION_PROGRESS_STEPS,
  ReservationProgress,
  getReservationProgressState,
} from '../components/ReservationProgress';

describe('ReservationProgress', () => {
  it('keeps the operational statuses in their ordered progression', () => {
    expect(RESERVATION_PROGRESS_STEPS).toEqual([
      'confirmada',
      'cliente_llego',
      'en_espera',
      'en_lavado',
      'finalizada',
    ]);
    expect(getReservationProgressState('en_lavado')).toEqual({ kind: 'progress', activeIndex: 3 });
    expect(getReservationProgressState('pendiente')).toEqual({ kind: 'pending' });
    expect(getReservationProgressState('cancelada')).toEqual({ kind: 'cancelled' });
  });

  it('renders the progress steps and handles pending and cancelled states separately', () => {
    const progress = render(<ReservationProgress status="en_espera" />);
    expect(progress.getByText('Confirmada')).toBeTruthy();
    expect(progress.getByText('Cliente llegó')).toBeTruthy();
    expect(progress.getByText('En espera')).toBeTruthy();
    expect(progress.getByText('En lavado')).toBeTruthy();
    expect(progress.getByText('Finalizada')).toBeTruthy();

    const pending = render(<ReservationProgress status="pendiente" />);
    expect(pending.getByText('Reservación pendiente')).toBeTruthy();
    expect(pending.queryByText('Confirmada')).toBeNull();

    const cancelled = render(<ReservationProgress status="cancelada" />);
    expect(cancelled.getByText('Reservación cancelada')).toBeTruthy();
    expect(cancelled.queryByText('Finalizada')).toBeNull();
  });
});

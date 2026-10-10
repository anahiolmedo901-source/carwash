import {
  getReservationTimeSlots,
  parseBusinessHours,
  RESERVATION_CLOSING_MINUTES,
  RESERVATION_OPENING_MINUTES,
} from '../utils/reservationSchedule';

describe('reservation schedule limits', () => {
  it('normalizes every configured wash to 07:00 through 18:00', () => {
    expect(parseBusinessHours('08:00 - 20:00')).toMatchObject({
      openingMinutes: RESERVATION_OPENING_MINUTES,
      closingMinutes: RESERVATION_CLOSING_MINUTES,
      openingLabel: '07:00',
      closingLabel: '18:00',
    });
  });

  it('does not offer a start time that would finish after 18:00', () => {
    const slots = getReservationTimeSlots(
      '08:00 - 20:00',
      45,
      '2099-01-01',
      new Date('2026-10-09T12:00:00'),
    );

    expect(slots[0]).toBe('07:00');
    expect(slots[slots.length - 1]).toBe('17:00');
    expect(slots).not.toContain('17:30');
    expect(slots).not.toContain('18:00');
  });
});

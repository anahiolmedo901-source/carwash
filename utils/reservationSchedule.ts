const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const RESERVATION_OPENING_MINUTES = 7 * 60;
export const RESERVATION_CLOSING_MINUTES = 18 * 60;
export const RESERVATION_HOURS_LABEL = '07:00 - 18:00';

export interface ReservationDateBounds {
  today: Date;
  maximum: Date;
}

export interface ReservationCalendarDay {
  date: string;
  day: number;
  currentMonth: boolean;
  disabled: boolean;
}

export interface BusinessHours {
  openingMinutes: number;
  closingMinutes: number;
  openingLabel: string;
  closingLabel: string;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function formatReservationDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseReservationDate(value: string): Date | null {
  const match = value.match(DATE_PATTERN);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3])
    ? startOfDay(date)
    : null;
}

export function getReservationDateBounds(now = new Date()): ReservationDateBounds {
  const today = startOfDay(now);
  const maximum = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return { today, maximum };
}

export function isReservationDateAllowed(value: string, now = new Date()): boolean {
  const date = parseReservationDate(value);
  if (!date) {
    return false;
  }
  const { today, maximum } = getReservationDateBounds(now);
  return date >= today && date <= maximum;
}

export function parseBusinessHours(value: string): BusinessHours | null {
  const match = value.match(/(\d{1,2})\s*[:h]\s*(\d{2})\s*(?:-|–|—|a|hasta)\s*(\d{1,2})\s*[:h]\s*(\d{2})/i);
  if (!match) {
    return null;
  }
  const openingHour = Number(match[1]);
  const openingMinute = Number(match[2]);
  const closingHour = Number(match[3]);
  const closingMinute = Number(match[4]);
  const openingMinutes = openingHour * 60 + openingMinute;
  const closingMinutes = closingHour * 60 + closingMinute;
  if (
    openingHour < 0 || openingHour > 23
    || closingHour < 0 || closingHour > 23
    || openingMinute < 0 || openingMinute > 59
    || closingMinute < 0 || closingMinute > 59
    || closingMinutes <= openingMinutes
  ) {
    return null;
  }

  return {
    openingMinutes: RESERVATION_OPENING_MINUTES,
    closingMinutes: RESERVATION_CLOSING_MINUTES,
    openingLabel: '07:00',
    closingLabel: '18:00',
  };
}

export function getReservationTimeSlots(
  hours: string,
  durationMinutes: number,
  date: string,
  now = new Date(),
  intervalMinutes = 30,
): string[] {
  const businessHours = parseBusinessHours(hours);
  const selectedDate = parseReservationDate(date);
  if (!businessHours || !selectedDate || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return [];
  }

  let firstSlot = businessHours.openingMinutes;
  if (formatReservationDate(selectedDate) === formatReservationDate(now)) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    firstSlot = Math.max(firstSlot, Math.ceil(currentMinutes / intervalMinutes) * intervalMinutes);
  }

  const slots: string[] = [];
  for (
    let start = firstSlot;
    start + durationMinutes <= businessHours.closingMinutes;
    start += intervalMinutes
  ) {
    slots.push(`${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`);
  }
  return slots;
}

export function getReservationCalendarDays(month: Date, now = new Date()): ReservationCalendarDay[] {
  const { today, maximum } = getReservationDateBounds(now);
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const firstCell = new Date(firstOfMonth);
  firstCell.setDate(firstCell.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    return {
      date: formatReservationDate(date),
      day: date.getDate(),
      currentMonth: date.getMonth() === month.getMonth(),
      disabled: date < today || date > maximum || date.getMonth() !== month.getMonth(),
    };
  });
}

export function formatReservationMonth(value: Date): string {
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(value);
}

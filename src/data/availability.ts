/**
 * Deepika's availability calendar, shared by DMH API and the admin dashboard.
 * The team marks days in the dashboard's Calendar; the WhatsApp assistant reads them to tell customers whether a date
 * is open. One row per marked day in the `availability` table. A day without a mark is open.
 */

export const AVAILABILITY_STATUSES = [
  { id: 'available', label: 'Free' },
  { id: 'limited', label: 'Few slots left' },
  { id: 'booked', label: 'Fully booked' },
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number]['id'];
export const AVAILABILITY_STATUS_IDS: readonly string[] = AVAILABILITY_STATUSES.map((s) => s.id);

/** A marked day, as the dashboard shows it. */
export interface AvailabilityDay {
  /** YYYY-MM-DD */
  date: string;
  status: AvailabilityStatus;
  /** Private team note, e.g. "Priya's wedding, 6 am" (never shown to customers). */
  note: string | null;
  updatedAt: string;
  updatedByName: string | null;
}

/** A lead whose event falls on a calendar day, so the team sees what's already requested. */
export interface CalendarLead {
  id: string;
  fullName: string;
  service: string;
  stage: string;
  /** YYYY-MM-DD */
  eventDate: string;
}

/** The most days one change can mark at once. */
export const MAX_DAYS_PER_CHANGE = 62;

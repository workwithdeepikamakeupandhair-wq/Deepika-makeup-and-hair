/**
 * Calls to DMH API's dashboard routes (/api/admin). The login lives in an HttpOnly cookie the browser sends itself.
 */
import type { AvailabilityDay, AvailabilityStatus, CalendarLead } from '../data/availability';
import type { BookingDetails, BookingSettings, CalendarAppointment, TimeBlock } from '../data/bookingFlow';
import type { AdminUser, Lead } from '../data/leads';

/** Thrown when the session has expired or the user logged out in another tab. */
export class NotLoggedIn extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 401 && path !== '/login') throw new NotLoggedIn();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}

export interface LeadsQuery {
  stage?: string;
  source?: string;
  /** WhatsApp booking stage, e.g. "payment_review" */
  booking?: string;
  q?: string;
  offset?: number;
}

export interface LeadsPageData {
  leads: Lead[];
  hasMore: boolean;
  counts: Record<string, number>;
  /** WhatsApp bookings whose payment screenshot is waiting to be checked */
  paymentsToVerify: number;
}

export interface CalendarData {
  days: AvailabilityDay[];
  leads: CalendarLead[];
  blocks: TimeBlock[];
  appointments: CalendarAppointment[];
  /** How long each booking takes on the calendar (Settings) */
  appointmentHours: number;
}

/** After approving a booking or asking for the payment again: the WhatsApp message to the customer went out, or why not. */
export interface BookingActionResult {
  lead: Lead;
  booking: BookingDetails;
  message: { sent: boolean; error?: string };
}

/** Where a payment screenshot can be opened (same origin, so the login cookie goes along). */
export const paymentProofUrl = (id: string) => `/api/admin/payment-proofs/${encodeURIComponent(id)}`;

export const api = {
  me: () => request<{ user: AdminUser }>('/me').then((d) => d.user),
  login: (email: string, password: string) =>
    request<{ user: AdminUser }>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }).then((d) => d.user),
  logout: () => request('/logout', { method: 'POST' }),
  users: () => request<{ users: AdminUser[] }>('/users').then((d) => d.users),
  /** What needs the team's attention (the header's badge). */
  summary: () => request<{ paymentsToVerify: number }>('/summary'),
  leads: (query: LeadsQuery) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
    return request<LeadsPageData>(`/leads?${params}`);
  },
  updateLead: (id: string, changes: { stage?: string; assignedTo?: string | null; adminNotes?: string | null }) =>
    request<{ lead: Lead }>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }).then((d) => d.lead),
  /** The lead's WhatsApp booking: quote, artist, payment screenshots and the calendar check. */
  booking: (id: string) => request<{ booking: BookingDetails }>(`/leads/${id}/booking`).then((d) => d.booking),
  /** Confirms the booking; the customer gets the confirmation on WhatsApp. */
  approveBooking: (id: string) => request<BookingActionResult>(`/leads/${id}/approve`, { method: 'POST' }),
  /** The payment couldn't be verified: the customer is asked on WhatsApp to send it again. */
  reopenPayment: (id: string) => request<BookingActionResult>(`/leads/${id}/reopen-payment`, { method: 'POST' }),
  /** Marked days, leads, blocked times and timed bookings between `from` and `to` (YYYY-MM-DD). */
  calendar: (from: string, to: string) => request<CalendarData>(`/availability?${new URLSearchParams({ from, to })}`),
  /** Marks days (status), clears them (null), and/or changes their note (omit `note` to keep it). */
  markDays: (dates: string[], status: AvailabilityStatus | null, note?: string | null) =>
    request<{ ok: true }>('/availability', { method: 'PUT', body: JSON.stringify({ dates, status, ...(note !== undefined && { note }) }) }),
  /** Marks a time on one day as taken ("08:00" to "11:00"). */
  addTimeBlock: (date: string, start: string, end: string, note?: string | null) =>
    request<{ block: TimeBlock }>('/availability/blocks', { method: 'POST', body: JSON.stringify({ date, start, end, note: note || null }) }).then((d) => d.block),
  removeTimeBlock: (id: string) => request<{ ok: true }>(`/availability/blocks/${id}`, { method: 'DELETE' }),
  settings: () => request<{ settings: BookingSettings }>('/settings').then((d) => d.settings),
  saveSettings: (settings: BookingSettings) =>
    request<{ settings: BookingSettings }>('/settings', { method: 'PUT', body: JSON.stringify(settings) }).then((d) => d.settings),
};

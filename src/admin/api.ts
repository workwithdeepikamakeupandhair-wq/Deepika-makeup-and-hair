/**
 * Calls to DMH API's dashboard routes (/api/admin). The login lives in an HttpOnly cookie the browser sends itself.
 */
import type { AvailabilityDay, AvailabilityStatus, CalendarLead } from '../data/availability';
import type { BookingDetails, BookingSettings, CalendarAppointment, TimeBlock } from '../data/bookingFlow';
import type { AdminUser, ChatLine, Lead } from '../data/leads';

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

/** What waits for the team: the header's badge and the two "to approve" filters on Leads. */
export interface WaitingCounts {
  /** WhatsApp enquiry forms waiting for the team's approval */
  enquiriesToApprove: number;
  /** WhatsApp bookings whose payment screenshot is waiting to be checked */
  paymentsToVerify: number;
}

export interface LeadsPageData extends WaitingCounts {
  leads: Lead[];
  hasMore: boolean;
  counts: Record<string, number>;
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
  /** Approving an enquiry: occasions with no price list for the customer's artist, for the team to quote */
  teamQuotes?: string[];
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
  summary: () => request<WaitingCounts>('/summary'),
  leads: (query: LeadsQuery) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
    return request<LeadsPageData>(`/leads?${params}`);
  },
  updateLead: (id: string, changes: { stage?: string; assignedTo?: string | null; adminNotes?: string | null }) =>
    request<{ lead: Lead }>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }).then((d) => d.lead),
  /** The lead's WhatsApp booking: quote, artist, payment screenshots and the calendar check. */
  booking: (id: string) => request<{ booking: BookingDetails }>(`/leads/${id}/booking`).then((d) => d.booking),
  /** The team's answer to a WhatsApp enquiry: approved (the customer gets their artist and prices) or not available. */
  answerEnquiry: (id: string, decision: 'approve' | 'decline') =>
    request<BookingActionResult>(`/leads/${id}/enquiry`, { method: 'POST', body: JSON.stringify({ decision }) }),
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
  /** The lead's whole WhatsApp chat with Pooja, oldest first (`more`: older messages weren't included). */
  chat: (leadId: string) => request<{ messages: ChatLine[]; more: boolean }>(`/leads/${leadId}/chat`),
  /** Frees a time on a day, cutting back any blocks that cover it. */
  freeTime: (date: string, start: string, end: string) =>
    request<{ ok: true }>(`/availability/blocks?${new URLSearchParams({ date, start, end })}`, { method: 'DELETE' }),
  settings: () => request<{ settings: BookingSettings }>('/settings').then((d) => d.settings),
  saveSettings: (settings: BookingSettings) =>
    request<{ settings: BookingSettings }>('/settings', { method: 'PUT', body: JSON.stringify(settings) }).then((d) => d.settings),
};

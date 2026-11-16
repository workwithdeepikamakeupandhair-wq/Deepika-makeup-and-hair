/**
 * Calls to DMH API's dashboard routes (/api/admin). The login lives in an HttpOnly cookie the browser sends itself.
 */
import type { AvailabilityDay, AvailabilityStatus, CalendarLead } from '../data/availability';
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
  q?: string;
  offset?: number;
}

export interface LeadsPageData {
  leads: Lead[];
  hasMore: boolean;
  counts: Record<string, number>;
}

export const api = {
  me: () => request<{ user: AdminUser }>('/me').then((d) => d.user),
  login: (email: string, password: string) =>
    request<{ user: AdminUser }>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }).then((d) => d.user),
  logout: () => request('/logout', { method: 'POST' }),
  users: () => request<{ users: AdminUser[] }>('/users').then((d) => d.users),
  leads: (query: LeadsQuery) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
    return request<LeadsPageData>(`/leads?${params}`);
  },
  updateLead: (id: string, changes: { stage?: string; assignedTo?: string | null; adminNotes?: string | null }) =>
    request<{ lead: Lead }>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }).then((d) => d.lead),
  /** Marked days and leads with an event date between `from` and `to` (YYYY-MM-DD). */
  calendar: (from: string, to: string) =>
    request<{ days: AvailabilityDay[]; leads: CalendarLead[] }>(`/availability?${new URLSearchParams({ from, to })}`),
  /** Marks days (status), clears them (null), and/or changes their note (omit `note` to keep it). */
  markDays: (dates: string[], status: AvailabilityStatus | null, note?: string | null) =>
    request<{ ok: true }>('/availability', { method: 'PUT', body: JSON.stringify({ dates, status, ...(note !== undefined && { note }) }) }),
};

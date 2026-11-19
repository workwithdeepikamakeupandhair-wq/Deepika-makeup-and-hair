/**
 * Shared lead helpers: turning `bookings` rows into dashboard leads, and working out which ad a lead came from.
 */
import type { Lead } from '../src/data/leads.js';

/** Columns for a dashboard lead (event_date as text, so no time zone shifts it). */
export const LEAD_COLUMNS = `
  b.id::text, b.full_name, b.phone, b.email, b.service, to_char(b.event_date, 'YYYY-MM-DD') AS event_date,
  b.event_location, b.party_size, b.notes, b.status, b.source, b.channel, b.campaign, b.ad_name,
  b.assigned_to::text, u.name AS assigned_to_name, b.admin_notes, b.created_at, b.updated_at,
  b.booking_status, to_char(b.event_time, 'HH24:MI') AS event_time`;

export const LEAD_FROM = 'bookings b LEFT JOIN admin_users u ON u.id = b.assigned_to';

export interface LeadRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  service: string;
  event_date: string | null;
  event_location: string | null;
  party_size: string | null;
  notes: string | null;
  status: string;
  source: string;
  channel: string | null;
  campaign: string | null;
  ad_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  admin_notes: string | null;
  created_at: Date;
  updated_at: Date;
  booking_status: string | null;
  event_time: string | null;
}

export function toLead(r: LeadRow): Lead {
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    service: r.service,
    eventDate: r.event_date,
    eventLocation: r.event_location,
    partySize: r.party_size,
    notes: r.notes,
    stage: r.status,
    source: r.source,
    channel: r.channel,
    campaign: r.campaign,
    adName: r.ad_name,
    assignedTo: r.assigned_to,
    assignedToName: r.assigned_to_name,
    adminNotes: r.admin_notes,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    bookingStatus: r.booking_status,
    eventTime: r.event_time,
  };
}

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  fbclid?: string;
  gclid?: string;
}

const short = (value: unknown, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/** Reads the ad-tracking parameters the website saved when the visitor arrived (see src/attribution.ts). */
export function cleanAttribution(value: unknown): Attribution {
  const a = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    utm_source: short(a.utm_source),
    utm_medium: short(a.utm_medium),
    utm_campaign: short(a.utm_campaign),
    utm_content: short(a.utm_content),
    fbclid: short(a.fbclid, 500),
    gclid: short(a.gclid, 500),
  };
}

/**
 * Website leads that arrived from a paid ad link get the ad platform as their source. Meta's URL parameter
 * {{site_source_name}} gives "ig" / "fb"; most people type "instagram" / "facebook".
 */
export function sourceFromAttribution(a: Attribution): string {
  const src = (a.utm_source ?? '').toLowerCase();
  const paid = /cpc|ppc|paid|\bads?\b|social_paid|paid_social/.test((a.utm_medium ?? '').toLowerCase()) || Boolean(a.fbclid || a.gclid);
  if (!paid) return 'website';
  if (/^ig$|instagram/.test(src)) return 'instagram_ad';
  if (/^(fb|meta|an|msg)$|facebook|messenger/.test(src) || (!src && a.fbclid)) return 'facebook_ad';
  if (/google|adwords/.test(src) || (!src && a.gclid)) return 'google_ad';
  return 'website';
}

/** Click-to-WhatsApp ads say where the ad ran only through its link. */
export function sourceFromAdUrl(url: string | undefined): 'instagram_ad' | 'facebook_ad' {
  return /instagram\.com|instagr\.am/i.test(url ?? '') ? 'instagram_ad' : 'facebook_ad';
}

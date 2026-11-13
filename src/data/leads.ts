/**
 * Lead stages, sources and the lead shape, shared by DMH API and the admin dashboard.
 * Every booking request (website form, WhatsApp assistant) and every ad lead (Meta instant forms,
 * click-to-WhatsApp ads) is one row in the `bookings` table; its `status` column holds the stage.
 */

export const LEAD_STAGES = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'consultation_booked', label: 'Consultation Booked' },
  { id: 'trial_booked', label: 'Trial Booked' },
  { id: 'converted', label: 'Converted' },
  { id: 'lost', label: 'Lost' },
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number]['id'];
export const LEAD_STAGE_IDS: readonly string[] = LEAD_STAGES.map((s) => s.id);

/** Where the lead came from (`bookings.source`). */
export const LEAD_SOURCES = {
  website: 'Website',
  whatsapp: 'WhatsApp',
  instagram_ad: 'Instagram Ad',
  facebook_ad: 'Facebook Ad',
  google_ad: 'Google Ad',
} as const;

export type LeadSource = keyof typeof LEAD_SOURCES;

/** How the lead reached us (`bookings.channel`). */
export const LEAD_CHANNELS = {
  website_form: 'Website form',
  whatsapp: 'WhatsApp chat',
  lead_form: 'Instant form',
} as const;

/** Service shown for ad leads that haven't said what they want yet. */
export const SERVICE_NOT_SPECIFIED = 'Not specified';

export interface Lead {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  service: string;
  /** YYYY-MM-DD */
  eventDate: string | null;
  eventLocation: string | null;
  partySize: string | null;
  /** What the customer wrote or answered */
  notes: string | null;
  stage: string;
  source: string;
  channel: string | null;
  campaign: string | null;
  adName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  /** Private notes from the team */
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
}

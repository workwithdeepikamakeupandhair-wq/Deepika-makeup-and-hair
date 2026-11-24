/**
 * Display helpers for the leads dashboard: colours for stages and sources, dates and "17m ago".
 */
import { LEAD_CHANNELS, LEAD_SOURCES, LEAD_STAGES } from '../data/leads';

export const STAGE_STYLE: Record<string, string> = {
  new: 'bg-[#FDF0E3] text-[#B45F14] border-[#F6D9BC]',
  contacted: 'bg-[#E8F0FE] text-[#2B5AB0] border-[#CFDDF8]',
  confirmed: 'bg-[#E4F4EA] text-[#1F7A45] border-[#C7E7D3]',
  lost: 'bg-[#F1EEEB] text-[#6A5F56] border-[#E2DCD6]',
};

export const SOURCE_STYLE: Record<string, { pill: string; dot: string }> = {
  instagram_ad: { pill: 'bg-[#FCE8F3] text-[#B4236E]', dot: 'bg-[#E1306C]' },
  facebook_ad: { pill: 'bg-[#E6EFFE] text-[#1D5BD8]', dot: 'bg-[#1877F2]' },
  google_ad: { pill: 'bg-[#FEF3D7] text-[#9A5B00]', dot: 'bg-[#F4B400]' },
  whatsapp: { pill: 'bg-[#E3F6EA] text-[#15803D]', dot: 'bg-[#25D366]' },
  website: { pill: 'bg-[#F4EFEA] text-[#7D6243]', dot: 'bg-[#C5A880]' },
};

/** WhatsApp booking stages (bookingFlow.ts): enquiry to approve, not available, pricing sent, waiting for the advance, payment to check, confirmed. */
export const BOOKING_STATUS_STYLE: Record<string, string> = {
  enquiry_review: 'bg-[#E8F0FE] text-[#2B5AB0] border-[#CFDDF8]',
  not_available: 'bg-[#F1EEEB] text-[#6A5F56] border-[#E2DCD6]',
  quoted: 'bg-[#F2ECFB] text-[#6B3FB0] border-[#DFD2F3]',
  awaiting_payment: 'bg-[#FFF5D9] text-[#8A6100] border-[#F3E2AE]',
  payment_review: 'bg-[#FCE8F3] text-[#B4236E] border-[#F5C6DE]',
  confirmed: 'bg-[#E4F4EA] text-[#1F7A45] border-[#C7E7D3]',
};

export const stageLabel = (id: string) => LEAD_STAGES.find((s) => s.id === id)?.label ?? id;
export const sourceLabel = (id: string) => (LEAD_SOURCES as Record<string, string>)[id] ?? id;
export const channelLabel = (id: string | null) => (id ? ((LEAD_CHANNELS as Record<string, string>)[id] ?? id) : null);

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const fullDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "2027-03-14" → "14 Mar 2027" (read as a calendar date, so no time zone can shift it). */
export function eventDateLabel(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Digits only, for wa.me links. */
export const phoneDigits = (phone: string) => phone.replace(/\D/g, '');

/**
 * Side panel with everything about one lead: quick call / WhatsApp / email, the WhatsApp booking (with the payment
 * screenshots and Approve), details, the customer's own words, and private team notes.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Mail, Phone, X } from 'lucide-react';
import { timeLabel } from '../data/bookingFlow';
import type { AdminUser, Lead } from '../data/leads';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { BookingPanel } from './BookingPanel';
import { AssigneeSelect, SourcePill, StageSelect } from './controls';
import { channelLabel, eventDateLabel, fullDateTime, phoneDigits } from './format';

interface Props {
  lead: Lead;
  users: AdminUser[];
  onClose: () => void;
  onUpdate: (changes: { stage?: string; assignedTo?: string | null; adminNotes?: string | null }) => Promise<unknown>;
  /** A WhatsApp booking was approved or sent back from this panel: the updated lead. */
  onBookingChanged: (lead: Lead) => void;
  onLoggedOut: () => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-[#F1ECE6] last:border-0">
    <dt className="text-xs uppercase tracking-[0.1em] text-[#9E7D53] pt-0.5">{label}</dt>
    <dd className="text-sm text-[#1D1714] break-words">{children}</dd>
  </div>
);

export const LeadDrawer: React.FC<Props> = ({ lead, users, onClose, onUpdate, onBookingChanged, onLoggedOut }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [notes, setNotes] = useState(lead.adminNotes ?? '');
  const [notesState, setNotesState] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveNotes = async () => {
    setNotesState('saving');
    try {
      await onUpdate({ adminNotes: notes.trim() || null });
      setNotesState('saved');
    } catch {
      setNotesState('idle');
    }
  };

  const digits = phoneDigits(lead.phone);
  const channel = channelLabel(lead.channel);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-[#1D1714]/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-drawer-title"
        className="relative w-full max-w-md h-full overflow-y-auto bg-[#FAF7F2] shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#E7DFD6] bg-[#FAF7F2] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-[#9E7D53]">Lead #{lead.id}</p>
            <h2 id="lead-drawer-title" className="font-serif text-2xl text-[#1D1714] truncate">
              {lead.fullName}
            </h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-9 h-9 rounded-full border border-[#E7DFD6] bg-white flex items-center justify-center hover:bg-[#F4EFEA]"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-5 space-y-6">
          {/* Quick contact */}
          <div className="flex flex-wrap gap-2">
            {digits && (
              <>
                <a href={`tel:+${digits}`} className="inline-flex items-center gap-2 rounded-full bg-[#1D1714] px-4 py-2 text-xs font-medium text-white hover:bg-[#3A322C]">
                  <Phone className="w-3.5 h-3.5" /> Call
                </a>
                <a
                  href={`https://wa.me/${digits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-xs font-medium text-white hover:bg-[#1EBE5D]"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" /> WhatsApp
                </a>
              </>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-2 rounded-full border border-[#D9D0C5] bg-white px-4 py-2 text-xs font-medium hover:bg-[#F4EFEA]">
                <Mail className="w-3.5 h-3.5" /> Email
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StageSelect value={lead.stage} label="Stage" onChange={(stage) => void onUpdate({ stage }).catch(() => {})} />
            <div className="rounded-lg border border-[#E7DFD6] bg-white">
              <AssigneeSelect value={lead.assignedTo} users={users} label="Assigned to" onChange={(assignedTo) => void onUpdate({ assignedTo }).catch(() => {})} />
            </div>
          </div>

          {/* Bookings Pooja took on WhatsApp (website and ad leads have none) */}
          {lead.channel === 'whatsapp' && <BookingPanel lead={lead} onChanged={onBookingChanged} onLoggedOut={onLoggedOut} />}

          <dl className="rounded-2xl border border-[#E7DFD6] bg-white px-4">
            <Row label="Phone">{lead.phone || '—'}</Row>
            <Row label="Email">{lead.email || <span className="text-[#C2853D]">No email</span>}</Row>
            <Row label="Service">{lead.service}</Row>
            <Row label="Event date">{[eventDateLabel(lead.eventDate), timeLabel(lead.eventTime)].filter(Boolean).join(' at ') || '—'}</Row>
            <Row label="Location">{lead.eventLocation || '—'}</Row>
            <Row label="People">{lead.partySize || '—'}</Row>
            <Row label="Source">
              <span className="inline-flex flex-wrap items-center gap-2">
                <SourcePill source={lead.source} />
                {channel && <span className="text-xs text-[#6A5F56]">via {channel}</span>}
              </span>
            </Row>
            {lead.campaign && <Row label="Campaign">{lead.campaign}</Row>}
            {lead.adName && <Row label="Ad">{lead.adName}</Row>}
            <Row label="Received">{fullDateTime(lead.createdAt)}</Row>
            <Row label="Last change">{fullDateTime(lead.updatedAt)}</Row>
          </dl>

          {lead.notes && (
            <section>
              <h3 className="text-xs uppercase tracking-[0.12em] text-[#9E7D53] mb-2">What they told us</h3>
              <p className="whitespace-pre-wrap rounded-2xl border border-[#E7DFD6] bg-white p-4 text-sm text-[#1D1714] leading-relaxed">{lead.notes}</p>
            </section>
          )}

          <section>
            <label htmlFor="lead-team-notes" className="block text-xs uppercase tracking-[0.12em] text-[#9E7D53] mb-2">
              Team notes (only visible here)
            </label>
            <textarea
              id="lead-team-notes"
              rows={4}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesState('idle');
              }}
              placeholder="e.g. Called on Monday, sending quote by Friday"
              className="w-full rounded-2xl border border-[#D9D0C5] bg-white p-4 text-sm outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={saveNotes}
                disabled={notesState === 'saving' || notes.trim() === (lead.adminNotes ?? '')}
                className="rounded-full bg-[#1D1714] px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-[#3A322C] disabled:opacity-40"
              >
                {notesState === 'saving' ? 'Saving…' : 'Save notes'}
              </button>
              {notesState === 'saved' && <span className="text-xs text-[#1F7A45]" role="status">Saved</span>}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};

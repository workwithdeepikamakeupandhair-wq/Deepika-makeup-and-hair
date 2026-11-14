/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { X, Phone, CheckCircle2, Sparkles, Mail } from 'lucide-react';
import { getAttribution } from '../attribution';
import { emailLinks } from '../data/inquiryEmail';
import { BUSINESS_INFO, LookArchiveItem, ServiceItem, WHATSAPP_CONTACTS } from '../data/portfolioData';
import { WhatsAppIcon } from './WhatsAppIcon';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedLook?: LookArchiveItem | null;
  preselectedService?: ServiceItem | null;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  preselectedLook,
  preselectedService
}) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const chosenService = () =>
    preselectedService?.title ||
    (preselectedLook ? `Look: ${preselectedLook.title}` : 'Bridal Makeup & Hair');
  const [service, setService] = useState(chosenService);

  // The modal stays mounted between openings, so pick up the service / look chosen for this opening
  // (otherwise every "Book" button would keep whatever was chosen the first time).
  useEffect(() => {
    if (isOpen) setService(chosenService());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, preselectedService, preselectedLook]);
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('Atlanta, GA');
  const [guestCount, setGuestCount] = useState('Bride only');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  if (!isOpen) return null;

  const handleWhatsAppSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = encodeURIComponent(
      `Hello Deepika,\n\nI would like to inquire about booking makeup & hair services with you:\n\n` +
      `• Name: ${fullName || 'Client'}\n` +
      `• Service: ${service}\n` +
      `• Date: ${eventDate || 'To be determined'}\n` +
      `• Location: ${eventLocation}\n` +
      `• Party Size: ${guestCount}\n` +
      `• Notes: ${notes || 'None'}\n\n` +
      `Please let me know your availability and bridal package details. Thank you!`
    );
    window.open(`${BUSINESS_INFO.whatsappUrl}?text=${text}`, '_blank');
    setSubmitted(true);
  };

  // Opens the visitor's mail app with an email to Deepika holding the form's answers. Fields left empty stay
  // as blank lines, so they can still be filled in inside the email before sending.
  const handleEmailSend = () => {
    const body = [
      `Hi ${BUSINESS_INFO.artist.split(' ')[0]},`,
      '',
      'I would like to inquire about booking makeup & hair services with you:',
      '',
      `Full name: ${fullName}`,
      `Phone / WhatsApp: ${phone}`,
      ...(email ? [`Email: ${email}`] : []),
      `Service: ${service}`,
      `Event date: ${eventDate}`,
      `Location (full address): ${eventLocation}`,
      `Party size: ${guestCount}`,
      `Notes: ${notes}`,
      '',
      'Please let me know your availability and pricing. Thank you!',
    ].join('\n');
    window.location.href = emailLinks(`Booking Inquiry: ${service} | ${BUSINESS_INFO.name}`, body).mailto;
    setSubmitted(true);
  };

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          email,
          service,
          eventDate,
          eventLocation,
          partySize: guestCount,
          notes,
          attribution: getAttribution(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Could not send your request.');
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        `${err instanceof Error ? err.message : 'Could not send your request.'} ` +
          'You can also send it via WhatsApp or call directly.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#1D1714]/65 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl bg-[#FAF7F2] rounded-2xl shadow-2xl border border-[#E7DFD6] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-6 bg-[#F4EFEA] border-b border-[#E7DFD6] flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Deepika Makeup &amp; Hair · Atlanta</span>
            </div>
            <h3 className="font-serif text-2xl text-[#1D1714] font-medium">
              Schedule Your Consultation
            </h3>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-[#E7DFD6] flex items-center justify-center text-[#1D1714] hover:bg-[#1D1714] hover:text-white transition-colors"
            aria-label="Close booking modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {submitted ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#1D1714] text-[#C5A880] mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="font-serif text-2xl text-[#1D1714]">
                Inquiry Successfully Prepared!
              </h4>
              <p className="text-xs sm:text-sm text-[#6A5F56] max-w-md mx-auto leading-relaxed">
                Thank you, <strong className="text-[#1D1714]">{fullName || 'Bride'}</strong>.
                Deepika reviews inquiries within 24 hours. If your wedding date is coming soon, you can also message or call directly.
              </p>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href={`tel:${BUSINESS_INFO.phonePrimaryTel}`}
                  className="w-full sm:w-auto btn-gold px-6 py-2.5 rounded-full text-xs uppercase tracking-wider font-sans font-medium flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  <span>Call {BUSINESS_INFO.phonePrimary} ({BUSINESS_INFO.phonePrimaryCountry})</span>
                </a>
                {WHATSAPP_CONTACTS.map((c) => (
                  <a
                    key={c.country}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto px-6 py-2.5 rounded-full text-xs uppercase tracking-wider font-sans font-medium bg-[#25D366] text-white hover:bg-[#1EBE5D] transition-colors flex items-center justify-center gap-2"
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                    <span>WhatsApp {c.country}</span>
                  </a>
                ))}
              </div>

              <button
                onClick={() => {
                  setSubmitted(false);
                  onClose();
                }}
                className="text-xs text-[#9E7D53] underline pt-4"
              >
                Close Window
              </button>
            </div>
          ) : (
            <form onSubmit={handleDirectSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-sans uppercase tracking-wider font-medium text-[#1D1714] mb-1.5">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D9D0C5] rounded-xl text-xs text-[#1D1714] focus:outline-none focus:border-[#C5A880] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-sans uppercase tracking-wider font-medium text-[#1D1714] mb-1.5">
                    Phone / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. (404) 555-0192"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D9D0C5] rounded-xl text-xs text-[#1D1714] focus:outline-none focus:border-[#C5A880] transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-sans uppercase tracking-wider font-medium text-[#1D1714] mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. priya@example.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D9D0C5] rounded-xl text-xs text-[#1D1714] focus:outline-none focus:border-[#C5A880] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-sans uppercase tracking-wider font-medium text-[#1D1714] mb-1.5">
                    Event Date
                  </label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D9D0C5] rounded-xl text-xs text-[#1D1714] focus:outline-none focus:border-[#C5A880] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-sans uppercase tracking-wider font-medium text-[#1D1714] mb-1.5">
                  Requested Artistry Service
                </label>
                <select
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D9D0C5] rounded-xl text-xs text-[#1D1714] focus:outline-none focus:border-[#C5A880] transition-colors"
                >
                  {/* Values must match the service titles in SERVICES so "Book This Service" pre-selects them */}
                  <option value="Bridal Makeup & Hair">Bridal Makeup &amp; Hair (Wedding Ceremony)</option>
                  <option value="Reception Makeup & Hair">Reception Makeup &amp; Hair</option>
                  <option value="Full Wedding Package (Ceremony + Sangeet + Reception)">
                    Full Wedding Package (Ceremony + Sangeet + Reception)
                  </option>
                  <option value="Party Makeup">Party Makeup</option>
                  <option value="Birthday Makeup">Birthday Makeup</option>
                  <option value="Engagement Makeup & Hair">Engagement Makeup &amp; Hair</option>
                  <option value="Sangeet & Mehendi Makeup">Sangeet &amp; Mehendi Makeup</option>
                  <option value="Photoshoot Makeup">Photoshoot Makeup</option>
                  <option value="Self-Makeup Class (1-on-1)">Self-Makeup Class (1-on-1)</option>
                  <option value="Pro Makeup & Hair Course">Pro Makeup &amp; Hair Course</option>
                  {/* A look booked from the 3D Archive ("Look: …") isn't in the list above: show it so the
                      form displays what will actually be sent. */}
                  {service.startsWith('Look: ') && <option value={service}>{service}</option>}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-sans uppercase tracking-wider font-medium text-[#1D1714] mb-1.5">
                    Event Venue / City
                  </label>
                  <input
                    type="text"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    placeholder="e.g. Atlanta, GA / The Estate"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D9D0C5] rounded-xl text-xs text-[#1D1714] focus:outline-none focus:border-[#C5A880] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-sans uppercase tracking-wider font-medium text-[#1D1714] mb-1.5">
                    Bridal Party Size
                  </label>
                  <select
                    value={guestCount}
                    onChange={(e) => setGuestCount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D9D0C5] rounded-xl text-xs text-[#1D1714] focus:outline-none focus:border-[#C5A880] transition-colors"
                  >
                    <option value="Bride only">Bride only</option>
                    <option value="Bride + 2-3 Family / Bridesmaids">Bride + 2–3 Family / Bridesmaids</option>
                    <option value="Bride + 4-6 Bridal Party">Bride + 4–6 Bridal Party</option>
                    <option value="Large bridal party (7+ people)">Large bridal party (7+ people)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-sans uppercase tracking-wider font-medium text-[#1D1714] mb-1.5">
                  Vision &amp; Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Share outfit colors, preferred styles (e.g. Hollywood waves, fresh jasmine braid), or specific questions..."
                  className="w-full px-3.5 py-2 bg-white border border-[#D9D0C5] rounded-xl text-xs text-[#1D1714] focus:outline-none focus:border-[#C5A880] transition-colors"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={handleWhatsAppSend}
                  className="w-full py-3 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium bg-[#25D366] text-white hover:bg-[#1EBE5D] transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>Send via WhatsApp (Instant Connect)</span>
                </button>

                <button
                  type="button"
                  onClick={handleEmailSend}
                  className="w-full py-3 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium bg-white border border-[#D9D0C5] text-[#1D1714] hover:border-[#1D1714] transition-colors flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  <span>Send via Email</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full btn-gold py-3 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium text-center disabled:opacity-60 disabled:cursor-wait"
                >
                  {submitting ? 'Sending…' : 'Submit Booking Request'}
                </button>

                {submitError && (
                  <p role="alert" className="text-[11px] text-center text-[#9B2C2C] leading-relaxed">
                    {submitError}
                  </p>
                )}
              </div>

              <div className="text-center pt-2">
                <p className="text-[10px] text-[#6A5F56]">
                  Immediate questions? WhatsApp <a href={BUSINESS_INFO.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-[#1D1714] underline font-medium">{BUSINESS_INFO.phonePrimary}</a> ({BUSINESS_INFO.phonePrimaryCountry}) or <a href={BUSINESS_INFO.whatsappSecondaryUrl} target="_blank" rel="noopener noreferrer" className="text-[#1D1714] underline font-medium">{BUSINESS_INFO.phoneSecondary}</a> ({BUSINESS_INFO.phoneSecondaryCountry})
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

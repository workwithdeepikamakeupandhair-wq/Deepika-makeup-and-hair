/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  X, Phone, CheckCircle2, Sparkles, Mail, ClipboardList, ChevronRight, ArrowUpRight, ArrowLeft, Check,
} from 'lucide-react';
import { getAttribution } from '../attribution';
import { BOOKING_GROUPS, BookingService, lookAsService, lookFromService } from '../data/bookingServices';
import { EmailDraft, emailLinks, isPhoneOrTablet, serviceInquiryEmail } from '../data/inquiryEmail';
import { EmailChooser } from './EmailChooser';
import { bookingName, BUSINESS_INFO, LookArchiveItem, ServiceItem, WHATSAPP_CONTACTS } from '../data/portfolioData';
import { WhatsAppIcon } from './WhatsAppIcon';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedLook?: LookArchiveItem | null;
  preselectedService?: ServiceItem | null;
}

/**
 * The window opens on a choice of how to reach Deepika: fill the form here (saved to the leads dashboard),
 * WhatsApp (opens the chat straight away) or email (pick a service, get an email written with its questions).
 */
type Step = 'choose' | 'form' | 'email';

const firstName = BUSINESS_INFO.artist.split(' ')[0];

const inputClass =
  'w-full px-3.5 py-2.5 bg-white border border-[#D9D0C5] rounded-xl text-xs text-[#1D1714] focus:outline-none focus:border-[#C5A880] transition-colors';
const labelClass = 'block text-xs font-sans uppercase tracking-wider font-medium text-[#1D1714] mb-1.5';
const optionClass =
  'w-full flex items-center gap-3.5 p-4 rounded-2xl bg-white border border-[#E7DFD6] hover:border-[#1D1714] transition-colors text-left';

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  preselectedLook,
  preselectedService
}) => {
  const [step, setStep] = useState<Step>('choose');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // Empty until the visitor picks one, unless she came from a "Book This Service" / look button
  const chosenService = () =>
    preselectedService ? bookingName(preselectedService) : preselectedLook ? lookAsService(preselectedLook.title) : '';
  const [service, setService] = useState(chosenService);
  // Computers only: the "Send your email with…" chooser (see EmailChooser)
  const [emailChooser, setEmailChooser] = useState<EmailDraft | null>(null);
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('Atlanta, GA');
  const [notes, setNotes] = useState('');
  /** How the inquiry went out, once it has */
  const [submitted, setSubmitted] = useState<'form' | 'email' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // The modal stays mounted between openings: start each opening on the choice screen, with the service / look
  // chosen for it (otherwise every "Book" button would keep whatever was chosen the first time).
  useEffect(() => {
    if (!isOpen) return;
    setStep('choose');
    setSubmitted(null);
    setSubmitError('');
    setService(chosenService());
    setEmailChooser(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, preselectedService, preselectedLook]);

  if (!isOpen) return null;

  const preselected = Boolean(preselectedService || preselectedLook);

  // A look booked from the 3D Archive ("Look: …") isn't one of the services: list it first so the pickers show
  // what will actually be sent.
  const lookOption = preselectedLook
    ? { value: lookAsService(preselectedLook.title), label: lookAsService(preselectedLook.title) }
    : null;

  const serviceRadio = (o: Pick<BookingService, 'value' | 'label'>) => {
    const selected = o.value === service;
    return (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => setService(o.value)}
        className={`px-3.5 py-2.5 rounded-xl text-xs text-left border transition-colors flex items-center justify-between gap-2 ${
          selected
            ? 'bg-[#1D1714] border-[#1D1714] text-white'
            : 'bg-white border-[#D9D0C5] text-[#1D1714] hover:border-[#1D1714]'
        }`}
      >
        <span>{o.label}</span>
        {selected && <Check className="w-3.5 h-3.5 text-[#C5A880] shrink-0" />}
      </button>
    );
  };

  const look = lookFromService(service);
  const whatsappText = !preselected
    ? `Hi ${firstName}, I'd like to book a consultation.`
    : look
      ? `Hi ${firstName}, I love the "${look}" look on your website and would like to book a consultation.`
      : `Hi ${firstName}, I'd like to book a consultation for ${service}.`;
  const whatsappHref = `${BUSINESS_INFO.whatsappUrl}?text=${encodeURIComponent(whatsappText)}`;

  // An email to Deepika with blank lines for the chosen service's questions, filled in inside the email itself
  const handleEmailSend = () => {
    if (!service) return;
    const draft = serviceInquiryEmail(service);
    if (isPhoneOrTablet()) {
      window.location.href = emailLinks(draft).mailto;
      setSubmitted('email');
    } else {
      // Computers usually have no mail app for mailto: links: let the visitor pick Gmail, Outlook, etc.
      setEmailChooser(draft);
    }
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
          notes,
          attribution: getAttribution(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Could not send your request.');
      }
      setSubmitted('form');
    } catch (err) {
      setSubmitError(
        `${err instanceof Error ? err.message : 'Could not send your request.'} ` +
          'You can also send it via WhatsApp or call directly.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const backButton = (
    <button
      type="button"
      onClick={() => setStep('choose')}
      className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] font-sans font-medium text-[#9E7D53] hover:text-[#1D1714] transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      <span>Back</span>
    </button>
  );

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
                {submitted === 'email' ? 'Your Email Is Ready!' : 'Booking Request Sent!'}
              </h4>
              <p className="text-xs sm:text-sm text-[#6A5F56] max-w-md mx-auto leading-relaxed">
                {submitted === 'email' ? (
                  <>Just fill in your answers and press <strong className="text-[#1D1714]">Send</strong>. </>
                ) : (
                  <>Thank you, <strong className="text-[#1D1714]">{fullName}</strong>. </>
                )}
                {firstName} reviews inquiries within 24 hours. If your date is coming soon, you can also message or call directly.
              </p>
              {submitted === 'email' && (
                <p className="text-[11px] text-[#6A5F56]">
                  Nothing opened? Write to{' '}
                  <span className="select-all font-medium text-[#1D1714] break-all">{BUSINESS_INFO.email}</span>
                </p>
              )}

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

              <button onClick={onClose} className="text-xs text-[#9E7D53] underline pt-4">
                Close Window
              </button>
            </div>
          ) : (
            <>
              {step === 'choose' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="font-serif text-xl text-[#1D1714]">How would you like to reach {firstName}?</h4>
                    {preselected && service && (
                      <p className="text-xs text-[#6A5F56]">
                        For: <span className="font-medium text-[#1D1714]">{service}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <button type="button" onClick={() => setStep('form')} className={optionClass}>
                      <span className="w-11 h-11 rounded-full bg-[#1D1714] text-[#C5A880] flex items-center justify-center shrink-0">
                        <ClipboardList className="w-5 h-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-[#1D1714]">Fill the Booking Form</span>
                        <span className="block text-[11px] text-[#6A5F56] leading-relaxed">
                          Share your date and details here. {firstName} gets back to you within 24 hours.
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#9E7D53] shrink-0" />
                    </button>

                    {/* Straight to the chat; closing a moment later leaves the site as it was on return */}
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => window.setTimeout(onClose, 0)}
                      className={optionClass}
                    >
                      <span className="w-11 h-11 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0">
                        <WhatsAppIcon className="w-5 h-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-[#1D1714]">Connect via WhatsApp</span>
                        <span className="block text-[11px] text-[#6A5F56] leading-relaxed">
                          Opens a chat with {firstName} straight away.
                        </span>
                      </span>
                      <ArrowUpRight className="w-4 h-4 text-[#9E7D53] shrink-0" />
                    </a>

                    <button type="button" onClick={() => setStep('email')} className={optionClass}>
                      <span className="w-11 h-11 rounded-full bg-[#F4EFEA] border border-[#E7DFD6] text-[#1D1714] flex items-center justify-center shrink-0">
                        <Mail className="w-5 h-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-[#1D1714]">Send via Email</span>
                        <span className="block text-[11px] text-[#6A5F56] leading-relaxed">
                          Pick your service and we&rsquo;ll write the email for you.
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#9E7D53] shrink-0" />
                    </button>
                  </div>
                </div>
              )}

              {step === 'form' && (
                <form onSubmit={handleDirectSubmit} className="space-y-4">
                  {backButton}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Your Name *</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Priya Sharma"
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Phone / WhatsApp *</label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. (404) 555-0192"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Email Address</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. priya@example.com"
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Event Date</label>
                      <input
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Requested Artistry Service *</label>
                    <select required value={service} onChange={(e) => setService(e.target.value)} className={inputClass}>
                      <option value="" disabled>Choose a service</option>
                      {lookOption && <option value={lookOption.value}>{lookOption.label}</option>}
                      {BOOKING_GROUPS.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.options.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Event Venue / City</label>
                    <input
                      type="text"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder="e.g. Atlanta, GA / The Estate"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Vision &amp; Notes</label>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Share outfit colors, preferred styles (e.g. Hollywood waves, fresh jasmine braid), or specific questions..."
                      className={`${inputClass} py-2`}
                    />
                  </div>

                  <div className="pt-2 space-y-2.5">
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
                </form>
              )}

              {step === 'email' && (
                <div className="space-y-4">
                  {backButton}

                  <div className="space-y-1">
                    <h4 className="font-serif text-xl text-[#1D1714]">Which service is your email about?</h4>
                    <p className="text-xs text-[#6A5F56] leading-relaxed">
                      We&rsquo;ll write the email for you with a few questions for that service. Just fill in your
                      answers and press Send.
                    </p>
                  </div>

                  <div role="radiogroup" aria-label="Service" className="space-y-4">
                    {lookOption && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{serviceRadio(lookOption)}</div>}
                    {BOOKING_GROUPS.map((g) => (
                      <div key={g.label} className="space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[#9E7D53]">{g.label}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{g.options.map(serviceRadio)}</div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleEmailSend}
                    disabled={!service}
                    className="w-full btn-gold py-3 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" />
                    <span>{service ? 'Write My Email' : 'Choose a service above'}</span>
                  </button>
                </div>
              )}

              <div className="text-center">
                <p className="text-[10px] text-[#6A5F56]">
                  Immediate questions? WhatsApp <a href={BUSINESS_INFO.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-[#1D1714] underline font-medium">{BUSINESS_INFO.phonePrimary}</a> ({BUSINESS_INFO.phonePrimaryCountry}) or <a href={BUSINESS_INFO.whatsappSecondaryUrl} target="_blank" rel="noopener noreferrer" className="text-[#1D1714] underline font-medium">{BUSINESS_INFO.phoneSecondary}</a> ({BUSINESS_INFO.phoneSecondaryCountry})
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <EmailChooser
        draft={emailChooser}
        onClose={() => setEmailChooser(null)}
        onChosen={() => setSubmitted('email')}
      />
    </div>
  );
};

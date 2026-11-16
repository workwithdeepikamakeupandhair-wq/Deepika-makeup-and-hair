/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Phone, MapPin, Instagram, Mail, Clock, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { BUSINESS_INFO, WHATSAPP_CONTACTS } from '../data/portfolioData';
import { BRIDAL_INQUIRY, EmailDraft, emailLinks } from '../data/inquiryEmail';
import { EmailChooser, chooserOnComputers } from './EmailChooser';
import { WhatsAppIcon } from './WhatsAppIcon';

const INQUIRY_MAILTO = emailLinks(BRIDAL_INQUIRY).mailto;

interface ContactAndFooterProps {
  onOpenBooking: () => void;
}

export const ContactAndFooter: React.FC<ContactAndFooterProps> = ({ onOpenBooking }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [emailChooser, setEmailChooser] = useState<EmailDraft | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = encodeURIComponent(
      `Hello Deepika,\n\nI am contacting you from your website:\n• Name: ${name}\n• Phone: ${phone}\n• Message: ${message}\n\nPlease let me know your availability.`
    );
    window.open(`${BUSINESS_INFO.whatsappUrl}?text=${text}`, '_blank');
    setSent(true);
  };

  return (
    <footer id="contact" className="bg-[#1D1714] text-[#FAF7F2] border-t border-[#3A322C]">
      {/* Contact Section */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-20 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          {/* Left Column: Business Identity & Direct Channels */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <p className="text-[10px] font-sans tracking-[0.25em] uppercase text-[#C5A880]">
                Bridal Inquiries &amp; Studio Bookings
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal leading-tight text-white">
                Begin Your Bridal <br />
                <span className="italic text-[#C5A880]">Artistry Experience</span>
              </h2>
            </div>

            <p className="text-xs sm:text-sm text-[#A89F93] leading-relaxed max-w-md font-sans">
              Currently accepting bookings for the 2026 and 2027 wedding seasons.
              Deepika S personally attends each bridal inquiry to craft your bespoke beauty schedule.
            </p>

            {/* Direct Contact Cards — both numbers are on WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {WHATSAPP_CONTACTS.map((c) => (
                <a
                  key={c.country}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-xl bg-[#2A221E] border border-[#453830] hover:border-[#C5A880] transition-colors flex items-center gap-3.5 group"
                >
                  <div className="w-10 h-10 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0">
                    <WhatsAppIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-sans tracking-wider text-[#A89F93]">
                      WhatsApp · {c.country}
                    </p>
                    <p className="text-xs font-semibold text-white group-hover:text-[#C5A880] transition-colors">
                      {c.number}
                    </p>
                  </div>
                </a>
              ))}

              {/* Opens a pre-written bridal inquiry email (same as the /bridal-inquiry page) */}
              <a
                href={INQUIRY_MAILTO}
                onClick={chooserOnComputers(() => setEmailChooser(BRIDAL_INQUIRY))}
                className="sm:col-span-2 p-4 rounded-xl bg-[#2A221E] border border-[#453830] hover:border-[#C5A880] transition-colors flex items-center gap-3.5 group"
              >
                <div className="w-10 h-10 rounded-full bg-[#C5A880] text-[#1D1714] flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-sans tracking-wider text-[#A89F93]">
                    Email · Bridal inquiry, ready to send
                  </p>
                  <p className="text-xs font-semibold text-white group-hover:text-[#C5A880] transition-colors break-all">
                    {BUSINESS_INFO.email}
                  </p>
                </div>
              </a>
            </div>

            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#A89F93]">
              <Phone className="w-3.5 h-3.5 text-[#C5A880] shrink-0" />
              <span>Prefer a call?</span>
              {WHATSAPP_CONTACTS.map((c) => (
                <a key={c.country} href={`tel:${c.tel}`} className="text-white hover:text-[#C5A880] hover:underline underline-offset-2">
                  {c.country} {c.number}
                </a>
              ))}
            </p>

            {/* Studio Hours & Location */}
            <div className="pt-4 border-t border-[#3A322C] space-y-2.5 text-xs text-[#A89F93]">
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-[#C5A880] shrink-0" />
                <span>Atlanta, Georgia, USA · Travel charges based on location</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-[#C5A880] shrink-0" />
                <span>Your date is confirmed after the advance payment</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Instagram className="w-4 h-4 text-[#C5A880] shrink-0" />
                <a
                  href={BUSINESS_INFO.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors underline"
                >
                  {BUSINESS_INFO.instagramHandle}
                </a>
              </div>
            </div>
          </div>

          {/* Right Column: Fast Inquiry Form */}
          <div className="lg:col-span-6 bg-[#251E1A] p-6 sm:p-8 rounded-2xl border border-[#3A322C]">
            <h3 className="font-serif text-2xl text-white mb-2">
              Send a Quick Inquiry
            </h3>
            <p className="text-xs text-[#A89F93] mb-6">
              Share your prospective wedding dates and our team will get back to you promptly.
            </p>

            {sent ? (
              <div className="p-6 bg-[#2A221E] rounded-xl border border-[#C5A880]/40 text-center space-y-3">
                <CheckCircle2 className="w-8 h-8 text-[#C5A880] mx-auto" />
                <p className="font-serif text-lg text-white">Inquiry Dispatched</p>
                <p className="text-xs text-[#A89F93]">
                  Thank you! WhatsApp conversation has been opened. You may also call us directly anytime.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-sans uppercase tracking-wider text-[#C5A880] mb-1.5 font-medium">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Radhika Iyer"
                    className="w-full px-3.5 py-2.5 bg-[#1D1714] border border-[#3A322C] rounded-xl text-xs text-white placeholder-[#786D65] focus:outline-none focus:border-[#C5A880]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-sans uppercase tracking-wider text-[#C5A880] mb-1.5 font-medium">
                    Phone / WhatsApp Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. (404) 555-0192"
                    className="w-full px-3.5 py-2.5 bg-[#1D1714] border border-[#3A322C] rounded-xl text-xs text-white placeholder-[#786D65] focus:outline-none focus:border-[#C5A880]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-sans uppercase tracking-wider text-[#C5A880] mb-1.5 font-medium">
                    Event Details &amp; Date
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Wedding date, events (e.g. Muhurtham, Sangeet, Reception), location..."
                    className="w-full px-3.5 py-2.5 bg-[#1D1714] border border-[#3A322C] rounded-xl text-xs text-white placeholder-[#786D65] focus:outline-none focus:border-[#C5A880]"
                  />
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    className="btn-primary w-full py-3 bg-[#C5A880] hover:bg-[#D4BA93] text-[#1D1714] font-sans text-xs uppercase tracking-[0.14em] font-semibold rounded-full shadow-md"
                  >
                    Send to WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={onOpenBooking}
                    className="w-full py-3 border border-[#453830] hover:border-white text-white font-sans text-xs uppercase tracking-[0.14em] font-medium rounded-full transition-colors text-center"
                  >
                    Detailed Schedule Form
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Bottom Bar: Copyright & Navigation */}
        <div className="mt-16 pt-8 border-t border-[#3A322C] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#A89F93]">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <span className="font-serif text-white font-medium">
              Deepika Makeup &amp; Hair
            </span>
            <span className="hidden sm:inline">·</span>
            <span>Atlanta, GA, USA</span>
            <span className="hidden sm:inline">·</span>
            <span>© {new Date().getFullYear()} All Rights Reserved.</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="#archive-gallery" className="hover:text-white transition-colors">
              3D Archive
            </a>
            <a href="#runway-lookbook" className="hover:text-white transition-colors">
              Runway Lookbook
            </a>
            <a href="#services" className="hover:text-white transition-colors">
              Services
            </a>
            <a href="/prices" className="hover:text-white transition-colors">
              Prices
            </a>
            <a href="#masterclass" className="hover:text-white transition-colors">
              Masterclass
            </a>
            <a
              href={BUSINESS_INFO.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C5A880] hover:underline flex items-center gap-1"
            >
              <span>Instagram</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      <EmailChooser draft={emailChooser} onClose={() => setEmailChooser(null)} />
    </footer>
  );
};

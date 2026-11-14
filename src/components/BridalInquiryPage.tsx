/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * /bridal-inquiry: the link for the Instagram bio. One tap on "Email My Inquiry" opens the bride's mail app with
 * Deepika's address, the subject and a fill-in-the-blanks message already written; she adds her details and sends.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Mail, Copy, Check, Instagram, ArrowUpRight } from 'lucide-react';
import { BUSINESS_INFO, WHATSAPP_CONTACTS } from '../data/portfolioData';
import { BRIDAL_INQUIRY, EmailDraft, INQUIRY_FIELDS, emailLinks } from '../data/inquiryEmail';
import { copyText } from '../clipboard';
import { EmailChooser, chooserOnComputers } from './EmailChooser';
import { WhatsAppIcon } from './WhatsAppIcon';

const INQUIRY_LINKS = emailLinks(BRIDAL_INQUIRY);

/** "Location (full address of …)" → ["Location", "full address of …"] */
function splitField(field: string): [string, string | null] {
  const at = field.indexOf(' (');
  return at === -1 ? [field, null] : [field.slice(0, at), field.slice(at + 2, -1)];
}

const STEPS = ['Tap the button', 'Fill in your details', 'Press send'];

export default function BridalInquiryPage() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [chooser, setChooser] = useState<EmailDraft | null>(null);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.title = `Bridal Inquiry | ${BUSINESS_INFO.name}`;
  }, []);

  const handleCopy = async () => {
    const ok = await copyText(BUSINESS_INFO.email);
    setCopyState(ok ? 'copied' : 'failed');
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), ok ? 2500 : 6000);
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1D1714] font-sans lg:grid lg:grid-cols-2">
      {/* Cover photo: on top on phones, a fixed left half on desktop */}
      <div className="relative h-[46vh] min-h-[320px] max-h-[560px] lg:max-h-none lg:h-screen lg:sticky lg:top-0">
        <img
          src="/images/portfolio/svc-bridal.jpg"
          alt="Bride in a cream silk saree with red embroidered blouse and temple jewellery, makeup and hair by Deepika"
          className="absolute inset-0 w-full h-full object-cover object-[50%_18%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1D1714]/35 via-transparent to-[#FAF7F2] lg:to-transparent" />
        <a
          href="/"
          className="absolute top-4 left-4 sm:top-6 sm:left-6 px-4 py-2 rounded-full bg-[#FAF7F2]/90 backdrop-blur-sm font-serif text-base font-medium text-[#1D1714] shadow-sm hover:bg-white transition-colors"
        >
          Deepika Makeup &amp; Hair
        </a>
        <a
          href={BUSINESS_INFO.instagram}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Instagram ${BUSINESS_INFO.instagramHandle}`}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 rounded-full bg-[#FAF7F2]/90 backdrop-blur-sm flex items-center justify-center text-[#1D1714] shadow-sm hover:bg-white transition-colors"
        >
          <Instagram className="w-[18px] h-[18px]" />
        </a>
      </div>

      <main className="relative -mt-14 lg:mt-0 px-4 sm:px-8 pb-14 lg:py-16 lg:flex lg:items-center">
        <div className="w-full max-w-md mx-auto space-y-8">
          <header className="text-center space-y-3">
            <p className="text-[10px] tracking-[0.25em] uppercase text-[#9E7D53] font-medium">
              Bridal Inquiries · 2026 &amp; 2027 Seasons
            </p>
            <h1 className="font-serif text-5xl sm:text-6xl font-normal leading-[0.95]">
              Bride to be
              <span className="block italic text-[#9E7D53]">with Deepika</span>
            </h1>
            <p className="text-sm text-[#6A5F56] leading-relaxed pt-1">
              Tap the button below and an email to Deepika opens with everything ready. Just fill in your
              details and press send. She replies within 24 hours.
            </p>
          </header>

          <ol className="flex items-start justify-center gap-2 sm:gap-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex-1 max-w-[120px] flex flex-col items-center gap-1.5 text-center">
                <span className="w-7 h-7 rounded-full border border-[#C5A880] text-[#9E7D53] font-serif text-sm flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-[11px] leading-snug text-[#6A5F56]">{step}</span>
              </li>
            ))}
          </ol>

          <div className="space-y-2.5">
            <a
              href={INQUIRY_LINKS.mailto}
              onClick={chooserOnComputers(() => setChooser(BRIDAL_INQUIRY))}
              className="btn-gold w-full py-4 rounded-full text-sm uppercase tracking-[0.16em] font-medium flex items-center justify-center gap-2.5 shadow-md"
            >
              <Mail className="w-5 h-5" />
              <span>Email My Inquiry</span>
            </a>
            <p className="text-[11px] text-center text-[#6A5F56]">
              Opens your mail app, addressed to
              <span className="block select-all font-medium text-[#1D1714] break-all">{BUSINESS_INFO.email}</span>
            </p>
          </div>

          <section className="bg-white rounded-2xl border border-[#E7DFD6] p-5 sm:p-6 space-y-4">
            <h2 className="font-serif text-xl font-medium">Your email will ask for</h2>
            <ul className="space-y-3">
              {INQUIRY_FIELDS.map((field) => {
                const [label, hint] = splitField(field);
                return (
                  <li key={field} className="flex gap-3 text-sm">
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[#C5A880] shrink-0" />
                    <span>
                      <span className="text-[#1D1714]">{label}</span>
                      {hint && <span className="block text-xs text-[#8A7E73] mt-0.5">{hint}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-3">
            <p className="text-xs text-center text-[#6A5F56]">Mail app didn't open?</p>
            <div className="grid grid-cols-2 gap-3">
              <a
                href={INQUIRY_LINKS.gmail}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 rounded-full border border-[#D9D0C5] bg-white text-xs uppercase tracking-[0.12em] font-medium flex items-center justify-center gap-1.5 hover:border-[#1D1714] transition-colors"
              >
                <span>Open in Gmail</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={handleCopy}
                className="py-3 rounded-full border border-[#D9D0C5] bg-white text-xs uppercase tracking-[0.12em] font-medium flex items-center justify-center gap-1.5 hover:border-[#1D1714] transition-colors"
              >
                {copyState === 'copied' ? (
                  <Check className="w-3.5 h-3.5 text-[#3B7A57]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copyState === 'copied' ? 'Copied' : 'Copy Email'}</span>
              </button>
            </div>
            <p role="status" className="text-[11px] text-center text-[#6A5F56] empty:hidden">
              {copyState === 'failed' && 'Could not copy here. Press and hold the email address above to copy it.'}
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-[#8A7E73]">
              <span className="flex-1 h-px bg-[#E7DFD6]" />
              <span>or message on WhatsApp</span>
              <span className="flex-1 h-px bg-[#E7DFD6]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {WHATSAPP_CONTACTS.map((c) => (
                <a
                  key={c.country}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 rounded-full bg-[#25D366] text-white text-xs uppercase tracking-[0.12em] font-medium flex items-center justify-center gap-2 hover:bg-[#1EBE5D] transition-colors"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>{c.country}</span>
                </a>
              ))}
            </div>
          </section>

          <footer className="pt-2 text-center text-xs text-[#6A5F56] space-y-1">
            <a href="/" className="inline-flex items-center gap-1 text-[#9E7D53] font-medium hover:underline underline-offset-2">
              View Deepika's portfolio <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <p>{BUSINESS_INFO.location} · Available for destination weddings</p>
          </footer>
        </div>
      </main>

      <EmailChooser draft={chooser} onClose={() => setChooser(null)} />
    </div>
  );
}

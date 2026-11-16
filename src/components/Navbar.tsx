/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Menu, X, Phone } from 'lucide-react';
import { BUSINESS_INFO, WHATSAPP_CONTACTS } from '../data/portfolioData';
import { WhatsAppIcon } from './WhatsAppIcon';
import { WhatsAppMenu } from './WhatsAppMenu';

interface NavbarProps {
  onOpenBooking: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenBooking }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: '3D Archive', href: '#archive-gallery' },
    { label: 'Services', href: '#services' },
    { label: 'Prices', href: '/prices' },
    { label: 'Masterclass', href: '#masterclass' },
    { label: 'Testimonials', href: '#testimonials' },
    { label: 'Contact', href: '#contact' },
    { label: 'Login', href: '/admin' },
  ];

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 ${
          scrolled
            ? 'translate-y-0 opacity-100 bg-[#FAF7F2]/95 backdrop-blur-md shadow-[0_4px_20px_rgba(29,23,20,0.06)] border-b border-[#E7DFD6]/80 py-3.5'
            : '-translate-y-full opacity-0 pointer-events-none py-3.5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex items-center justify-between gap-6">
          {/* Zone 1: Brand Wordmark (Single text element) */}
          <a
            href="#"
            className="text-xl sm:text-2xl font-serif tracking-tight font-medium text-[#1D1714] whitespace-nowrap shrink-0 hover:text-[#9E7D53] transition-colors"
          >
            Deepika Makeup &amp; Hair
          </a>

          {/* Zone 2: single-line nav links. Seven links only fit from xl (1280px) up; below that the menu button shows them. */}
          <nav className="hidden xl:flex items-center gap-5 text-[11px] tracking-[0.12em] uppercase font-sans font-medium text-[#6A5F56]">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="hover:text-[#1D1714] transition-colors relative py-1 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[1px] after:bg-[#C5A880] hover:after:w-full after:transition-all after:duration-300 whitespace-nowrap shrink-0"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <WhatsAppMenu
              className="hidden sm:block"
              buttonClassName="inline-flex items-center justify-center w-9 h-9 rounded-full border border-[#E7DFD6] text-[#25D366] hover:bg-[#25D366] hover:border-[#25D366] hover:text-white transition-colors"
              iconClassName="w-[18px] h-[18px]"
            />

            <button
              onClick={onOpenBooking}
              className="btn-gold px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.12em] font-sans font-medium whitespace-nowrap shrink-0"
            >
              Book Appointment
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-2 text-[#1D1714] hover:text-[#9E7D53] transition-colors"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 xl:hidden bg-[#1D1714]/40 backdrop-blur-sm">
          <div className="fixed top-[65px] right-0 bottom-0 w-[82%] max-w-sm bg-[#FAF7F2] p-6 shadow-2xl flex flex-col justify-between border-l border-[#E7DFD6] overflow-y-auto">
            <div className="space-y-6">
              <div className="pb-4 border-b border-[#E7DFD6]">
                <p className="text-[10px] tracking-[0.2em] uppercase font-sans text-[#9E7D53]">
                  Atlanta Bridal &amp; Editorial Artist
                </p>
                <p className="font-serif text-lg text-[#1D1714] mt-1">Deepika S</p>
              </div>

              <nav className="flex flex-col space-y-4">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-sans tracking-[0.1em] uppercase text-[#1D1714] hover:text-[#9E7D53] transition-colors py-1"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </div>

            <div className="pt-6 border-t border-[#E7DFD6] space-y-4">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenBooking();
                }}
                className="w-full btn-gold py-3 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium text-center block"
              >
                Book Appointment
              </button>

              <div className="flex flex-col gap-2 pt-2 text-xs text-[#6A5F56]">
                <a
                  href={`tel:${BUSINESS_INFO.phonePrimaryTel}`}
                  className="flex items-center gap-2 hover:text-[#1D1714]"
                >
                  <Phone className="w-3.5 h-3.5 text-[#C5A880]" />
                  <span>Call {BUSINESS_INFO.phonePrimaryCountry}: {BUSINESS_INFO.phonePrimary}</span>
                </a>
                <a
                  href={`tel:${BUSINESS_INFO.phoneSecondaryTel}`}
                  className="flex items-center gap-2 hover:text-[#1D1714]"
                >
                  <Phone className="w-3.5 h-3.5 text-[#C5A880]" />
                  <span>Call {BUSINESS_INFO.phoneSecondaryCountry}: {BUSINESS_INFO.phoneSecondary}</span>
                </a>
                {WHATSAPP_CONTACTS.map((c) => (
                  <a
                    key={c.country}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[#9E7D53] hover:underline"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    <span>WhatsApp {c.country}: {c.number}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

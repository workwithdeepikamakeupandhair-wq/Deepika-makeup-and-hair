/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowUpRight, MessageCircle, Phone, Sparkles } from 'lucide-react';
import { BUSINESS_INFO } from '../data/portfolioData';

interface HeroProps {
  onOpenBooking: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenBooking }) => {
  return (
    <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden bg-[#FAF7F2]">
      {/* Subtle paper grain / ambient tint */}
      <div className="absolute inset-0 bg-[radial-gradient(#C5A880_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.18] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8">
        {/* Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Typographic Hierarchy */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center gap-2.5 text-xs font-sans tracking-[0.18em] uppercase text-[#9E7D53]">
              <span className="w-6 h-[1px] bg-[#C5A880]" />
              <span>Deepika S · Atlanta Makeup Artist &amp; Educator</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#1D1714] font-normal leading-[1.12] tracking-[-0.015em] text-balance">
              Timeless Bridal Artistry, <br className="hidden sm:inline" />
              <span className="italic font-light text-[#9E7D53]">Weightless Skin</span> &amp; Modern Hair.
            </h1>

            <p className="text-base sm:text-lg text-[#6A5F56] font-sans font-normal leading-relaxed max-w-xl">
              Atlanta’s trusted luxury bridal artist for sacred morning Muhurthams,
              contemporary reception glamour, and hands-on masterclasses.
              Designed to look immaculate in person, flawless in 8K photography,
              and last throughout every emotional moment.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={onOpenBooking}
                className="btn-gold px-7 py-3.5 rounded-full text-xs uppercase tracking-[0.15em] font-sans font-medium flex items-center gap-2"
              >
                <span>Book an Appointment</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>

              <a
                href="#archive-gallery"
                className="btn-primary px-7 py-3.5 rounded-full text-xs uppercase tracking-[0.15em] font-sans font-medium bg-[#EFECE6] text-[#1D1714] border border-[#D9D0C5] hover:bg-[#E7DFD6] flex items-center gap-2"
              >
                <span>Curved 3D Archive</span>
              </a>

              <a
                href={BUSINESS_INFO.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] font-sans font-medium text-[#9E7D53] hover:text-[#1D1714] transition-colors py-2 px-1"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp: {BUSINESS_INFO.phonePrimary}</span>
              </a>
            </div>

            {/* Quick Contact & Location Notice */}
            <div className="pt-4 border-t border-[#E7DFD6]/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#6A5F56]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C5A880]" />
                <span className="font-medium text-[#1D1714]">Based in:</span>
                <span>Atlanta, Georgia (USA)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C5A880]" />
                <span className="font-medium text-[#1D1714]">Inquiries:</span>
                <a href={`tel:${BUSINESS_INFO.phoneSecondaryTel}`} className="hover:underline">
                  {BUSINESS_INFO.phoneSecondary}
                </a>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C5A880]" />
                <span>Available for Destination Weddings Worldwide</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual Container */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              {/* Outer decorative card shadow and border */}
              <div className="relative rounded-2xl overflow-hidden aspect-[4/5] shadow-[0_24px_50px_-15px_rgba(29,23,20,0.18)] border border-[#E7DFD6] bg-[#F4EFEA]">
                <img
                  src="/images/hero_bridal_artistry_1794045160273.jpg"
                  alt="Deepika Makeup and Hair Signature Luxury Indian Bridal Look in Atlanta"
                  className="w-full h-full object-cover object-top transition-transform duration-700 hover:scale-105"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />

                {/* Subtle vignette scrim */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1D1714]/70 via-transparent to-black/10" />

                {/* Floating caption overlay */}
                <div className="absolute bottom-6 left-6 right-6 text-white space-y-1">
                  <p className="text-[10px] tracking-[0.2em] uppercase font-sans text-[#E7DFD6]">
                    Signature Bride Collection · 2026
                  </p>
                  <p className="font-serif text-2xl tracking-wide text-[#FAF7F2]">
                    The Luminous Ivory Bride
                  </p>
                  <p className="text-xs text-white/80 font-sans font-light">
                    Dewy glass-skin base, champagne gold shimmer, diamond jewels &amp; royal veil anchoring.
                  </p>
                </div>
              </div>

              {/* Floating Award / Trust Badge */}
              <div className="absolute -bottom-5 -left-4 sm:-left-6 bg-[#FAF7F2] border border-[#E7DFD6] p-4 rounded-xl shadow-xl flex items-center gap-3.5 max-w-[260px]">
                <div className="w-10 h-10 rounded-full bg-[#1D1714] text-[#C5A880] flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-wide text-[#1D1714] uppercase">
                    500+ Brides Styled
                  </p>
                  <p className="text-[10px] text-[#6A5F56] font-sans leading-tight">
                    Top-rated South Asian bridal artist in Atlanta &amp; Southeast
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width Proof Strip (below hero split) */}
        <div className="mt-16 pt-8 border-t border-[#E7DFD6] grid grid-cols-2 md:grid-cols-4 gap-6 text-center sm:text-left">
          <div className="space-y-1">
            <p className="font-serif text-3xl sm:text-4xl text-[#1D1714] font-medium">10+</p>
            <p className="text-xs font-sans tracking-[0.12em] uppercase text-[#9E7D53] font-semibold">
              Years Experience
            </p>
            <p className="text-xs text-[#6A5F56]">
              Mastery across Indian &amp; western bridal styles
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-serif text-3xl sm:text-4xl text-[#1D1714] font-medium">16 hrs</p>
            <p className="text-xs font-sans tracking-[0.12em] uppercase text-[#9E7D53] font-semibold">
              Tearproof Longevity
            </p>
            <p className="text-xs text-[#6A5F56]">
              Sweat &amp; humidity resistant formulas
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-serif text-3xl sm:text-4xl text-[#1D1714] font-medium">100%</p>
            <p className="text-xs font-sans tracking-[0.12em] uppercase text-[#9E7D53] font-semibold">
              Custom Skin Match
            </p>
            <p className="text-xs text-[#6A5F56]">
              Precise undertone correction, zero ashy cast
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-serif text-3xl sm:text-4xl text-[#1D1714] font-medium">1-on-1</p>
            <p className="text-xs font-sans tracking-[0.12em] uppercase text-[#9E7D53] font-semibold">
              Masterclass Atelier
            </p>
            <p className="text-xs text-[#6A5F56]">
              Personalized education &amp; self-makeup
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

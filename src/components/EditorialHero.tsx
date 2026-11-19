/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BUSINESS_INFO } from '../data/portfolioData';
import { WhatsAppButton } from './WhatsAppButton';

interface EditorialHeroProps {
  onOpenBooking: () => void;
}

/** The tilted polaroid of a real bride: at the photo's lower right on phones, over the left column on computers. */
const Polaroid: React.FC<{ onOpenBooking: () => void; className: string; size: string }> = ({ onOpenBooking, className, size }) => (
  <div className={`anim-polaroid ${className}`}>
    <div
      className="group bg-white p-2 sm:p-3 rounded-[3px] shadow-[0_20px_40px_rgba(29,23,20,0.35)] cursor-pointer hover:scale-105 transition-transform duration-300"
      style={{ transform: 'rotate(-13deg)', transformOrigin: 'bottom left' }}
      onClick={onOpenBooking}
      title="Click to view bridal atelier details"
    >
      {/* Polaroid Photo: bride in silk saree with fresh jasmine strands */}
      <div className={`${size} aspect-[4/5] overflow-hidden rounded-[2px] bg-[#2A221E]`}>
        <img
          src="/images/portfolio/hero-polaroid-silk-jasmine.jpg"
          alt="Bride in magenta and teal silk saree with fresh jasmine strands and temple jewelry"
          className="w-full h-full object-cover"
          loading="eager"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Handwritten style caption */}
      <div className="pt-1.5 sm:pt-2 pb-0.5 px-1 text-center">
        <p className="font-serif italic text-[10px] leading-tight sm:text-sm sm:leading-normal text-[#1D1714] tracking-normal font-semibold">Traditional Silk &amp; Jasmine</p>
      </div>
    </div>
  </div>
);

/**
 * The bright hero: Deepika's portrait with no dark overlay, so the text is the site's dark brown.
 * - Computers: the photo fills the right 60% and its left edge fades into the wall colour behind the headline.
 * - Phones and tablets: the photo comes first, an upright crop with her face in the upper part, fading at the bottom
 *   into the page's cream. The headline, a short intro and the booking button follow below it, so nothing ever
 *   covers her face, whatever the screen height.
 */
export const EditorialHero: React.FC<EditorialHeroProps> = ({ onOpenBooking }) => {
  return (
    <section className="relative w-full lg:h-[100svh] overflow-hidden text-[#1D1714] flex flex-col lg:justify-between select-none bg-[#FAF7F2] lg:bg-[linear-gradient(to_bottom,#9C9A99,#A3A0A2_45%,#A6A3A8)]">
      {/* 1. Photo, shown as is. From Deepika's original portrait (VCC01747 in photos-originals/):
          hero-deepika-studio.jpg = full width, 4:3, head to lap; hero-deepika-phone.jpg = upright 9:16 around her.
          Phones: its own block (the text comes after it), the bottom fading into the cream. */}
      <div className="relative z-0 lg:absolute lg:inset-0 lg:left-auto lg:w-[60%]">
        <div className="h-[62svh] min-h-[400px] max-h-[720px] sm:h-[70svh] lg:h-full lg:min-h-0 lg:max-h-none [mask-image:linear-gradient(to_bottom,black_72%,transparent)] lg:[mask-image:linear-gradient(to_right,transparent,black_25%)]">
          <picture>
            <source media="(min-width: 1024px)" srcSet="/images/portfolio/hero-deepika-studio.jpg" />
            <img
              src="/images/portfolio/hero-deepika-phone.jpg"
              alt={`${BUSINESS_INFO.artist}, the makeup artist behind ${BUSINESS_INFO.name}, seated on a blush pink sofa`}
              className="w-full h-full object-cover object-[50%_0%] lg:object-[50%_20%]"
              loading="eager"
              referrerPolicy="no-referrer"
            />
          </picture>
        </div>
        {/* Phones: the polaroid at the photo's lower right, beside her hands and clear of her face */}
        <Polaroid onOpenBooking={onOpenBooking} className="lg:hidden absolute z-10 right-3 sm:right-10 bottom-16" size="w-[76px] sm:w-[120px]" />
      </div>

      {/* 2. Thin architectural grid lines (Exact proportions: 200.6/1155 and 843.6/1155, 405.2/767) */}
      <div className="absolute inset-0 pointer-events-none z-10 hidden lg:block">
        {/* Left vertical rule at ~17.37% */}
        <div
          className="absolute top-0 bottom-0 w-[1px] bg-[#1D1714]/10"
          style={{ left: '17.37%' }}
        />

        {/* Right vertical rule at ~73.04% */}
        <div
          className="absolute top-0 bottom-0 w-[1px] bg-[#1D1714]/10"
          style={{ left: '73.04%' }}
        />

        {/* Horizontal middle rule at ~52.83% */}
        <div
          className="absolute left-0 right-0 h-[1px] bg-[#1D1714]/10"
          style={{ top: '52.83%' }}
        />

        {/* Top rule under the navigation bar */}
        <div
          className="absolute left-0 right-0 h-[1px] bg-[#1D1714]/10"
          style={{ top: '78px' }}
        />
      </div>

      {/* 3. Top Navigation Bar (phones: over the top of the photo) */}
      <header className="absolute top-0 inset-x-0 lg:relative z-30 anim-drop-in w-full h-[68px] sm:h-[78px] px-5 sm:px-10 flex items-center justify-between gap-3 border-b border-[#1D1714]/10 lg:border-none backdrop-blur-sm lg:backdrop-blur-none bg-[#FAF7F2]/75 lg:bg-transparent">
        {/* Brand Logo: Italic Serif */}
        <a
          href="#"
          className="font-serif italic text-[22px] sm:text-3xl tracking-wide font-normal text-[#1D1714] hover:text-[#9E7D53] transition-colors whitespace-nowrap"
        >
          {BUSINESS_INFO.name}
        </a>

        {/* Navigation items & Action Buttons */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Text links only on wide screens so the full brand name always fits */}
          <nav className="hidden xl:flex items-center text-xs tracking-[0.16em] uppercase font-sans font-semibold text-[#1D1714]/85">
            <a href="#archive-gallery" className="hover:text-[#9E7D53] transition-colors px-3 py-1">
              3D Archive
            </a>
            <span className="text-[#1D1714]/25">|</span>
            <a href="#services" className="hover:text-[#9E7D53] transition-colors px-3 py-1">
              Services
            </a>
            <span className="text-[#1D1714]/25">|</span>
            <a href="#testimonials" className="hover:text-[#9E7D53] transition-colors px-3 py-1">
              Testimonials
            </a>
            <span className="text-[#1D1714]/25">|</span>
            <a href="#contact" className="hover:text-[#9E7D53] transition-colors px-3 py-1">
              Contact
            </a>
            <span className="text-[#1D1714]/25">|</span>
            <a href="/admin" className="hover:text-[#9E7D53] transition-colors px-3 py-1">
              Login
            </a>
          </nav>

          {/* Round Icon Buttons */}
          <div className="flex items-center gap-2.5">
            <WhatsAppButton
              buttonClassName="w-10 h-10 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#1EBE5D] hover:scale-105 flex items-center justify-center transition-all"
              iconClassName="w-5 h-5"
            />

            <button
              onClick={onOpenBooking}
              className="hidden sm:inline-flex btn-primary px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-semibold bg-[#1D1714] text-[#FAF7F2] hover:bg-[#2A221E] shadow-lg"
            >
              Book Consultation
            </button>
          </div>
        </div>
      </header>

      {/* 4. Main Grid Content Layout. Phones: below the photo, starting over its faded bottom edge. */}
      <div className="relative z-20 flex-1 grid grid-cols-1 lg:grid-cols-12 px-6 sm:px-10 -mt-14 sm:-mt-20 lg:mt-0 pb-2 lg:py-0 items-center">
        {/* Left Column (0% to ~17.37% on desktop): Stacked metadata */}
        <div className="lg:col-span-2 hidden lg:flex flex-col justify-between h-full pt-20 pb-16">
          <div className="space-y-1 text-[11px] font-sans tracking-[0.24em] uppercase text-[#5A3E26] font-semibold anim-fade-up">
            <p>ATLANTA</p>
            <p className="text-[#1D1714]/70">GEORGIA · USA</p>
            <p className="text-[#1D1714]/50">DESTINATIONS</p>
          </div>
        </div>

        {/* Center / Left Headline Column (~17.37% to ~73.04%). Phones: on the cream below the photo; computers:
            straight on the wall colour. On computers the type scales with the window, so the headline always ends
            before her face (about 60% across). */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-5 sm:space-y-6 lg:pl-10 lg:-translate-y-[8vh]">
          <div className="space-y-1 sm:space-y-2">
            {/* Sans headline line: "Timeless / Artistry for" */}
            <div className="overflow-hidden">
              <h1 className="anim-slide-up-1 font-sans text-[2.6rem] sm:text-6xl lg:text-[4.3vw] font-light text-[#1D1714] tracking-[-0.02em] leading-[1.05]">
                Timeless <br />
                <span className="font-extralight text-[#1D1714]/85">Artistry for</span>
              </h1>
            </div>

            {/* Giant Italic Serif line: "*The Sacred Bride*" */}
            <div className="overflow-hidden">
              <span className="anim-slide-up-2 inline-block font-serif italic text-[3.1rem] sm:text-7xl lg:text-[5.5vw] font-normal text-[#5A3E26] tracking-tight leading-[1] lg:leading-[0.95]">
                The Sacred Bride
              </span>
            </div>
          </div>

          <p className="anim-fade-up text-[15px] sm:text-base text-[#1D1714]/80 font-sans max-w-lg leading-relaxed lg:hidden">
            Atlanta’s premier luxury bridal artist. Exquisite traditional makeup, flawless dewy skin,
            and regal hair design created for sacred mornings and starlight receptions.
          </p>

          {/* Phones: the booking button (the header has room only for WhatsApp there) */}
          <button
            onClick={onOpenBooking}
            className="anim-fade-up sm:hidden btn-primary w-full py-3.5 rounded-full text-xs uppercase tracking-[0.16em] font-sans font-semibold bg-[#1D1714] text-[#FAF7F2] hover:bg-[#2A221E] shadow-lg"
          >
            Book Consultation
          </button>
        </div>
      </div>

      {/* 5. Bottom Zone: Tilted Polaroid + Stacked Label + Giant Watermark */}
      {/* Computers: room on the right for the floating Instagram and chat buttons */}
      <div className="relative z-20 w-full px-6 sm:px-10 lg:pr-28 pb-10 pt-5 lg:pb-6 lg:pt-4 flex flex-row items-end justify-center lg:justify-between gap-6">
        {/* Bottom-Left Stacked Label */}
        <div className="anim-fade-up hidden lg:block text-xs font-sans tracking-[0.22em] uppercase text-[#1D1714]/75 font-semibold space-y-0.5">
          <p>NEW</p>
          <p>SEASON</p>
          <p className="text-[#5A3E26]">COLLECTION</p>
        </div>

        {/* Tilted Polaroid (Tilted -13°, overlapping the left column line with shadow). Phones: on the photo instead. */}
        <Polaroid onOpenBooking={onOpenBooking} className="hidden lg:block z-30 lg:absolute lg:left-[10%] lg:bottom-7" size="w-[150px]" />

        {/* Quick Explorer Link at Bottom Right */}
        <div className="anim-fade-up flex items-center gap-4 text-xs tracking-[0.16em] uppercase font-sans font-semibold text-[#1D1714]/75">
          <a
            href="#archive-gallery"
            className="hover:text-[#1D1714] transition-colors flex items-center gap-1.5"
          >
            <span>Explore 3D Archive</span>
            <span className="text-[#9E7D53]">↓</span>
          </a>
        </div>
      </div>

      {/* 6. Giant faint italic watermark across the bottom: whole word in view. Soft white, which shows on both the
          grey wall and the darker parts of the photo (dark brown vanished over her vest). */}
      <div className="absolute bottom-0 left-0 right-0 z-1 pointer-events-none select-none overflow-hidden leading-none opacity-[0.3] hidden lg:flex justify-center">
        <span className="font-serif italic text-[clamp(6rem,22vw,19rem)] text-white tracking-[-0.04em] whitespace-nowrap translate-y-[6%]">
          Deepika
        </span>
      </div>
    </section>
  );
};

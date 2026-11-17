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

/** The photo's wall colour, top to bottom: the hero background continues it behind the headline. */
const WALL = 'linear-gradient(to bottom, #9C9A99, #A3A0A2 45%, #A6A3A8)';

/**
 * The bright hero: Deepika's portrait with no dark overlay, so the text is the site's dark brown. On computers the
 * photo fills the right 60% and its left edge fades into the wall colour behind the headline; on phones it fills
 * the screen (an upright crop with her face near the top) and the text sits on a frosted cream panel lower down.
 */
export const EditorialHero: React.FC<EditorialHeroProps> = ({ onOpenBooking }) => {
  return (
    <section
      className="relative w-full min-h-[100svh] lg:h-[100svh] overflow-hidden text-[#1D1714] flex flex-col justify-between select-none"
      style={{ background: WALL }}
    >
      {/* 1. Photo, shown as is. From Deepika's original portrait (VCC01747 in photos-originals/):
          hero-deepika-studio.jpg = full width, 4:3, head to lap; hero-deepika-phone.jpg = upright 9:16 around her. */}
      <div className="absolute inset-0 lg:left-auto lg:w-[60%] z-0 lg:[mask-image:linear-gradient(to_right,transparent,black_25%)]">
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

      {/* 3. Top Navigation Bar */}
      <header className="relative z-30 anim-drop-in w-full h-[78px] px-6 sm:px-10 flex items-center justify-between border-b border-[#1D1714]/10 lg:border-none backdrop-blur-sm lg:backdrop-blur-none bg-[#FAF7F2]/70 lg:bg-transparent">
        {/* Brand Logo: Italic Serif */}
        <a
          href="#"
          className="font-serif italic text-2xl sm:text-3xl tracking-wide font-normal text-[#1D1714] hover:text-[#9E7D53] transition-colors whitespace-nowrap"
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

      {/* 4. Main Grid Content Layout */}
      {/* Phones: the panel sits low (items-end) so her face near the top stays clear */}
      <div className="relative z-20 flex-1 grid grid-cols-1 lg:grid-cols-12 px-6 sm:px-10 py-6 lg:py-0 items-end lg:items-center">
        {/* Left Column (0% to ~17.37% on desktop): Stacked metadata */}
        <div className="lg:col-span-2 hidden lg:flex flex-col justify-between h-full pt-20 pb-16">
          <div className="space-y-1 text-[11px] font-sans tracking-[0.24em] uppercase text-[#5A3E26] font-semibold anim-fade-up">
            <p>ATLANTA</p>
            <p className="text-[#1D1714]/70">GEORGIA · USA</p>
            <p className="text-[#1D1714]/50">DESTINATIONS</p>
          </div>
        </div>

        {/* Center / Left Headline Column (~17.37% to ~73.04%). Phones: a frosted cream panel, since the text
            overlaps the photo there; computers: straight on the wall colour. On computers the type scales with the
            window, so the headline always ends before her face (about 60% across). */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-6 lg:pl-10 lg:-translate-y-[8vh] rounded-2xl bg-[#FAF7F2]/75 backdrop-blur-sm p-5 sm:p-7 lg:bg-transparent lg:backdrop-blur-none lg:p-0 lg:rounded-none">
          <div className="space-y-2">
            {/* Sans headline line: "Timeless / Artistry for" */}
            <div className="overflow-hidden">
              <h1 className="anim-slide-up-1 font-sans text-4xl sm:text-6xl lg:text-[4.3vw] font-light text-[#1D1714] tracking-[-0.02em] leading-[1.05]">
                Timeless <br />
                <span className="font-extralight text-[#1D1714]/85">Artistry for</span>
              </h1>
            </div>

            {/* Giant Italic Serif line: "*The Sacred Bride*" */}
            <div className="overflow-hidden">
              <span className="anim-slide-up-2 inline-block font-serif italic text-5xl sm:text-7xl lg:text-[5.5vw] font-normal text-[#5A3E26] tracking-tight leading-[0.95]">
                The Sacred Bride
              </span>
            </div>
          </div>

          <p className="anim-fade-up text-sm sm:text-base text-[#1D1714]/80 font-sans max-w-lg leading-relaxed lg:hidden">
            Atlanta’s premier luxury bridal artist. Exquisite traditional makeup, flawless dewy skin,
            and regal hair design created for sacred mornings and starlight receptions.
          </p>
        </div>
      </div>

      {/* 5. Bottom Zone: Tilted Polaroid + Stacked Label + Giant Watermark */}
      <div className="relative z-20 w-full px-6 sm:px-10 pb-6 pt-4 flex flex-col sm:flex-row items-end justify-between gap-6">
        {/* Bottom-Left Stacked Label */}
        <div className="anim-fade-up hidden lg:block text-xs font-sans tracking-[0.22em] uppercase text-[#1D1714]/75 font-semibold space-y-0.5">
          <p>NEW</p>
          <p>SEASON</p>
          <p className="text-[#5A3E26]">COLLECTION</p>
        </div>

        {/* Tilted Polaroid (Tilted -13°, overlapping the left column line with shadow) */}
        <div className="anim-polaroid relative z-30 lg:absolute lg:left-[10%] lg:bottom-7">
          <div
            className="group bg-white p-2.5 sm:p-3 rounded-[3px] shadow-[0_20px_40px_rgba(29,23,20,0.35)] cursor-pointer hover:scale-105 transition-transform duration-300"
            style={{
              transform: 'rotate(-13deg)',
              transformOrigin: 'bottom left'
            }}
            onClick={onOpenBooking}
            title="Click to view bridal atelier details"
          >
            {/* Polaroid Photo: bride in silk saree with fresh jasmine strands */}
            <div className="w-[120px] sm:w-[150px] aspect-[4/5] overflow-hidden rounded-[2px] bg-[#2A221E]">
              <img
                src="/images/portfolio/hero-polaroid-silk-jasmine.jpg"
                alt="Bride in magenta and teal silk saree with fresh jasmine strands and temple jewelry"
                className="w-full h-full object-cover"
                loading="eager"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Handwritten style caption */}
            <div className="pt-2 pb-0.5 px-1 text-center">
              <p className="font-serif italic text-xs sm:text-sm text-[#1D1714] tracking-normal font-semibold">
                Traditional Silk &amp; Jasmine
              </p>
            </div>
          </div>
        </div>

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
      <div className="absolute bottom-0 left-0 right-0 z-1 pointer-events-none select-none overflow-hidden leading-none opacity-[0.3] flex justify-center">
        <span className="font-serif italic text-[clamp(6rem,22vw,19rem)] text-white tracking-[-0.04em] whitespace-nowrap translate-y-[6%]">
          Deepika
        </span>
      </div>
    </section>
  );
};

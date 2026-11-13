/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BUSINESS_INFO } from '../data/portfolioData';
import { WhatsAppMenu } from './WhatsAppMenu';

interface EditorialHeroProps {
  onOpenBooking: () => void;
}

export const EditorialHero: React.FC<EditorialHeroProps> = ({ onOpenBooking }) => {
  return (
    <section className="relative w-full min-h-[100svh] lg:h-[100svh] overflow-hidden bg-[#3B2F5C] text-white flex flex-col justify-between select-none">
      {/* 1. Full-Bleed Editorial Background Image */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/hero_traditional_sunset_1794050131648.jpg"
          alt="Traditional Indian bride with radiant bridal makeup, jewelry, and jasmine hair under lilac and peach sunset sky"
          className="w-full h-full object-cover object-[center_28%] scale-100 transition-transform duration-1000 ease-out"
          loading="eager"
          referrerPolicy="no-referrer"
        />

        {/* Cinematic gradient scrims for text contrast and editorial mood */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#251A38]/90 via-[#251A38]/20 to-black/35 pointer-events-none" />
        <div className="absolute inset-0 bg-radial from-transparent via-transparent to-[#1F172E]/60 pointer-events-none" />
      </div>

      {/* 2. Thin White Architectural Grid Lines (Exact proportions: 200.6/1155 and 843.6/1155, 405.2/767) */}
      <div className="absolute inset-0 pointer-events-none z-10 hidden lg:block">
        {/* Left vertical rule at ~17.37% */}
        <div
          className="absolute top-0 bottom-0 w-[1px] bg-white/20"
          style={{ left: '17.37%' }}
        />

        {/* Right vertical rule at ~73.04% */}
        <div
          className="absolute top-0 bottom-0 w-[1px] bg-white/20"
          style={{ left: '73.04%' }}
        />

        {/* Horizontal middle rule at ~52.83% */}
        <div
          className="absolute left-0 right-0 h-[1px] bg-white/20"
          style={{ top: '52.83%' }}
        />

        {/* Top rule under the navigation bar */}
        <div
          className="absolute left-0 right-0 h-[1px] bg-white/20"
          style={{ top: '78px' }}
        />
      </div>

      {/* 3. Top Navigation Bar */}
      <header className="relative z-30 anim-drop-in w-full h-[78px] px-6 sm:px-10 flex items-center justify-between border-b border-white/20 lg:border-none backdrop-blur-xs lg:backdrop-blur-none bg-[#1F172E]/25 lg:bg-transparent">
        {/* Brand Logo: Italic Serif */}
        <a
          href="#"
          className="font-serif italic text-2xl sm:text-3xl tracking-wide font-normal text-white hover:text-[#F4B8A2] transition-colors whitespace-nowrap"
        >
          {BUSINESS_INFO.name}
        </a>

        {/* Navigation items & Glass Action Buttons */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Text links only on wide screens so the full brand name always fits */}
          <nav className="hidden xl:flex items-center text-xs tracking-[0.16em] uppercase font-sans font-medium text-white/90">
            <a href="#archive-gallery" className="hover:text-[#F4B8A2] transition-colors px-3 py-1">
              3D Archive
            </a>
            <span className="text-white/30">|</span>
            <a href="#services" className="hover:text-[#F4B8A2] transition-colors px-3 py-1">
              Services
            </a>
            <span className="text-white/30">|</span>
            <a href="#testimonials" className="hover:text-[#F4B8A2] transition-colors px-3 py-1">
              Testimonials
            </a>
            <span className="text-white/30">|</span>
            <a href="#contact" className="hover:text-[#F4B8A2] transition-colors px-3 py-1">
              Contact
            </a>
            <span className="text-white/30">|</span>
            <a href="/admin" className="hover:text-[#F4B8A2] transition-colors px-3 py-1">
              Login
            </a>
          </nav>

          {/* Round Glass Icon Buttons */}
          <div className="flex items-center gap-2.5">
            <WhatsAppMenu
              buttonClassName="w-10 h-10 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#1EBE5D] hover:scale-105 flex items-center justify-center transition-all"
              iconClassName="w-5 h-5"
            />

            <button
              onClick={onOpenBooking}
              className="hidden sm:inline-flex btn-primary px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-semibold bg-white text-[#1D1714] hover:bg-[#FAF7F2] shadow-lg"
            >
              Book Consultation
            </button>
          </div>
        </div>
      </header>

      {/* 4. Main Grid Content Layout */}
      <div className="relative z-20 flex-1 grid grid-cols-1 lg:grid-cols-12 px-6 sm:px-10 py-6 lg:py-0 items-center">
        {/* Left Column (0% to ~17.37% on desktop): Stacked metadata or mobile kicker */}
        <div className="lg:col-span-2 hidden lg:flex flex-col justify-between h-full pt-20 pb-16">
          <div className="space-y-1 text-[11px] font-sans tracking-[0.24em] uppercase text-[#F4B8A2] font-semibold anim-fade-up">
            <p>ATLANTA</p>
            <p className="text-white/70">GEORGIA · USA</p>
            <p className="text-white/50">DESTINATIONS</p>
          </div>
        </div>

        {/* Center / Left Headline Column (~17.37% to ~73.04%) */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-6 lg:pl-10">
          <div className="space-y-2">
            {/* Sans headline line: "Timeless / Artistry for" */}
            <div className="overflow-hidden">
              <h1 className="anim-slide-up-1 font-sans text-4xl sm:text-6xl lg:text-7xl xl:text-8xl font-light text-white tracking-[-0.02em] leading-[1.05]">
                Timeless <br />
                <span className="font-extralight text-white/90">Artistry for</span>
              </h1>
            </div>

            {/* Giant Italic Serif line: "*The Sacred Bride*" */}
            <div className="overflow-hidden">
              <span className="anim-slide-up-2 inline-block font-serif italic text-5xl sm:text-7xl lg:text-8xl xl:text-9xl font-normal text-[#F4B8A2] tracking-tight leading-[0.95]">
                The Sacred Bride
              </span>
            </div>
          </div>

          <p className="anim-fade-up text-sm sm:text-base text-white/85 font-sans font-light max-w-lg leading-relaxed lg:hidden">
            Atlanta’s premier luxury bridal artist. Exquisite traditional makeup, flawless dewy skin,
            and regal hair design created for sacred mornings and starlight receptions.
          </p>
        </div>
      </div>

      {/* 5. Bottom Zone: Tilted Polaroid + Stacked Label + Giant Watermark */}
      <div className="relative z-20 w-full px-6 sm:px-10 pb-6 pt-4 flex flex-col sm:flex-row items-end justify-between gap-6">
        {/* Bottom-Left Stacked Label */}
        <div className="anim-fade-up hidden lg:block text-xs font-sans tracking-[0.22em] uppercase text-white/80 font-medium space-y-0.5">
          <p>NEW</p>
          <p>SEASON</p>
          <p className="text-[#F4B8A2]">COLLECTION</p>
        </div>

        {/* Tilted Polaroid (Tilted -13°, overlapping the left column line with shadow) */}
        <div className="anim-polaroid relative z-30 lg:absolute lg:left-[10%] lg:bottom-7">
          <div
            className="group bg-white p-2.5 sm:p-3 rounded-[3px] shadow-[0_20px_40px_rgba(15,10,25,0.6)] cursor-pointer hover:scale-105 transition-transform duration-300"
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
        <div className="anim-fade-up flex items-center gap-4 text-xs tracking-[0.16em] uppercase font-sans text-white/70">
          <a
            href="#archive-gallery"
            className="hover:text-white transition-colors flex items-center gap-1.5"
          >
            <span>Explore 3D Archive</span>
            <span className="text-[#F4B8A2]">↓</span>
          </a>
        </div>
      </div>

      {/* 6. Giant Faint Italic Watermark across the bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-1 pointer-events-none select-none overflow-hidden leading-none opacity-[0.09] flex justify-center">
        <span className="font-serif italic text-[clamp(6rem,22vw,19rem)] text-white tracking-[-0.04em] whitespace-nowrap translate-y-[22%]">
          Deepika
        </span>
      </div>
    </section>
  );
};

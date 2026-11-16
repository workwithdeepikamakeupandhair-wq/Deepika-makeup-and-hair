/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import {
  BRIDAL_PACKAGE,
  EXPERIENCE_STATS,
  formatPrice,
  PRICE_TIERS,
  SENIOR_ARTIST_SERVICES,
  ServiceItem,
} from '../data/portfolioData';
import { PackageList } from './PackageList';

/** Home page price list: Deepika's own packages, with a pointer to the senior artist's prices on /prices. */

interface ServicesSectionProps {
  onSelectServiceForBooking: (service: ServiceItem) => void;
}

const [DEEPIKA_TIER] = PRICE_TIERS;
const seniorFrom = Math.min(...SENIOR_ARTIST_SERVICES.filter((s) => s.category === 'bridal').map((s) => s.price));

export const ServicesSection: React.FC<ServicesSectionProps> = ({ onSelectServiceForBooking }) => (
  <section id="services" className="py-20 bg-[#FAF7F2] border-t border-[#E7DFD6]">
    <div className="max-w-6xl mx-auto px-5 sm:px-8 space-y-14">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Packages &amp; Prices</span>
        </div>
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#1D1714]">
          Bridal &amp; Non-Bridal Packages
        </h2>
        <p className="text-xs sm:text-sm text-[#6A5F56] font-sans leading-relaxed">
          Every bridal package is thoughtfully designed to match your event ({BRIDAL_PACKAGE.events}), your skin type
          and your dream vision. Prices below are for makeup by Deepika herself.
        </p>
        <dl className="pt-2 grid grid-cols-3 gap-3 max-w-lg mx-auto">
          {EXPERIENCE_STATS.map((s) => (
            <div key={s.label}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-serif text-2xl sm:text-3xl text-[#1D1714]">{s.value}</dd>
              <dd className="text-[10px] sm:text-[11px] font-sans uppercase tracking-wider text-[#9E7D53] leading-tight">
                {s.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <PackageList tier={DEEPIKA_TIER} onBook={onSelectServiceForBooking} />

      {/* Senior artist prices live on the full price list */}
      <div className="rounded-2xl bg-[#1D1714] text-[#FAF7F2] p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <p className="text-[11px] font-sans uppercase tracking-[0.18em] text-[#C5A880] font-semibold">
            Senior artist packages
          </p>
          <p className="font-serif text-2xl sm:text-3xl leading-snug">
            Bridal makeup with a senior artist from {formatPrice(seniorFrom)}
          </p>
          <p className="text-xs text-[#D9D0C5]">
            HD, Advanced and Airbrush bridal packages, each with one hairstyling and one saree draping.
          </p>
        </div>
        <a
          href="/prices?artist=senior"
          className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#FAF7F2] text-[#1D1714] hover:bg-white text-xs uppercase tracking-[0.14em] font-sans font-semibold transition-colors"
        >
          <span>See All Prices</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  </section>
);

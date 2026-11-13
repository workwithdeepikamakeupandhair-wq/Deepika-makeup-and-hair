/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, Clock, Check, ArrowRight, ChevronDown } from 'lucide-react';
import { SERVICES, ServiceItem } from '../data/portfolioData';

/** Cards shown before "View more services" (two rows of three on desktop). */
const VISIBLE_COUNT = 6;

type Filter = 'all' | 'bridal' | 'events' | 'education';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All Services' },
  { id: 'bridal', label: 'Bridal' },
  { id: 'events', label: 'Parties & Events' },
  { id: 'education', label: 'Classes' },
];
/** Fade behind the card's text block only: clear at its top edge, dark enough behind the words to read. */
const TEXT_FADE =
  'linear-gradient(to bottom, rgba(20,15,12,0) 0%, rgba(20,15,12,0.6) 22%, rgba(20,15,12,0.86) 45%, rgba(20,15,12,0.9) 100%)';

const CATEGORY_LABEL: Record<ServiceItem['category'], string> = {
  bridal: 'Bridal',
  events: 'Parties & Events',
  education: 'Classes',
};

interface ServicesSectionProps {
  onSelectServiceForBooking: (service: ServiceItem) => void;
  onOpenBooking: () => void;
}

export const ServicesSection: React.FC<ServicesSectionProps> = ({
  onSelectServiceForBooking,
  onOpenBooking
}) => {
  const [activeFilter, setActiveFilter] = useState<Filter>('all');
  const [showAll, setShowAll] = useState(false);
  /** Which cards have their "What's included" dropdown open. */
  const [openIncludes, setOpenIncludes] = useState<Record<string, boolean>>({});
  const toggleIncludes = (id: string) => setOpenIncludes((o) => ({ ...o, [id]: !o[id] }));

  const filteredServices = SERVICES.filter(
    service => activeFilter === 'all' || service.category === activeFilter
  );
  const visibleServices = showAll ? filteredServices : filteredServices.slice(0, VISIBLE_COUNT);
  const hiddenCount = filteredServices.length - VISIBLE_COUNT;

  const selectFilter = (filter: Filter) => {
    setActiveFilter(filter);
    setShowAll(false);
  };

  return (
    <section id="services" className="py-20 bg-[#FAF7F2] border-t border-[#E7DFD6]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Our Services</span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#1D1714]">
            Makeup &amp; Hair for Every Occasion
          </h2>
          <p className="text-xs sm:text-sm text-[#6A5F56] font-sans">
            Bridal, party and photoshoot makeup, plus makeup classes. Every look is planned around your outfit,
            skin tone and event timing.
          </p>

          {/* Filter tabs */}
          <div className="inline-flex flex-wrap justify-center items-center p-1 bg-[#EFECE6] rounded-full border border-[#D9D0C5] mt-6">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => selectFilter(f.id)}
                aria-pressed={activeFilter === f.id}
                className={`px-4 py-1.5 text-xs font-sans tracking-wider uppercase rounded-full transition-colors ${
                  activeFilter === f.id
                    ? 'bg-[#1D1714] text-[#FAF7F2] shadow-xs font-medium'
                    : 'text-[#6A5F56] hover:text-[#1D1714]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Services Grid */}
        {/* items-start: opening one card's dropdown grows only that card */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
          {visibleServices.map(service => {
            const isOpen = !!openIncludes[service.id];
            const panelId = `includes-${service.id}`;
            return (
              <div
                key={service.id}
                className="group relative h-[480px] overflow-hidden rounded-2xl border border-[#E7DFD6] bg-[#2A221E] transition-all duration-300 hover:shadow-[0_16px_36px_-10px_rgba(29,23,20,0.4)] hover:-translate-y-1"
              >
                {/* Full-card photo */}
                <img
                  src={service.image}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover object-[center_20%] transition-transform duration-700 group-hover:scale-105"
                />

                <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2 text-[10px] font-sans">
                  <span className="px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-sm uppercase tracking-[0.16em] font-semibold text-[#9E7D53] shadow-sm">
                    {CATEGORY_LABEL[service.category]}
                  </span>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-sm text-[#1D1714] shadow-sm shrink-0">
                    <Clock className="w-3 h-3 text-[#9E7D53]" />
                    {service.duration}
                  </span>
                </div>

                {/* Text block at the bottom. Its own fade starts clear and darkens only behind the text, so
                    the rest of the photo stays bright; opening the dropdown grows it upward over the photo. */}
                <div
                  className="absolute inset-x-0 bottom-0 px-5 pb-5 pt-20 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]"
                  style={{ background: TEXT_FADE }}
                >
                  <h3 className="font-serif text-2xl text-white font-medium leading-snug">
                    {service.title}
                  </h3>

                  <p className="mt-1.5 text-xs text-white/90 font-sans leading-relaxed">
                    {service.description}
                  </p>

                  <p className="mt-1.5 text-[11px] text-white font-sans font-medium italic [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]">
                    Ideal for: {service.recommendedFor}
                  </p>

                  {/* What's included — dropdown */}
                  <div className="mt-3 border-t border-white/20">
                    <button
                      type="button"
                      onClick={() => toggleIncludes(service.id)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className="w-full flex items-center justify-between py-2.5 text-[11px] font-sans uppercase tracking-[0.14em] font-semibold text-[#EBD9BC] hover:text-white transition-colors"
                    >
                      <span>What&apos;s Included</span>
                      <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <div
                      id={panelId}
                      className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                    >
                      <ul className="overflow-hidden space-y-1" aria-hidden={!isOpen}>
                        {service.includes.map((inc, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-white/90">
                            <Check className="w-3.5 h-3.5 text-[#C5A880] shrink-0 mt-0.5" />
                            <span>{inc}</span>
                          </li>
                        ))}
                        <li aria-hidden="true" className="h-2" />
                      </ul>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onSelectServiceForBooking(service);
                      onOpenBooking();
                    }}
                    className="mt-1 w-full py-2 rounded-full bg-[#FAF7F2] text-[#1D1714] hover:bg-white text-xs uppercase tracking-[0.12em] font-sans font-semibold flex items-center justify-center gap-2 transition-colors [text-shadow:none]"
                  >
                    <span>Book This Service</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* View more / fewer */}
        {hiddenCount > 0 && (
          <div className="mt-8 text-center">
            <button
              onClick={() => setShowAll((s) => !s)}
              aria-expanded={showAll}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-[#1D1714] text-[#1D1714] text-xs uppercase tracking-[0.14em] font-sans font-medium hover:bg-[#1D1714] hover:text-[#FAF7F2] transition-colors"
            >
              <span>{showAll ? 'Show fewer services' : `View more services (${hiddenCount})`}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

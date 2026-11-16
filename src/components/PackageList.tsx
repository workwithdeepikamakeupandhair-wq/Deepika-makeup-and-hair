/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One price list (Deepika's or the senior artist's), split into two tabs: "Bridal Makeup Packages" (with what every
 * bridal package includes) and "Non-Bridal Makeup Packages" (family glam, groom and separate charges). Every package
 * is a full-photo card: the photo fills the card, the text sits at the bottom over a fade, and the ✔ list opens
 * from "What's Included". Travel and booking policy show under either tab. Used on the home page and on /prices.
 */
import React, { useId, useState } from 'react';
import { Check, ArrowRight, Star, Minus, MapPin, CalendarCheck, ChevronDown } from 'lucide-react';
import {
  BOOKING_POLICY,
  BRIDAL_PACKAGE,
  formatPrice,
  PriceTier,
  SEPARATE_CHARGES_IMAGE,
  ServiceItem,
  TRAVEL_POLICY,
} from '../data/portfolioData';

interface PackageListProps {
  tier: PriceTier;
  onBook: (service: ServiceItem) => void;
}

type Group = 'bridal' | 'family';
/** `short` keeps both tabs on one line on phones */
const GROUPS: { id: Group; label: string; short: string }[] = [
  { id: 'bridal', label: 'Bridal Makeup Packages', short: 'Bridal Packages' },
  { id: 'family', label: 'Non-Bridal Makeup Packages', short: 'Non-Bridal Packages' },
];

/** Fade behind the card's text block only: clear at its top edge, dark enough behind the words to read. */
const TEXT_FADE =
  'linear-gradient(to bottom, rgba(20,15,12,0) 0%, rgba(20,15,12,0.6) 22%, rgba(20,15,12,0.86) 45%, rgba(20,15,12,0.9) 100%)';

export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "a, b or c" */
const orList = (items: string[]) => items.join(', ').replace(/, ([^,]*)$/, ' or $1');

const FeatureList: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="space-y-1.5">
    {items.map((item) => (
      <li key={item} className="flex items-start gap-2 text-xs sm:text-[13px] text-[#4A3F38] leading-snug">
        <Check className="w-3.5 h-3.5 text-[#9E7D53] shrink-0 mt-0.5" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

/**
 * Full-photo card: the photo fills the card, chips on top, text block at the bottom over a fade. Without a photo
 * (the senior artist's list) the same content sits on a plain dark card.
 */
const PhotoCard: React.FC<{
  image?: string;
  chip: string;
  badge?: string;
  highlight?: boolean;
  children: React.ReactNode;
}> = ({ image, chip, badge, highlight = false, children }) => (
  <article
    className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 hover:shadow-[0_16px_36px_-10px_rgba(29,23,20,0.4)] hover:-translate-y-1 ${
      image ? 'h-[480px] bg-[#2A221E]' : 'bg-gradient-to-b from-[#3A2E27] to-[#1D1714]'
    } ${highlight ? 'border-[#C5A880] ring-2 ring-[#C5A880]' : 'border-[#E7DFD6]'}`}
  >
    {image && (
      <img
        src={image}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover object-[center_20%] transition-transform duration-700 group-hover:scale-105"
      />
    )}

    <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2 text-[10px] font-sans">
      <span className="px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-sm uppercase tracking-[0.16em] font-semibold text-[#9E7D53] shadow-sm">
        {chip}
      </span>
      {badge && (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1D1714]/90 text-[#EBD9BC] uppercase tracking-[0.14em] font-semibold shadow-sm shrink-0">
          <Star className="w-3 h-3 fill-[#C5A880] text-[#C5A880]" />
          {badge}
        </span>
      )}
    </div>

    {/* Text block at the bottom. Its own fade starts clear and darkens only behind the text, so the rest of the
        photo stays bright; opening "What's Included" grows it upward over the photo. */}
    <div
      className={`${image ? 'absolute inset-x-0 bottom-0' : 'relative'} px-5 pb-5 pt-20 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]`}
      style={image ? { background: TEXT_FADE } : undefined}
    >
      {children}
    </div>
  </article>
);

export const PackageList: React.FC<PackageListProps> = ({ tier, onBook }) => {
  const [group, setGroup] = useState<Group>('bridal');
  /** Which cards have their "What's Included" dropdown open */
  const [openIncludes, setOpenIncludes] = useState<Record<string, boolean>>({});
  const idBase = useId();

  const bridal = tier.services.filter((s) => s.category === 'bridal');
  const family = tier.services.filter((s) => s.category === 'family');
  const single = tier.services.filter((s) => s.category === 'single');
  // Photos only where the list has them (Deepika's), so the separate-charges card matches its neighbours
  const withPhotos = tier.services.some((s) => s.image);

  const bookButton = (service: ServiceItem) => (
    <button
      type="button"
      onClick={() => onBook(service)}
      className="mt-1 w-full py-2 rounded-full bg-[#FAF7F2] text-[#1D1714] hover:bg-white text-xs uppercase tracking-[0.12em] font-sans font-semibold flex items-center justify-center gap-2 transition-colors [text-shadow:none]"
    >
      <span>Book This Package</span>
      <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );

  const packageCard = (service: ServiceItem) => {
    const isOpen = !!openIncludes[service.id];
    const panelId = `${idBase}-includes-${service.id}`;
    return (
      <PhotoCard
        key={service.id}
        image={service.image}
        chip={service.category === 'bridal' ? 'Bridal' : 'Non-Bridal'}
        badge={service.badge}
        highlight={Boolean(service.badge)}
      >
        <h3 className="font-serif text-2xl text-white font-medium leading-snug">{service.title}</h3>
        <p className="font-serif text-3xl text-[#EBD9BC] leading-tight">{formatPrice(service.price)}</p>

        {service.forWhom && (
          <p className="mt-1.5 text-xs text-white/90 font-sans leading-relaxed">{service.forWhom}</p>
        )}
        {service.idealFor && (
          <p className="mt-1.5 text-[11px] text-white font-sans font-medium italic [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]">
            Ideal for: {service.idealFor}
          </p>
        )}

        {/* What's included — dropdown */}
        <div className="mt-3 border-t border-white/20">
          <button
            type="button"
            onClick={() => setOpenIncludes((o) => ({ ...o, [service.id]: !o[service.id] }))}
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
              {service.features.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-white/90">
                  <Check className="w-3.5 h-3.5 text-[#C5A880] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
              <li aria-hidden="true" className="h-2" />
            </ul>
          </div>
        </div>

        {bookButton(service)}
      </PhotoCard>
    );
  };

  return (
    <div className="space-y-10">
      {/* Bridal | Non-Bridal */}
      <div className="flex flex-col items-center gap-2">
        <div
          role="tablist"
          aria-label="Packages"
          className="inline-flex flex-wrap justify-center items-center p-1 bg-[#EFECE6] rounded-full border border-[#D9D0C5]"
        >
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              id={`${idBase}-tab-${g.id}`}
              aria-selected={group === g.id}
              aria-controls={`${idBase}-panel`}
              onClick={() => setGroup(g.id)}
              className={`px-3.5 sm:px-5 py-2 text-[11px] sm:text-xs font-sans tracking-wider uppercase rounded-full whitespace-nowrap transition-colors ${
                group === g.id
                  ? 'bg-[#1D1714] text-[#FAF7F2] shadow-xs font-medium'
                  : 'text-[#6A5F56] hover:text-[#1D1714]'
              }`}
            >
              <span className="sm:hidden">{g.short}</span>
              <span className="hidden sm:inline">{g.label}</span>
            </button>
          ))}
        </div>
        {group === 'bridal' && tier.bridalNote && (
          <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-[#9E7D53] font-semibold">
            Prices {lowerFirst(tier.bridalNote)}
          </p>
        )}
      </div>

      <div id={`${idBase}-panel`} role="tabpanel" aria-labelledby={`${idBase}-tab-${group}`} className="space-y-6">
        {group === 'bridal' ? (
          <>
            {/* items-start: opening one card's dropdown grows only that card */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">{bridal.map(packageCard)}</div>

            {/* What every bridal package comes with (the same on both price lists) */}
            <div className="rounded-2xl border border-[#E7DFD6] bg-[#F4EFEA] p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                <div className="space-y-3">
                  <p className="text-[11px] font-sans uppercase tracking-[0.16em] font-semibold text-[#1D1714]">
                    Each bridal package includes
                  </p>
                  <FeatureList items={BRIDAL_PACKAGE.includes} />
                </div>
                <div className="space-y-3">
                  <p className="text-[11px] font-sans uppercase tracking-[0.16em] font-semibold text-[#1D1714]">
                    Exclusive bridal experience
                  </p>
                  <FeatureList items={BRIDAL_PACKAGE.experience} />
                </div>
                <div className="space-y-3">
                  <p className="text-[11px] font-sans uppercase tracking-[0.16em] font-semibold text-[#1D1714]">
                    Not included
                  </p>
                  <ul className="space-y-1.5">
                    {BRIDAL_PACKAGE.notIncluded.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs sm:text-[13px] text-[#6A5F56] leading-snug">
                        <Minus className="w-3.5 h-3.5 text-[#A89F93] shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <figure className="border-t border-[#E7DFD6] pt-5 flex items-start gap-3">
                <Star className="w-4 h-4 fill-[#C5A880] text-[#C5A880] shrink-0 mt-1" />
                <div>
                  <figcaption className="text-[11px] font-sans uppercase tracking-[0.16em] font-semibold text-[#9E7D53]">
                    Deepika&rsquo;s personal recommendation
                  </figcaption>
                  <blockquote className="mt-1 font-serif italic text-base sm:text-lg text-[#1D1714] leading-relaxed">
                    {BRIDAL_PACKAGE.recommendation}
                  </blockquote>
                </div>
              </figure>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
              {family.map(packageCard)}

              {single.length > 0 && (
                <PhotoCard image={withPhotos ? SEPARATE_CHARGES_IMAGE : undefined} chip="Non-Bridal">
                  <h3 className="font-serif text-2xl text-white font-medium leading-snug">Separate Charges</h3>
                  <p className="mt-1 text-xs text-white/90 font-sans">Just one part of the look</p>
                  <ul className="mt-3 border-t border-white/20 divide-y divide-white/20">
                    {single.map((service) => (
                      <li key={service.id} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="text-sm font-sans">{service.title}</span>
                        <span className="flex items-center gap-3">
                          <span className="font-serif text-2xl text-[#EBD9BC]">{formatPrice(service.price)}</span>
                          <button
                            type="button"
                            onClick={() => onBook(service)}
                            aria-label={`Book ${service.title}`}
                            className="w-8 h-8 rounded-full bg-[#FAF7F2] text-[#1D1714] hover:bg-white flex items-center justify-center transition-colors"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </PhotoCard>
              )}
            </div>

            {tier.nonBridalNotIncluded && (
              <p className="text-xs text-[#6A5F56] flex items-start gap-2">
                <Minus className="w-3.5 h-3.5 text-[#A89F93] shrink-0 mt-0.5" />
                <span>
                  Non-bridal looks{single.length > 0 ? ' and separate charges' : ''} do not include{' '}
                  {orList(tier.nonBridalNotIncluded.map(lowerFirst))}.
                </span>
              </p>
            )}
          </>
        )}
      </div>

      {/* Travel & booking policy (the same on both price lists) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          { title: 'Travel & accommodation', icon: MapPin, items: TRAVEL_POLICY },
          { title: 'Booking policy', icon: CalendarCheck, items: BOOKING_POLICY },
        ].map(({ title, icon: Icon, items }) => (
          <div key={title} className="rounded-2xl border border-[#E7DFD6] p-5 sm:p-6 space-y-3">
            <p className="flex items-center gap-2 text-[11px] font-sans uppercase tracking-[0.16em] font-semibold text-[#1D1714]">
              <Icon className="w-4 h-4 text-[#9E7D53]" />
              {title}
            </p>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs sm:text-[13px] text-[#6A5F56] leading-snug">
                  <span className="mt-[7px] w-1 h-1 rounded-full bg-[#C5A880] shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

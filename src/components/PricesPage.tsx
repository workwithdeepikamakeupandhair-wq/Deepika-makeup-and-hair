/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * /prices: the full price list. A table compares Deepika's prices with the senior artist's, then the switch shows
 * either list in full. /prices?artist=senior opens on the senior artist's list (handy to share on its own).
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Sparkles, Star } from 'lucide-react';
import {
  BUSINESS_INFO,
  EXPERIENCE_STATS,
  formatPrice,
  PRICE_TIERS,
  PriceTier,
  SENIOR_ARTIST_SERVICES,
  SERVICES,
  ServiceItem,
  WHATSAPP_CONTACTS,
} from '../data/portfolioData';
import { PackageList } from './PackageList';
import { BookingModal } from './BookingModal';
import { ChatWidget } from './ChatWidget';
import { WhatsAppIcon } from './WhatsAppIcon';

type TierId = PriceTier['id'];

const tierFromUrl = (): TierId =>
  new URLSearchParams(window.location.search).get('artist') === 'senior' ? 'senior' : 'deepika';

/** Each of Deepika's services next to the senior artist's version of it (if the senior list has one). */
const COMPARISON = SERVICES.map((deepika) => ({
  deepika,
  senior: SENIOR_ARTIST_SERVICES.find((s) => s.id === `senior-${deepika.id}`),
}));
const COMPARISON_GROUPS: { title: string; category: ServiceItem['category'] }[] = [
  { title: 'Bridal', category: 'bridal' },
  { title: 'Non-bridal', category: 'family' },
  { title: 'Separate charges', category: 'single' },
];
const seniorGaps = COMPARISON.some((row) => !row.senior);

export default function PricesPage() {
  const [tierId, setTierId] = useState<TierId>(tierFromUrl);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingService, setBookingService] = useState<ServiceItem | null>(null);

  useEffect(() => {
    document.title = `Prices | ${BUSINESS_INFO.name}`;
  }, []);

  const tier = PRICE_TIERS.find((t) => t.id === tierId) ?? PRICE_TIERS[0];

  // Keep the address in step with the switch, so a copied link opens the same list
  const chooseTier = (id: TierId) => {
    setTierId(id);
    const url = new URL(window.location.href);
    if (id === 'senior') url.searchParams.set('artist', 'senior');
    else url.searchParams.delete('artist');
    window.history.replaceState(null, '', url);
  };

  const book = (service: ServiceItem | null) => {
    setBookingService(service);
    setBookingOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1D1714] font-sans">
      <header className="sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#E7DFD6]">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <a
            href="/"
            className="inline-flex items-center gap-2 font-serif text-lg sm:text-2xl font-medium tracking-tight hover:text-[#9E7D53] transition-colors min-w-0"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="truncate">Deepika Makeup &amp; Hair</span>
          </a>
          <button
            type="button"
            onClick={() => book(null)}
            className="btn-gold shrink-0 px-4 sm:px-5 py-2.5 rounded-full text-[11px] sm:text-xs uppercase tracking-[0.12em] font-medium"
          >
            Book Appointment
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-16 space-y-14">
        {/* Intro */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-[#9E7D53]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Price List</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl">Packages &amp; Prices</h1>
          <p className="text-xs sm:text-sm text-[#6A5F56] leading-relaxed">
            Book your look with Deepika herself, or with a senior artist. Travel charges are additional, based on
            location.
          </p>
          <dl className="pt-2 grid grid-cols-3 gap-3 max-w-lg mx-auto">
            {EXPERIENCE_STATS.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-serif text-2xl sm:text-3xl">{s.value}</dd>
                <dd className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#9E7D53] leading-tight">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Both price lists side by side */}
        <section aria-labelledby="compare-title" className="space-y-4">
          <h2 id="compare-title" className="font-serif text-2xl sm:text-3xl">
            Compare at a glance
          </h2>
          <div className="rounded-2xl border border-[#E7DFD6] bg-white overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#E7DFD6] bg-[#F4EFEA]">
                  <th scope="col" className="px-4 sm:px-6 py-3 text-[10px] sm:text-[11px] uppercase tracking-[0.14em] font-semibold text-[#6A5F56]">
                    Package
                  </th>
                  {PRICE_TIERS.map((t) => (
                    <th
                      key={t.id}
                      scope="col"
                      className={`px-3 sm:px-6 py-3 text-right text-[10px] sm:text-[11px] uppercase tracking-[0.14em] font-semibold ${
                        t.id === tierId ? 'text-[#1D1714]' : 'text-[#6A5F56]'
                      }`}
                    >
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {COMPARISON_GROUPS.map((group) => (
                <tbody key={group.category} className="border-b border-[#E7DFD6] last:border-b-0">
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={3}
                      className="px-4 sm:px-6 pt-4 pb-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-[#9E7D53]"
                    >
                      {group.title}
                    </th>
                  </tr>
                  {COMPARISON.filter((row) => row.deepika.category === group.category).map(({ deepika, senior }) => (
                    <tr key={deepika.id} className="text-sm">
                      <th scope="row" className="px-4 sm:px-6 py-2.5 font-normal text-[#1D1714]">
                        <span className="inline-flex items-center gap-1.5">
                          {deepika.title}
                          {deepika.badge && (
                            <Star className="w-3.5 h-3.5 fill-[#C5A880] text-[#C5A880] shrink-0" aria-label={deepika.badge} />
                          )}
                        </span>
                      </th>
                      {[deepika, senior].map((s, i) => (
                        <td
                          key={i}
                          className={`px-3 sm:px-6 py-2.5 text-right font-serif text-xl sm:text-2xl whitespace-nowrap ${
                            PRICE_TIERS[i].id === tierId ? 'text-[#9E7D53]' : 'text-[#A89F93]'
                          }`}
                        >
                          {s ? (
                            <>
                              {formatPrice(s.price)}
                              {s.perPerson && (
                                <span className="block font-sans text-[10px] uppercase tracking-wider">per person</span>
                              )}
                            </>
                          ) : (
                            <span aria-label="Not listed">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr aria-hidden="true">
                    <td colSpan={3} className="h-2" />
                  </tr>
                </tbody>
              ))}
            </table>
          </div>
          <p className="text-[11px] text-[#6A5F56] flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Star className="w-3 h-3 fill-[#C5A880] text-[#C5A880]" /> Most recommended
            </span>
            {seniorGaps && <span>— Not on the senior artist&rsquo;s price list: ask us on WhatsApp</span>}
          </p>
        </section>

        {/* Full details of one list */}
        <section aria-labelledby="details-title" className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-t border-[#E7DFD6] pt-10">
            <div>
              <h2 id="details-title" className="font-serif text-2xl sm:text-3xl">
                Package details
              </h2>
              <p className="text-xs text-[#6A5F56] mt-1">Choose who you&rsquo;d like to book.</p>
            </div>
            <div role="tablist" aria-label="Artist" className="inline-flex p-1 bg-[#EFECE6] rounded-full border border-[#D9D0C5] self-start">
              {PRICE_TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={t.id === tierId}
                  aria-controls="tier-panel"
                  onClick={() => chooseTier(t.id)}
                  className={`px-4 sm:px-5 py-2 rounded-full text-[11px] sm:text-xs uppercase tracking-[0.12em] transition-colors ${
                    t.id === tierId ? 'bg-[#1D1714] text-[#FAF7F2] font-medium shadow-sm' : 'text-[#6A5F56] hover:text-[#1D1714]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div id="tier-panel" role="tabpanel" aria-labelledby={`tab-${tier.id}`}>
            <PackageList key={tier.id} tier={tier} onBook={book} />
          </div>
        </section>

        {/* Questions */}
        <section className="rounded-2xl bg-[#1D1714] text-[#FAF7F2] p-6 sm:p-8 text-center space-y-4">
          <h2 className="font-serif text-2xl sm:text-3xl">Questions about a package?</h2>
          <p className="text-xs sm:text-sm text-[#D9D0C5]">Message Deepika on WhatsApp. She reviews inquiries within 24 hours.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            {WHATSAPP_CONTACTS.map((c) => (
              <a
                key={c.country}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-2.5 rounded-full text-xs uppercase tracking-wider font-medium bg-[#25D366] text-white hover:bg-[#1EBE5D] transition-colors inline-flex items-center justify-center gap-2"
              >
                <WhatsAppIcon className="w-4 h-4" />
                <span>WhatsApp {c.country}</span>
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E7DFD6] py-6 text-center text-xs text-[#6A5F56]">
        <a href="/" className="text-[#9E7D53] font-medium hover:underline underline-offset-2">
          View Deepika&rsquo;s portfolio
        </a>
      </footer>

      <ChatWidget onOpenBooking={() => book(null)} />

      <BookingModal
        isOpen={bookingOpen}
        onClose={() => {
          setBookingOpen(false);
          setBookingService(null);
        }}
        preselectedService={bookingService}
      />
    </div>
  );
}

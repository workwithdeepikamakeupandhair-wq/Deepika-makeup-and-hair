/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sparkles, GraduationCap, CheckCircle2, MapPin, Award } from 'lucide-react';
import { DeepikaPhotoSlider } from './DeepikaPhotoSlider';
import { MasterclassVideo } from './MasterclassVideo';
import { WhatsAppIcon } from './WhatsAppIcon';
import { BUSINESS_INFO, EXPERIENCE_STATS, WHATSAPP_CONTACTS } from '../data/portfolioData';

/** Classes aren't on the price list, so class questions go straight to Deepika on WhatsApp. */
const CLASS_WHATSAPP_URL = `${BUSINESS_INFO.whatsappUrl}?text=${encodeURIComponent(
  `Hello ${BUSINESS_INFO.artist.split(' ')[0]}, I am interested in your makeup classes. Could you share the details?`,
)}`;

export const AboutAndEducation: React.FC = () => {
  return (
    <div id="masterclass" className="bg-[#FAF7F2] border-t border-[#E7DFD6]">
      {/* Part 1: About Deepika */}
      <section className="py-24 max-w-7xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Portrait */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <DeepikaPhotoSlider />

              {/* Floating Atlanta studio badge */}
              <div className="absolute -bottom-5 -right-4 sm:-right-6 bg-white p-4 rounded-xl border border-[#E7DFD6] shadow-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1D1714] text-[#C5A880] flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-sans font-semibold text-[#1D1714] uppercase tracking-wider">
                    Atlanta Atelier
                  </p>
                  <p className="text-[11px] text-[#6A5F56] font-sans">
                    Georgia, USA · Global Travel
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Bio & Story */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>The Artist Behind The Brush</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#1D1714] leading-tight">
              Deepika S — <br />
              <span className="italic font-light text-[#9E7D53]">Versatile Makeup Artist &amp; Educator</span>
            </h2>

            <div className="space-y-4 text-sm sm:text-base text-[#6A5F56] font-sans leading-relaxed">
              <p>
                Welcome to Deepika Makeup &amp; Hair. Based in Atlanta, Georgia, Deepika brings 15+ years of
                expertise in the beauty industry, 6000+ bridal transformations and 8000+ non-bridal clients.
                She is known for timeless, luxury bridal looks that are personally curated to make every bride
                feel flawless, radiant and unforgettable.
              </p>
              <p>
                Every bridal look is designed around your event, whether it is your wedding, engagement,
                Pellikuthuru or another wedding event, along with your skin type and your dream vision. For the
                bride&rsquo;s family and wedding guests, each look is customized to age, skin type, outfit and role
                in the celebration.
              </p>
              <p>
                Her philosophy is uncompromising: makeup should never look like a foreign mask.
                Instead, it should elevate your natural bone structure, harmonize with your sacred attire,
                and feel so comfortable that you forget you are wearing it until you catch your breathtaking reflection.
              </p>
            </div>

            {/* Quick credentials */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#E7DFD6]">
              {EXPERIENCE_STATS.map((s) => (
                <div key={s.label} className="space-y-1">
                  <p className="font-serif text-2xl text-[#1D1714]">{s.value}</p>
                  <p className="text-[11px] font-sans uppercase tracking-wider text-[#9E7D53] leading-tight">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <a
                href={BUSINESS_INFO.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold px-6 py-3 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium"
              >
                Follow on Instagram @deepikamakeupandhair
              </a>
              {WHATSAPP_CONTACTS.map((c) => (
                <a
                  key={c.country}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.12em] uppercase text-[#9E7D53] hover:text-[#1D1714] transition-colors"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>WhatsApp {c.country}: {c.number}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Part 2: Makeup Education & Masterclass */}
      <section className="pt-20 pb-16 bg-[#F4EFEA] border-t border-[#E7DFD6]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Masterclass Details */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
                <GraduationCap className="w-4 h-4" />
                <span>Deepika S Beauty Education Atelier</span>
              </div>

              <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#1D1714] leading-tight">
                Self-Makeup Masterclasses &amp; <br />
                <span className="italic font-light text-[#9E7D53]">Pro Artist Mentorship</span>
              </h2>

              <p className="text-sm sm:text-base text-[#6A5F56] font-sans leading-relaxed">
                Empowering women and aspiring artists with professional-grade skills.
                Whether you want to effortlessly apply everyday glass-skin makeup or master
                high-volume Indian bridal transformations, Deepika provides intimate, personalized instruction.
              </p>

              <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#1D1714] text-[#FAF7F2] text-[11px] font-sans font-medium uppercase tracking-[0.16em] shadow-md">
                <Award className="w-4 h-4 text-[#C5A880] shrink-0" />
                <span>{BUSINESS_INFO.certification}</span>
              </div>

              {/* Masterclass Modules */}
              <div className="space-y-3 pt-2">
                <div className="p-4 bg-white rounded-xl border border-[#E7DFD6] flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#9E7D53] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-sans uppercase tracking-wider font-semibold text-[#1D1714]">
                      1. Skin Chemistry &amp; Color Correction for Diverse Undertones
                    </h4>
                    <p className="text-xs text-[#6A5F56] mt-0.5">
                      How to choose correct undertones, neutralize hyperpigmentation, and achieve seamless color harmony.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-[#E7DFD6] flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#9E7D53] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-sans uppercase tracking-wider font-semibold text-[#1D1714]">
                      2. Weightless High-Definition Complexion
                    </h4>
                    <p className="text-xs text-[#6A5F56] mt-0.5">
                      Layering formulas that resist sweat and tears without looking powdery or caked.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-[#E7DFD6] flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#9E7D53] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-sans uppercase tracking-wider font-semibold text-[#1D1714]">
                      3. Day-to-Night Eye &amp; Brow Architecture
                    </h4>
                    <p className="text-xs text-[#6A5F56] mt-0.5">
                      Fluffy natural brows, soft daytime cut-creases, and high-impact smoky eyeliner techniques.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-[#E7DFD6] flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#9E7D53] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-sans uppercase tracking-wider font-semibold text-[#1D1714]">
                      4. Personal Vanity Bag Audit &amp; Brush Anatomy
                    </h4>
                    <p className="text-xs text-[#6A5F56] mt-0.5">
                      Deepika reviews your existing makeup kit, discards unflattering items, and curates a tailored shopping list.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-wrap items-center gap-4">
                <a
                  href={CLASS_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-gold px-7 py-3.5 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium inline-flex items-center gap-2"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>Ask About Classes on WhatsApp</span>
                </a>
              </div>
            </div>

            {/* Right Column: Masterclass highlight reel */}
            <div className="lg:col-span-5">
              <MasterclassVideo />

              <div className="mt-4 p-5 bg-white rounded-xl border border-[#E7DFD6] space-y-2">
                <div className="flex items-center gap-2 text-[#9E7D53]">
                  <Award className="w-4 h-4" />
                  <span className="text-xs font-sans uppercase tracking-wider font-semibold">
                    Hands-On Practical Learning
                  </span>
                </div>
                <p className="text-xs text-[#6A5F56] leading-relaxed">
                  Classes are hosted in our private Atlanta studio or booked as private 1-on-1 sessions.
                  All products, brushes, and mirrors are provided during training.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

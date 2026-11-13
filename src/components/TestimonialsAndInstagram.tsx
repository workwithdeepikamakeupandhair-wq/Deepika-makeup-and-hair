/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sparkles, Instagram, ArrowUpRight } from 'lucide-react';
import { VIDEO_TESTIMONIALS, BUSINESS_INFO } from '../data/portfolioData';
import { InstagramMarquee } from './InstagramMarquee';
import { TestimonialVideo } from './TestimonialVideo';

export const TestimonialsAndInstagram: React.FC = () => {
  return (
    <div className="bg-[#FAF7F2] border-t border-[#E7DFD6]">
      {/* Testimonials */}
      <section id="testimonials" className="py-24 max-w-7xl mx-auto px-5 sm:px-8">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Real Client Reviews</span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#1D1714]">
            Unforgettable Celebrations
          </h2>
          <p className="text-xs sm:text-sm text-[#6A5F56] font-sans">
            Hear from our brides in their own words. Tap a video to play it with sound.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-[720px] mx-auto">
          {VIDEO_TESTIMONIALS.map((t) => (
            <TestimonialVideo key={t.id} item={t} />
          ))}
        </div>
      </section>

      {/* Instagram Gallery Connect */}
      <section className="py-20 bg-[#F4EFEA] border-t border-[#E7DFD6]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-10 border-b border-[#E7DFD6]">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
                <Instagram className="w-3.5 h-3.5" />
                <span>Live Atelier Moments</span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl text-[#1D1714]">
                Follow @deepikamakeupandhair
              </h2>
              <p className="text-xs sm:text-sm text-[#6A5F56] font-sans">
                Real brides, behind-the-scenes transformations, and beauty tutorials updated weekly.
              </p>
            </div>

            <a
              href={BUSINESS_INFO.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gold px-6 py-2.5 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium inline-flex items-center gap-2 shrink-0 self-start sm:self-auto"
            >
              <span>View On Instagram</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>

        </div>

        {/* Instagram strip — full width, drifting slowly; pauses on hover */}
        <div className="mt-8">
          <InstagramMarquee />
        </div>
      </section>
    </div>
  );
};

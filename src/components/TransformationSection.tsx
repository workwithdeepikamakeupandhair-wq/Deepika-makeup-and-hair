/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Sparkles, SlidersHorizontal, Check } from 'lucide-react';

interface TransformationSectionProps {
  onOpenBooking: () => void;
}

export const TransformationSection: React.FC<TransformationSectionProps> = ({ onOpenBooking }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateSlider(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateSlider(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
  };

  const updateSlider = (clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.min(100, Math.max(0, (x / rect.width) * 100));
    setSliderPosition(percent);
  };

  return (
    <section className="py-20 bg-[#FAF7F2] border-t border-[#E7DFD6]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Explanatory Philosophy */}
          <div className="lg:col-span-5 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Signature Artistry Philosophy</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#1D1714] leading-[1.15]">
              Real Skin, Elevated. <br />
              <span className="italic font-light text-[#9E7D53]">Never Masked.</span>
            </h2>

            <p className="text-sm sm:text-base text-[#6A5F56] font-sans leading-relaxed">
              Deepika S specializes in transformative beauty that honors your authentic features.
              Through bespoke color correcting, micro-thin veil layering, and precision eye architecture,
              she achieves radiant, long-lasting wedding looks that feel completely weightless on your skin.
            </p>

            <div className="space-y-3.5 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#1D1714] text-[#C5A880] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3" />
                </div>
                <div>
                  <p className="text-xs font-sans uppercase tracking-wider font-semibold text-[#1D1714]">
                    Zero Gray Cast / True Undertone Matching
                  </p>
                  <p className="text-xs text-[#6A5F56]">
                    Custom color theory formulated for South Asian and diverse melanin-rich complexions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#1D1714] text-[#C5A880] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3" />
                </div>
                <div>
                  <p className="text-xs font-sans uppercase tracking-wider font-semibold text-[#1D1714]">
                    16-Hour Tear &amp; Heat Resilience
                  </p>
                  <p className="text-xs text-[#6A5F56]">
                    Engineered to withstand emotional moments, sacred holy fires, and humid Atlanta weather.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#1D1714] text-[#C5A880] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3" />
                </div>
                <div>
                  <p className="text-xs font-sans uppercase tracking-wider font-semibold text-[#1D1714]">
                    Skin That Breathes in HD &amp; Person
                  </p>
                  <p className="text-xs text-[#6A5F56]">
                    No heavy cake layers. Looks fresh at conversational distance and mesmerizing under camera lenses.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={onOpenBooking}
                className="btn-gold px-7 py-3 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium"
              >
                Inquire For Your Transformation
              </button>
            </div>
          </div>

          {/* Right Column: Interactive comparison — the same real bride, eyes open and eyes closed */}
          <div className="lg:col-span-7">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#6A5F56] px-1 font-sans">
                <span className="uppercase tracking-[0.15em] font-medium text-[#1D1714]">
                  The Finished Look
                </span>
                <span className="text-[11px] text-[#9E7D53] hidden sm:inline flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5 inline" />
                  Drag slider to compare
                </span>
                <span className="uppercase tracking-[0.15em] font-medium text-[#1D1714]">
                  Eye Artistry
                </span>
              </div>

              {/* Slider Container */}
              <div
                ref={containerRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative w-full aspect-[16/9] sm:aspect-[16/10] rounded-2xl overflow-hidden shadow-2xl border border-[#E7DFD6] select-none cursor-ew-resize bg-[#F4EFEA]"
              >
                {/* Full Image (Right Side - eyes closed, showing the lid work) */}
                <img
                  src="/images/portfolio/transformation-eyes-closed.jpg"
                  alt="The same bride with her eyes closed, showing rose-gold shimmer eyeshadow"
                  className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
                  referrerPolicy="no-referrer"
                />

                {/* Left Cropped Layer (eyes open - the finished look) */}
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{ width: `${sliderPosition}%` }}
                >
                  <img
                    src="/images/portfolio/transformation-eyes-open.jpg"
                    alt="Bride in finished bridal makeup with a red rose bun and kundan maang tikka, smiling"
                    className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
                    style={{
                      width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100%',
                      maxWidth: 'none'
                    }}
                    referrerPolicy="no-referrer"
                  />

                  {/* Left Label Tag */}
                  <div className="absolute top-4 left-4 bg-[#1D1714]/80 backdrop-blur-xs text-[#FAF7F2] text-[10px] font-sans uppercase tracking-[0.16em] px-3 py-1.5 rounded-full border border-white/20">
                    Eyes Open
                  </div>
                </div>

                {/* Right Label Tag */}
                <div className="absolute top-4 right-4 bg-[#1D1714]/80 backdrop-blur-xs text-[#FAF7F2] text-[10px] font-sans uppercase tracking-[0.16em] px-3 py-1.5 rounded-full border border-white/20 pointer-events-none">
                  Eyes Closed
                </div>

                {/* Vertical Divider Line with Handle */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_12px_rgba(0,0,0,0.5)] pointer-events-none"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#1D1714] text-[#C5A880] border-2 border-white shadow-xl flex items-center justify-center">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-center text-[#6A5F56] font-sans">
                The same bride in one sitting: eyes open for the finished look, eyes closed to show the shimmer lid work.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

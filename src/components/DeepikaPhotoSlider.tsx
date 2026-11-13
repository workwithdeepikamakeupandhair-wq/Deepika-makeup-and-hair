/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Photos of Deepika for the About section, in display order (all cropped to 4:5). */
const PHOTOS = [
  { src: '/images/portfolio/about-deepika-portrait.jpg', alt: 'Deepika S seated on a blush sofa in a sage waistcoat set' },
  { src: '/images/portfolio/about-deepika-closeup.jpg', alt: 'Close-up portrait of Deepika S, chin resting on her hand' },
  { src: '/images/portfolio/about-deepika-cream-vest.jpg', alt: 'Deepika S in a cream pinstripe waistcoat against a dark curtain' },
  { src: '/images/portfolio/about-deepika-gingham.jpg', alt: 'Deepika S in a red gingham sundress with soft curls' },
  { src: '/images/portfolio/about-deepika-standing.jpg', alt: 'Deepika S standing beside a blush sofa in a sage waistcoat set' },
];

/** A mouse drag of at least this many px moves on to the next / previous photo. */
const DRAG_STEP_PX = 40;
/** Trackpad sideways swipe: this much travel (px) moves one photo — one photo per swipe. */
const SWIPE_STEP_PX = 18;
/** A pause this long (ms) between wheel events ends a swipe. */
const SWIPE_GAP_MS = 160;
/** Momentum keeps sending (decaying) wheel events after a swipe; a sharp surge only counts as a new
    swipe once the last step has had this long (ms) to play out. */
const SWIPE_COOLDOWN_MS = 350;

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/**
 * Sideways photo slider in a 4:5 frame. Touch and trackpads swipe natively (CSS scroll snap, one photo
 * per swipe); mice can drag; arrows and dots work everywhere.
 */
export const DeepikaPhotoSlider: React.FC = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; left: number; dx: number } | null>(null);
  const [index, setIndex] = useState(0);
  const n = PHOTOS.length;

  const scrollToPhoto = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: scrollBehavior() });
  };

  /** Arrows wrap around: next on the last photo goes back to the first. */
  const step = (dir: 1 | -1) => scrollToPhoto((index + dir + n) % n);

  // Trackpad sideways swipes (and Shift+wheel). Native snapping would bounce a short swipe back to the same
  // photo, so swipes are handled here: one swipe = one photo. Native listener because React's wheel
  // handlers are passive. Up/down scrolling is left to the page.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const swipe = { acc: 0, dir: 0, lastTime: 0, lastAbs: 0, stepped: false, lastStepTime: 0 };

    const onWheel = (e: WheelEvent) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? track.clientWidth : 1;
      let dx = e.deltaX * unit;
      if (e.shiftKey && dx === 0) dx = e.deltaY * unit; // Shift+wheel where the browser doesn't swap axes
      else if (Math.abs(dx) <= Math.abs(e.deltaY * unit)) return;
      e.preventDefault();

      const now = e.timeStamp || performance.now();
      const dir = Math.sign(dx);
      const abs = Math.abs(dx);
      const isNewSwipe =
        now - swipe.lastTime > SWIPE_GAP_MS ||
        dir !== swipe.dir ||
        (now - swipe.lastStepTime > SWIPE_COOLDOWN_MS && abs > swipe.lastAbs * 2 + 4);
      if (isNewSwipe) {
        swipe.acc = 0;
        swipe.stepped = false;
      }
      swipe.dir = dir;
      swipe.lastTime = now;
      swipe.lastAbs = abs;
      swipe.acc += abs;

      if (!swipe.stepped && swipe.acc >= SWIPE_STEP_PX) {
        swipe.stepped = true;
        swipe.lastStepTime = now;
        const current = Math.round(track.scrollLeft / track.clientWidth);
        const target = Math.max(0, Math.min(PHOTOS.length - 1, current + dir));
        track.scrollTo({ left: target * track.clientWidth, behavior: scrollBehavior() });
      }
    };

    track.addEventListener('wheel', onWheel, { passive: false });
    return () => track.removeEventListener('wheel', onWheel);
  }, []);

  const handleScroll = () => {
    const track = trackRef.current;
    if (track) setIndex(Math.min(n - 1, Math.round(track.scrollLeft / track.clientWidth)));
  };

  // Mouse drag. Snapping is paused while dragging so the photo follows the pointer.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const track = e.currentTarget;
    dragRef.current = { x: e.clientX, left: track.scrollLeft, dx: 0 };
    track.style.scrollSnapType = 'none';
    track.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.dx = e.clientX - drag.x;
    e.currentTarget.scrollLeft = drag.left - drag.dx;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const track = e.currentTarget;
    const start = Math.round(drag.left / track.clientWidth);
    const target = Math.abs(drag.dx) >= DRAG_STEP_PX ? start - Math.sign(drag.dx) : start;
    track.scrollTo({ left: Math.max(0, Math.min(n - 1, target)) * track.clientWidth, behavior: scrollBehavior() });
    // Turn snapping back on once the glide has landed (restoring it mid-glide would jump).
    const restoreSnap = () => {
      track.style.scrollSnapType = '';
    };
    track.addEventListener('scrollend', restoreSnap, { once: true });
    window.setTimeout(restoreSnap, 900); // browsers without scrollend, or when no scroll was needed
  };

  return (
    <div className="relative rounded-2xl overflow-hidden aspect-[4/5] shadow-2xl border border-[#E7DFD6] bg-[#F4EFEA]">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="Photos of Deepika S — swipe or use the arrows"
        className="flex h-full overflow-x-auto snap-x snap-mandatory overscroll-x-contain select-none cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C5A880] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {PHOTOS.map((photo, i) => (
          <div
            key={photo.src}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}`}
            className="w-full h-full shrink-0 snap-center snap-always"
          >
            <img
              src={photo.src}
              alt={photo.alt}
              draggable={false}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className="w-full h-full object-cover object-center pointer-events-none"
            />
          </div>
        ))}
      </div>

      {/* Arrows */}
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Previous photo"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm text-[#1D1714] shadow-lg flex items-center justify-center hover:bg-white transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Next photo"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm text-[#1D1714] shadow-lg flex items-center justify-center hover:bg-white transition-colors"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Dots (bottom-left, clear of the Atlanta Atelier badge) */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1.5 px-2.5 py-2 rounded-full bg-[#1D1714]/45 backdrop-blur-sm">
        {PHOTOS.map((photo, i) => (
          <button
            key={photo.src}
            type="button"
            onClick={() => scrollToPhoto(i)}
            aria-label={`Show photo ${i + 1} of ${n}`}
            aria-current={i === index}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === index ? 'w-5 bg-white' : 'w-2 bg-white/55 hover:bg-white/80'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

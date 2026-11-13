/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import type { VideoTestimonial } from '../data/portfolioData';

/**
 * A client video review. These videos have speech, so nothing autoplays: the card shows a lazy-loaded still frame
 * and a play button, and the video (preload="none") only downloads once someone taps play. After that the
 * browser's own controls take over. Starting one review pauses the others, and a review pauses when it is
 * scrolled out of view.
 */
export const TestimonialVideo: React.FC<{ item: VideoTestimonial }> = ({ item }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const start = () => {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    video.play().catch(() => setStarted(false));
    // The play button disappears, so hand keyboard focus to the video and its controls
    requestAnimationFrame(() => video.focus());
  };

  const pauseOtherReviews = () => {
    document.querySelectorAll<HTMLVideoElement>('video[data-testimonial-video]').forEach((v) => {
      if (v !== videoRef.current) v.pause();
    });
  };

  return (
    <figure className="w-full max-w-[340px] mx-auto bg-white rounded-2xl border border-[#E7DFD6] p-3 shadow-xs flex flex-col">
      <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-[#1D1714]">
        <video
          ref={videoRef}
          data-testimonial-video=""
          src={item.video}
          poster={started ? item.poster : undefined}
          preload="none"
          playsInline
          controls={started}
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onPlay={pauseOtherReviews}
          aria-label={item.description}
          className="w-full h-full object-cover"
        />
        {!started && (
          <button
            type="button"
            onClick={start}
            aria-label={`Play video review: ${item.event}`}
            className="group absolute inset-0 w-full h-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#C5A880]"
          >
            <img
              src={item.poster}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/90 text-[#1D1714] flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
              <Play className="w-6 h-6 translate-x-0.5 fill-current" />
            </span>
            <span className="absolute bottom-4 inset-x-0 text-center text-white text-[11px] uppercase tracking-[0.18em] font-sans font-medium [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">
              Play with sound
            </span>
          </button>
        )}
      </div>

      <figcaption className="px-2 pt-5 pb-2 space-y-3">
        <p className="font-serif italic text-lg text-[#1D1714] leading-snug">&ldquo;{item.quote}&rdquo;</p>
        <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-[#9E7D53]">
          Real bride · {item.event}
        </p>
      </figcaption>
    </figure>
  );
};

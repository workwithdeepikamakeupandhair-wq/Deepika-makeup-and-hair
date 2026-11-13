/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Instagram } from 'lucide-react';
import { BUSINESS_INFO, INSTAGRAM_HIGHLIGHTS } from '../data/portfolioData';

/** Seconds each photo takes to drift past. Larger = slower. */
const SECONDS_PER_PHOTO = 8;

/**
 * Full-width strip of Instagram photos drifting slowly to the left in an endless loop.
 * The track renders the posts twice; the CSS animation (.ig-marquee-track in index.css) moves it by
 * exactly one copy, so the loop has no seam. It pauses on hover / keyboard focus, and stands still
 * (scrollable by hand) when the visitor prefers reduced motion.
 */
export const InstagramMarquee: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [nearView, setNearView] = useState(false);

  // The strip holds 30+ photos: only start loading them once it is close to the screen.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!('IntersectionObserver' in window)) {
      setNearView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNearView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const renderCopy = (isDuplicate: boolean) => (
    <ul className={`flex shrink-0 ${isDuplicate ? 'ig-marquee-copy' : ''}`} aria-hidden={isDuplicate || undefined}>
      {INSTAGRAM_HIGHLIGHTS.map((post) => (
        // Spacing is padding inside each item (not flex gap) so one copy is exactly half the track.
        <li key={post.id} className="shrink-0 pr-4 lg:pr-5">
          <a
            href={BUSINESS_INFO.instagram}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={isDuplicate ? -1 : undefined}
            draggable={false}
            className="group relative block w-[170px] sm:w-[210px] lg:w-[250px] aspect-[3/4] rounded-xl overflow-hidden border border-[#E7DFD6] bg-[#EDE6DE] shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-[#C5A880]"
          >
            {nearView && (
              <img
                src={post.image}
                alt={isDuplicate ? '' : post.caption}
                draggable={false}
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            )}

            {/* Hover / focus overlay with tag and caption */}
            <div className="absolute inset-0 bg-[#1D1714]/80 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 p-3 flex flex-col justify-between text-white">
              <div className="flex items-center justify-between gap-2 text-[10px] text-[#C5A880] uppercase tracking-wider">
                <span>{post.tag}</span>
                <Instagram className="w-3.5 h-3.5 shrink-0" />
              </div>
              <p className="line-clamp-4 text-[11px] font-sans leading-snug text-white/90">{post.caption}</p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );

  const edgeFade = 'linear-gradient(to right, transparent, #000 4%, #000 96%, transparent)';

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={`Recent work on Instagram ${BUSINESS_INFO.instagramHandle} — hover to pause`}
      className="ig-marquee relative overflow-hidden py-1"
      style={{ maskImage: edgeFade, WebkitMaskImage: edgeFade }}
    >
      <div
        className="ig-marquee-track flex w-max"
        style={{ '--ig-marquee-duration': `${INSTAGRAM_HIGHLIGHTS.length * SECONDS_PER_PHOTO}s` } as React.CSSProperties}
      >
        {renderCopy(false)}
        {renderCopy(true)}
      </div>
    </div>
  );
};

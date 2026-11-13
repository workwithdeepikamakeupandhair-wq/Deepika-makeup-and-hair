/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

const VIDEO_SRC = '/images/portfolio/masterclass-reel.mp4';
const POSTER_SRC = '/images/portfolio/masterclass-reel-poster.jpg';

/**
 * Masterclass highlight reel (silent, 73 s, portrait). Plays muted on a loop only while it is on screen, and
 * nothing downloads until then (preload="none"). Visitors who prefer reduced motion get the poster and a play
 * button instead of autoplay. The pause button also satisfies "moving content can be paused".
 */
export const MasterclassVideo: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) userPausedRef.current = true;
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!userPausedRef.current) video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      video.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden aspect-[3/4] shadow-xl border border-[#E7DFD6] bg-[#1D1714]">
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        poster={POSTER_SRC}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        aria-label="Highlights from Deepika's makeup masterclass: teaching, students practising, and certificates being presented"
        className="w-full h-full object-cover object-center"
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause video' : 'Play video'}
        className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-[#1D1714]/55 backdrop-blur-sm text-white flex items-center justify-center hover:bg-[#1D1714]/75 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A880]"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-px" />}
      </button>
    </div>
  );
};

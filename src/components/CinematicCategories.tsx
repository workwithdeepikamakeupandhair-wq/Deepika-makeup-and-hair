/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useInView } from '../hooks/useInView';

interface CategoryItem {
  id: string;
  name: string;
  videoUrl: string;
  fallbackPoster: string;
  targetAnchor: string;
}

interface CinematicCategoriesProps {
  onSelectCategory?: (category: string) => void;
  onOpenBooking: () => void;
}

const CATEGORIES: CategoryItem[] = [
  {
    id: 'bridal-couture',
    name: 'bridal couture',
    videoUrl: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260518_203023_87a26602-2898-4acc-a396-c7a2b5ad84fd.mp4',
    fallbackPoster: '/images/portfolio/category-bridal-couture-video.jpg',
    targetAnchor: '#services'
  },
  {
    id: 'beauty-tools',
    name: 'beauty & hair',
    videoUrl: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260518_203415_b86e3f19-2aec-46cd-9a86-b64c40118e38.mp4',
    fallbackPoster: '/images/portfolio/category-beauty-hair-video.jpg',
    targetAnchor: '#services'
  },
  {
    id: 'masterclasses',
    name: 'masterclasses',
    videoUrl: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260518_203051_85fee398-ea01-4aa0-972b-137a74213be5.mp4',
    fallbackPoster: '/images/portfolio/category-masterclasses-video.jpg',
    targetAnchor: '#masterclass'
  }
];

export const CinematicCategories: React.FC<CinematicCategoriesProps> = ({
  onSelectCategory,
  onOpenBooking
}) => {
  const { ref, isVisible } = useInView<HTMLDivElement>(0.1);

  const handleClick = (cat: CategoryItem) => {
    if (onSelectCategory) {
      onSelectCategory(cat.id);
    }
    const element = document.querySelector(cat.targetAnchor);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
      onOpenBooking();
    }
  };

  return (
    <section
      id="categories-section"
      className="w-full bg-white text-white min-h-screen flex flex-col justify-center"
      aria-label="Cinematic Artistry Categories"
    >
      <div
        ref={ref}
        className={`w-full grid grid-cols-1 md:grid-cols-3 transition-all duration-1000 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
        }`}
      >
        {CATEGORIES.map((category, index) => (
          <div
            key={category.id}
            className="group relative flex flex-col justify-between items-start p-6 sm:p-8 md:p-12 min-h-[400px] sm:min-h-[500px] md:min-h-[750px] overflow-hidden transition-all"
            style={{ transitionDelay: `${index * 150}ms` }}
          >
            {/* Background video. The poster is the video's own first frame, so the panel looks
                the same while the video is still downloading (or if autoplay is blocked). */}
            <video
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              src={category.videoUrl}
              poster={category.fallbackPoster}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />

            {/* Dark Overlay */}
            <div className="absolute inset-0 bg-black/15 group-hover:bg-black/25 transition-colors duration-500" />

            {/* Category Name (Vertical text, bottom-to-top via vertical-lr + rotate 180) */}
            <h2
              className="relative z-10 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-medium tracking-tight transition-transform duration-500 group-hover:-translate-y-2 select-none"
              style={{
                writingMode: 'vertical-lr',
                transform: 'rotate(180deg)'
              }}
            >
              {category.name}
            </h2>

            {/* Explore Button */}
            <button
              onClick={() => handleClick(category)}
              className="btn-primary relative z-10 mt-auto px-8 py-3 bg-white text-black rounded-full text-sm font-sans tracking-wider uppercase font-medium hover:bg-[#FAF7F2] transition-all shadow-md"
            >
              explore {category.name}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

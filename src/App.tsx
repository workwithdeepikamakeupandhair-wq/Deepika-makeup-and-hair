/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ScrollProgressBar } from './components/ScrollProgressBar';
import { Navbar } from './components/Navbar';
import { EditorialHero } from './components/EditorialHero';
import { CurvedArchiveGallery } from './components/CurvedArchiveGallery';
import { RunwayLookbook } from './components/RunwayLookbook';
import { CinematicCategories } from './components/CinematicCategories';
import { TransformationSection } from './components/TransformationSection';
import { ServicesSection } from './components/ServicesSection';
import { AboutAndEducation } from './components/AboutAndEducation';
import { TestimonialsAndInstagram } from './components/TestimonialsAndInstagram';
import { ContactAndFooter } from './components/ContactAndFooter';
import { BookingModal } from './components/BookingModal';
import { ChatWidget } from './components/ChatWidget';
import { LookArchiveItem, ServiceItem } from './data/portfolioData';

export default function App() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedLook, setSelectedLook] = useState<LookArchiveItem | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);

  const handleOpenBooking = () => {
    setIsBookingOpen(true);
  };

  const handleCloseBooking = () => {
    setIsBookingOpen(false);
    setSelectedLook(null);
    setSelectedService(null);
  };

  const handleSelectLookForBooking = (look: LookArchiveItem) => {
    setSelectedLook(look);
    setSelectedService(null);
    setIsBookingOpen(true);
  };

  const handleSelectServiceForBooking = (service: ServiceItem) => {
    setSelectedService(service);
    setSelectedLook(null);
    setIsBookingOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1D1714] font-sans">
      {/* Slim Elegant Scroll Progress Indicator (Brand Taupe) */}
      <ScrollProgressBar />

      {/* Navigation */}
      <Navbar onOpenBooking={handleOpenBooking} />

      {/* Main Page Layout */}
      <main>
        {/* 1. Main Fashion Editorial Hero Section (Inspired by MAREN with traditional Indian bride) */}
        <EditorialHero onOpenBooking={handleOpenBooking} />

        {/* 2. Curved 3D Archive Gallery (Curved VHS Archive exact design inspiration) */}
        <CurvedArchiveGallery
          onSelectLookForBooking={handleSelectLookForBooking}
          onOpenBooking={handleOpenBooking}
        />

        {/* 3. Lookbook: "Our Signature Looks" (depth runway of 6 looks) */}
        <RunwayLookbook onOpenBooking={handleOpenBooking} />

        {/* 4. Cinematic Categories Section (Vertical typography + video cards) */}
        <CinematicCategories
          onOpenBooking={handleOpenBooking}
        />

        {/* 5. Bridal Transformations (Interactive Before/After slider & philosophy) */}
        <TransformationSection onOpenBooking={handleOpenBooking} />

        {/* 6. Comprehensive Services & Packages */}
        <ServicesSection onSelectServiceForBooking={handleSelectServiceForBooking} />

        {/* 7. About Deepika S & Makeup Education Atelier */}
        <AboutAndEducation />

        {/* 8. Client Testimonials & Instagram Connect */}
        <TestimonialsAndInstagram />

        {/* 9. Contact & Footer */}
        <ContactAndFooter onOpenBooking={handleOpenBooking} />
      </main>

      {/* AI chat assistant (RAG over Neon + pgvector) */}
      <ChatWidget onOpenBooking={handleOpenBooking} hideOverHeroOnPhones />

      {/* Interactive Consultation / Booking Modal */}
      <BookingModal
        isOpen={isBookingOpen}
        onClose={handleCloseBooking}
        preselectedLook={selectedLook}
        preselectedService={selectedService}
      />
    </div>
  );
}

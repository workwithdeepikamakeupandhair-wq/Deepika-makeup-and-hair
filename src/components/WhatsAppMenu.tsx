/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { WHATSAPP_CONTACTS } from '../data/portfolioData';
import { WhatsAppIcon } from './WhatsAppIcon';

interface WhatsAppMenuProps {
  /** Classes for the round trigger button (size, colors, hover). */
  buttonClassName: string;
  iconClassName?: string;
  /** Classes for the wrapper (e.g. responsive visibility). */
  className?: string;
}

/** Round WhatsApp button that opens a small menu to choose the USA or India number. */
export const WhatsAppMenu: React.FC<WhatsAppMenuProps> = ({ buttonClassName, iconClassName = 'w-5 h-5', className = '' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Chat on WhatsApp (choose USA or India)"
        title="Chat on WhatsApp"
        className={buttonClassName}
      >
        <WhatsAppIcon className={iconClassName} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="WhatsApp numbers"
          className="absolute right-0 top-full mt-2 z-50 w-60 rounded-xl bg-white text-[#1D1714] shadow-2xl border border-[#E7DFD6] p-1.5 normal-case tracking-normal"
        >
          <p className="px-3 pt-1.5 pb-1 text-[10px] font-sans uppercase tracking-[0.18em] text-[#9E7D53]">
            Chat on WhatsApp
          </p>
          {WHATSAPP_CONTACTS.map((c) => (
            <a
              key={c.country}
              role="menuitem"
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F4EFEA] focus-visible:bg-[#F4EFEA] outline-none transition-colors"
            >
              <span className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0">
                <WhatsAppIcon className="w-4 h-4" />
              </span>
              <span className="min-w-0 font-sans">
                <span className="block text-xs font-semibold">{c.country}</span>
                <span className="block text-[11px] text-[#6A5F56]">{c.number}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BUSINESS_INFO } from '../data/portfolioData';
import { WhatsAppIcon } from './WhatsAppIcon';

/** Opens a WhatsApp chat with the AI assistant, with "Hi" ready to send (it welcomes them and helps them book). */
export const ASSISTANT_WHATSAPP_CHAT = `${BUSINESS_INFO.assistantWhatsappUrl}?text=${encodeURIComponent('Hi')}`;

interface WhatsAppButtonProps {
  /** Classes for the round button (size, colors, hover). */
  buttonClassName: string;
  iconClassName?: string;
  /** Classes for the wrapper (e.g. responsive visibility). */
  className?: string;
}

/** Round WhatsApp button that opens a chat with the AI assistant's number. */
export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({ buttonClassName, iconClassName = 'w-5 h-5', className = '' }) => (
  <div className={className}>
    <a
      href={ASSISTANT_WHATSAPP_CHAT}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      className={buttonClassName}
    >
      <WhatsAppIcon className={iconClassName} />
    </a>
  </div>
);

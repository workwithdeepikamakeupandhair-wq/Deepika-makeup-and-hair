/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Send your email with…" — shown on computers instead of a plain mailto: link, because most computers have no
 * mail app set up and the click would silently do nothing. Phones skip this and open their mail app directly.
 */
import React, { useEffect, useState } from 'react';
import { X, ArrowUpRight, Copy, Check } from 'lucide-react';
import { BUSINESS_INFO } from '../data/portfolioData';
import { EmailDraft, draftAsText, emailLinks, isPhoneOrTablet } from '../data/inquiryEmail';
import { copyText } from '../clipboard';

/** onClick for an email link: phones follow the mailto: link as usual; on computers, `openChooser` runs instead. */
export function chooserOnComputers(openChooser: () => void) {
  return (e: React.MouseEvent) => {
    if (isPhoneOrTablet()) return;
    e.preventDefault();
    openChooser();
  };
}

interface EmailChooserProps {
  /** The email to send; null keeps the chooser closed. */
  draft: EmailDraft | null;
  onClose: () => void;
  /** Called once the visitor has picked a way to send it. */
  onChosen?: () => void;
}

export const EmailChooser: React.FC<EmailChooserProps> = ({ draft, onClose, onChosen }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => setCopyState('idle'), [draft]);

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, onClose]);

  if (!draft) return null;

  const links = emailLinks(draft);
  const webmail = [
    { label: 'Gmail', hint: 'Opens Gmail in a new tab', href: links.gmail },
    { label: 'Outlook', hint: 'Outlook.com, Hotmail, Live', href: links.outlook },
    { label: 'Yahoo Mail', hint: 'Opens Yahoo Mail in a new tab', href: links.yahoo },
  ];

  // Webmail opens in a new tab, so the chooser can close. The mail-app and copy options keep it open, in case
  // nothing opened and the visitor wants to try another way.
  const chooseWebmail = () => {
    onChosen?.();
    window.setTimeout(onClose, 0);
  };

  const handleCopy = async () => {
    const ok = await copyText(draftAsText(draft));
    setCopyState(ok ? 'copied' : 'failed');
    if (ok) onChosen?.();
  };

  const row =
    'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white border border-[#E7DFD6] hover:border-[#1D1714] transition-colors text-left';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-chooser-title"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#1D1714]/60 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-[#FAF7F2] text-[#1D1714] font-sans rounded-2xl border border-[#E7DFD6] shadow-2xl p-6 space-y-5"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white border border-[#E7DFD6] flex items-center justify-center hover:bg-[#1D1714] hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-1 pr-10">
          <h2 id="email-chooser-title" className="font-serif text-2xl font-medium">
            Send your email with
          </h2>
          <p className="text-xs text-[#6A5F56] leading-relaxed">
            Your message to {BUSINESS_INFO.artist.split(' ')[0]} is already written. Pick where you check your email.
          </p>
        </div>

        <div className="space-y-2">
          {webmail.map((o) => (
            <a key={o.label} href={o.href} target="_blank" rel="noopener noreferrer" onClick={chooseWebmail} className={row}>
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-[11px] text-[#8A7E73]">{o.hint}</span>
              </span>
              <ArrowUpRight className="w-4 h-4 text-[#9E7D53] shrink-0" />
            </a>
          ))}

          <a href={links.mailto} onClick={() => onChosen?.()} className={row}>
            <span>
              <span className="block text-sm font-medium">Mail app on this computer</span>
              <span className="block text-[11px] text-[#8A7E73]">Outlook desktop, Apple Mail, Thunderbird</span>
            </span>
            <ArrowUpRight className="w-4 h-4 text-[#9E7D53] shrink-0" />
          </a>

          <button type="button" onClick={handleCopy} className={row}>
            <span>
              <span className="block text-sm font-medium">{copyState === 'copied' ? 'Copied!' : 'Copy the email'}</span>
              <span className="block text-[11px] text-[#8A7E73]">Paste it into any mail app</span>
            </span>
            {copyState === 'copied' ? (
              <Check className="w-4 h-4 text-[#3B7A57] shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-[#9E7D53] shrink-0" />
            )}
          </button>
        </div>

        <p role="status" className="text-[11px] text-center text-[#6A5F56] leading-relaxed">
          {copyState === 'failed'
            ? 'Could not copy here. Please email us directly at '
            : copyState === 'copied'
              ? 'Paste it into a new email to '
              : 'Sends to '}
          <span className="select-all font-medium text-[#1D1714] break-all">{BUSINESS_INFO.email}</span>
        </p>
      </div>
    </div>
  );
};

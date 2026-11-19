/**
 * The lead's whole WhatsApp conversation with Pooja, shown like WhatsApp in the lead panel: the customer's messages on
 * the left, Pooja's replies (and messages sent from the dashboard, like the booking confirmation) on the right.
 * Leads without a saved chat (e.g. from before chats were kept) show what they told us instead.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { ChatLine } from '../data/leads';
import { api, NotLoggedIn } from './api';

/** WhatsApp's *bold* and _italic_, kept as text otherwise (line breaks preserved by the bubble). */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, i) =>
        /^\*[^*\n]+\*$/.test(part) ? (
          <strong key={i}>{part.slice(1, -1)}</strong>
        ) : /^_[^_\n]+_$/.test(part) ? (
          <em key={i}>{part.slice(1, -1)}</em>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const ChatTranscript: React.FC<{ leadId: string; fallbackNotes: string | null; onLoggedOut: () => void }> = ({ leadId, fallbackNotes, onLoggedOut }) => {
  const [chat, setChat] = useState<{ messages: ChatLine[]; more: boolean } | null>(null);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setChat(await api.chat(leadId));
      setError('');
    } catch (err) {
      if (err instanceof NotLoggedIn) onLoggedOut();
      else setError(err instanceof Error ? err.message : 'Could not load the chat.');
    }
  }, [leadId, onLoggedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  // Open at the newest message, like WhatsApp
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [chat]);

  if (error) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-[#F2C9C4] bg-[#FDF1EF] px-4 py-3 text-sm text-[#A1332A]">
        <span>{error}</span>
        <button onClick={() => void load()} className="shrink-0 font-medium underline">
          Try again
        </button>
      </div>
    );
  }
  if (!chat) return <p className="text-sm text-[#6A5F56]" aria-busy="true">Loading the WhatsApp chat…</p>;

  if (!chat.messages.length) {
    return fallbackNotes ? (
      <section>
        <h3 className="text-xs uppercase tracking-[0.12em] text-[#9E7D53] mb-2">What they told us</h3>
        <p className="whitespace-pre-wrap rounded-2xl border border-[#E7DFD6] bg-white p-4 text-sm text-[#1D1714] leading-relaxed">{fallbackNotes}</p>
      </section>
    ) : (
      <p className="text-sm text-[#A39689]">No WhatsApp messages are saved for this number.</p>
    );
  }

  return (
    <section aria-labelledby="chat-title">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 id="chat-title" className="text-xs uppercase tracking-[0.12em] text-[#9E7D53]">
          WhatsApp chat with Pooja
        </h3>
        <span className="text-[11px] text-[#A39689] tabular-nums">
          {chat.messages.length} message{chat.messages.length === 1 ? '' : 's'}
        </span>
      </div>
      <div ref={box} role="log" aria-label="WhatsApp chat" tabIndex={0} className="max-h-[520px] overflow-y-auto rounded-2xl border border-[#E7DFD6] bg-[#EFEAE2] px-3 py-3 space-y-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#9E7D53]">
        {chat.more && <p className="pb-1 text-center text-[11px] text-[#6A5F56]">Showing the latest {chat.messages.length} messages.</p>}
        {chat.messages.map((m, i) => {
          const newDay = i === 0 || dayOf(m.at) !== dayOf(chat.messages[i - 1].at);
          const fromCustomer = m.role === 'customer';
          const note = /^\[[^\]]+\]$/.test(m.text.split('\n')[0]); // e.g. "[The customer sent their payment screenshot]"
          return (
            <React.Fragment key={i}>
              {newDay && (
                <p className="py-1 text-center">
                  <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-[#6A5F56] shadow-xs">{dayOf(m.at)}</span>
                </p>
              )}
              <div className={`flex ${fromCustomer ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-1.5 text-[13px] leading-relaxed text-[#1D1714] shadow-xs whitespace-pre-wrap break-words ${
                    fromCustomer ? 'bg-white rounded-tl-sm' : 'bg-[#D9FDD3] rounded-tr-sm'
                  }`}
                >
                  {!fromCustomer && i > 0 && chat.messages[i - 1].role === 'customer' && <p className="text-[11px] font-semibold text-[#1F7A45]">Pooja</p>}
                  {note ? (
                    <span className="inline-flex items-center gap-1.5 italic text-[#6A5F56]">
                      <ImageIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      {m.text.split('\n')[0].slice(1, -1)}
                      {m.text.includes('\n') ? `: ${m.text.split('\n').slice(1).join(' ')}` : ''}
                    </span>
                  ) : (
                    <Formatted text={m.text} />
                  )}
                  <span className="ml-2 float-right mt-1 text-[10px] text-[#8A8F8A]">{timeOf(m.at)}</span>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
};

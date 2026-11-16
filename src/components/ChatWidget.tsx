/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { BotMessageSquare, Calendar, Instagram, SendHorizontal, X } from 'lucide-react';
import { BUSINESS_INFO } from '../data/portfolioData';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatWidgetProps {
  onOpenBooking: () => void;
}

const GREETING: ChatMessage = {
  role: 'assistant',
  content: `Hi, I'm ${BUSINESS_INFO.artist}'s virtual assistant. Ask me about bridal packages, makeup & hair services, masterclasses, or how to book.`,
};

const SUGGESTIONS = [
  "What's included in the bridal package?",
  'How much is airbrush bridal makeup?',
  'Do you offer makeup classes?',
  'How do I book a date?',
];

/** Instagram's brand gradient, so the floating button reads as Instagram at a glance. */
const INSTAGRAM_GRADIENT =
  'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)';

/** Only the most recent turns are sent; the server keeps the same limit. */
const HISTORY_LIMIT = 8;

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;

/** Renders plain text with clickable links and preserved line breaks. */
function MessageText({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[#C5A880] underline-offset-2 break-all hover:text-[#9E7D53]"
          >
            {part.replace(/^https?:\/\/(www\.)?/, '')}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ onOpenBooking }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the newest message in view while a reply streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Stop any in-flight reply if the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateLastMessage = (content: string) =>
    setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content }]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || isStreaming) return;

    // Skip the greeting and any empty turns; send the latest question last.
    const history = [
      ...messages.slice(1).filter((m) => m.content.trim()),
      { role: 'user' as const, content: question },
    ];
    setMessages((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }]);
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let reply = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-HISTORY_LIMIT) }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(
          res.status === 429
            ? "You're sending messages quickly — please wait a moment and try again."
            : data?.error || 'Something went wrong.'
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        updateLastMessage(reply);
      }
      reply += decoder.decode();
      updateLastMessage(reply.trim() || 'Sorry, I could not answer that. Please try again.');
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      updateLastMessage(
        `${reply ? `${reply}\n\n` : ''}${message} You can also reach ${BUSINESS_INFO.artist} on WhatsApp: ` +
          `${BUSINESS_INFO.phonePrimaryCountry} ${BUSINESS_INFO.whatsappUrl} or ${BUSINESS_INFO.phoneSecondaryCountry} ${BUSINESS_INFO.whatsappSecondaryUrl}`
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  const showSuggestions = messages.length === 1;
  const last = messages[messages.length - 1];
  const showTyping = isStreaming && last.role === 'assistant' && !last.content;

  return (
    <>
      {isOpen && (
        <section
          role="dialog"
          aria-label="Chat with Deepika's assistant"
          className="chat-panel-in fixed z-[45] bottom-24 right-4 left-4 sm:left-auto sm:right-6 sm:w-[380px] h-[min(600px,calc(100dvh-8rem))] flex flex-col bg-[#FAF7F2] border border-[#E7DFD6] rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <header className="px-5 py-4 bg-[#1D1714] text-[#FAF7F2] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-full border border-[#C5A880]/50 flex items-center justify-center text-[#C5A880]">
                <BotMessageSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-serif text-lg leading-tight truncate">{BUSINESS_INFO.name}</p>
                <p className="text-[10px] font-sans tracking-[0.18em] uppercase text-[#C5A880]">
                  Virtual Assistant
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[#FAF7F2]/80 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3" aria-live="polite">
            {messages.map((m, i) =>
              m.role === 'assistant' && !m.content ? null : (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed font-sans whitespace-pre-wrap break-words ${
                      m.role === 'user'
                        ? 'bg-[#1D1714] text-[#FAF7F2] rounded-br-md'
                        : 'bg-white text-[#1D1714] border border-[#E7DFD6] rounded-bl-md'
                    }`}
                  >
                    <MessageText text={m.content} />
                  </div>
                </div>
              )
            )}

            {showTyping && (
              <div className="flex justify-start" aria-label="Assistant is typing">
                <div className="px-4 py-3 bg-white border border-[#E7DFD6] rounded-2xl rounded-bl-md flex gap-1.5">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="chat-dot w-1.5 h-1.5 rounded-full bg-[#C5A880]"
                      style={{ animationDelay: `${d * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {showSuggestions && (
              <div className="pt-2 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="px-3 py-1.5 rounded-full border border-[#D9D0C5] bg-white text-[11px] font-sans text-[#1D1714] hover:border-[#C5A880] hover:bg-[#F4EFEA] transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#E7DFD6] bg-[#F4EFEA] px-3 pt-3 pb-2 space-y-2">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <label htmlFor="chat-input" className="sr-only">
                Type your question
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={1}
                maxLength={1000}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about services, looks, booking…"
                className="flex-1 resize-none max-h-28 px-3.5 py-2.5 bg-white border border-[#D9D0C5] rounded-xl text-[13px] text-[#1D1714] placeholder:text-[#9A8F86] focus:outline-none focus:border-[#C5A880] transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="btn-gold w-10 h-10 shrink-0 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <SendHorizontal className="w-4 h-4" />
              </button>
            </form>
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-[10px] text-[#6A5F56]">AI assistant · answers may be imperfect</p>
              <button
                onClick={onOpenBooking}
                className="flex items-center gap-1 text-[10px] font-sans uppercase tracking-[0.12em] font-medium text-[#9E7D53] hover:text-[#1D1714] transition-colors"
              >
                <Calendar className="w-3 h-3" />
                Book a consultation
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Launchers — wrapper does the positioning because .btn-gold sets position: relative.
          The Instagram link sits above the chat button and steps aside while the chat panel is open. */}
      <div className="fixed z-[45] bottom-5 right-4 sm:right-6 flex flex-col items-center gap-3">
        {!isOpen && (
          <a
            href={BUSINESS_INFO.instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Follow ${BUSINESS_INFO.instagramHandle} on Instagram (opens in a new tab)`}
            title={`Follow ${BUSINESS_INFO.instagramHandle} on Instagram`}
            className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-white transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A880]"
            style={{ background: INSTAGRAM_GRADIENT }}
          >
            <Instagram className="w-6 h-6" />
          </a>
        )}
        <button
          onClick={() => setIsOpen((o) => !o)}
          className="btn-gold w-14 h-14 rounded-full shadow-xl flex items-center justify-center"
          aria-label={isOpen ? 'Close chat' : 'Chat with us'}
          aria-expanded={isOpen}
        >
          {isOpen ? <X className="w-5 h-5" /> : <BotMessageSquare className="w-6 h-6" />}
        </button>
      </div>
    </>
  );
};

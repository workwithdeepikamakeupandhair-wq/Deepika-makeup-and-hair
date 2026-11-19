/**
 * The "WhatsApp booking" part of the lead panel: what Pooja booked (date and time, place, artist, quote and advance),
 * whether the time is still free on the calendar, the payment screenshots, and the team's Approve / ask-again buttons.
 * Approving confirms the booking and sends the customer their confirmation on WhatsApp.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarCheck, CalendarX, Clock, FileText, RotateCcw } from 'lucide-react';
import { ARTIST_LABELS, money, timeLabel, type BookingDetails } from '../data/bookingFlow';
import type { Lead } from '../data/leads';
import { api, NotLoggedIn, paymentProofUrl } from './api';
import { BookingStatusPill } from './controls';
import { eventDateLabel, fullDateTime } from './format';

/** WhatsApp only delivers our messages within 24 hours of the customer's last message. */
const WHATSAPP_WINDOW_MS = 24 * 3_600_000;

/** Images the browser can show inline (HEIC, PDFs and anything else open as files). */
const isViewableImage = (type: string) => /^image\/(jpeg|png|webp|gif)$/i.test(type);

/** Worth showing: the lead has a WhatsApp booking in progress, not just an enquiry. */
export const hasBooking = (b: BookingDetails) => Boolean(b.status || b.items.length || b.eventTime);

const Line: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[110px_1fr] gap-3 py-2 border-b border-[#F1ECE6] last:border-0">
    <dt className="text-xs uppercase tracking-[0.1em] text-[#9E7D53] pt-0.5">{label}</dt>
    <dd className="text-sm text-[#1D1714] break-words">{children}</dd>
  </div>
);

export const BookingPanel: React.FC<{
  lead: Lead;
  /** The booking was approved or sent back: the updated lead. */
  onChanged: (lead: Lead) => void;
  onLoggedOut: () => void;
}> = ({ lead, onChanged, onLoggedOut }) => {
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loadError, setLoadError] = useState('');
  const [acting, setActing] = useState<'approve' | 'reopen' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setBooking(await api.booking(lead.id));
      setLoadError('');
    } catch (err) {
      if (err instanceof NotLoggedIn) onLoggedOut();
      else setLoadError(err instanceof Error ? err.message : 'Could not load the booking.');
    }
  }, [lead.id, onLoggedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-[#F2C9C4] bg-[#FDF1EF] px-4 py-3 text-sm text-[#A1332A]">
        <span>{loadError}</span>
        <button onClick={() => void load()} className="shrink-0 font-medium underline">
          Try again
        </button>
      </div>
    );
  }
  if (!booking) return <p className="text-sm text-[#6A5F56]" aria-busy="true">Loading the WhatsApp booking…</p>;
  if (!hasBooking(booking)) return null;

  const b = booking;
  const name = lead.fullName;
  const waitingOnPayment = b.status === 'awaiting_payment' || b.status === 'payment_review';
  const lastMessage = b.lastCustomerMessageAt ? new Date(b.lastCustomerMessageAt).getTime() : null;
  const outsideWindow = lastMessage === null || now - lastMessage > WHATSAPP_WINDOW_MS;

  const act = async (kind: 'approve' | 'reopen') => {
    const question =
      kind === 'reopen'
        ? `Ask ${name} to send the payment again?\n\nThey get a WhatsApp message saying the advance payment couldn't be verified yet, with a request to share the screenshot again.`
        : b.status === 'awaiting_payment'
          ? `No payment screenshot was received for this booking.\n\nApprove it anyway (for example, if the advance${b.advance !== null ? ` of ${money(b.advance)}` : ''} reached you another way)? ${name} gets the booking confirmation on WhatsApp straight away.`
          : `Approve this booking?\n\nOnly approve once you've checked that the advance${b.advance !== null ? ` of ${money(b.advance)}` : ''} has arrived. ${name} gets the booking confirmation on WhatsApp straight away.`;
    if (!window.confirm(question)) return;
    setActing(kind);
    setResult(null);
    try {
      const r = kind === 'approve' ? await api.approveBooking(lead.id) : await api.reopenPayment(lead.id);
      setBooking(r.booking);
      onChanged(r.lead);
      const done = kind === 'approve' ? 'Booking confirmed.' : 'The booking is waiting for the advance again.';
      setResult(
        r.message.sent
          ? { ok: true, text: `${done} ${kind === 'approve' ? 'The confirmation was sent to the customer on WhatsApp.' : 'The customer was asked on WhatsApp to send the payment again.'}` }
          : { ok: false, text: `${done} But the WhatsApp message couldn't be sent${r.message.error ? ` (${r.message.error})` : ''}. Please message the customer directly.` },
      );
    } catch (err) {
      if (err instanceof NotLoggedIn) onLoggedOut();
      else setResult({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setActing(null);
    }
  };

  const slot = b.slot;
  const slotFree = slot.status === 'open';

  return (
    <section aria-labelledby="booking-title" className="rounded-2xl border border-[#E7DFD6] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1ECE6] px-4 py-3">
        <h3 id="booking-title" className="font-serif text-lg">
          WhatsApp booking
        </h3>
        <BookingStatusPill status={b.status} />
      </div>

      <div className="px-4">
        <dl>
          <Line label="When">
            {[eventDateLabel(lead.eventDate), timeLabel(b.eventTime)].filter(Boolean).join(' at ') || <span className="text-[#A39689]">Not given yet</span>}
          </Line>
          <Line label="Where">
            {lead.eventLocation || <span className="text-[#A39689]">No address yet</span>}
            {b.eventZip && <span className="text-[#6A5F56]"> · ZIP {b.eventZip}</span>}
          </Line>
          <Line label="Artist">
            {b.artist ? (
              <>
                {ARTIST_LABELS[b.artist]}
                <span className="text-xs text-[#6A5F56]"> ({b.artist === 'deepika' ? 'Atlanta area' : 'outside the Atlanta area'})</span>
              </>
            ) : (
              <span className="text-[#A39689]">Known once the ZIP code is given</span>
            )}
          </Line>
          {b.eventType && <Line label="Event">{b.eventType}</Line>}
          {b.contactPhone && <Line label="Contact phone">{b.contactPhone}</Line>}
          {b.specialRequirements && <Line label="Requests">{b.specialRequirements}</Line>}
        </dl>
      </div>

      {/* Quote */}
      {b.items.length > 0 && (
        <div className="mx-4 mb-4 rounded-xl bg-[#FAF7F2] px-3.5 py-3">
          <ul className="space-y-1 text-sm">
            {b.items.map((i, n) => (
              <li key={`${i.package}-${n}`} className="flex justify-between gap-3">
                <span>
                  {i.title}
                  {i.quantity > 1 && <span className="text-[#6A5F56]"> × {i.quantity}</span>}
                </span>
                <span className="tabular-nums">{money(i.unitPrice * i.quantity)}</span>
              </li>
            ))}
          </ul>
          {b.total !== null && (
            <dl className="mt-2.5 space-y-1 border-t border-[#E7DFD6] pt-2.5 text-sm tabular-nums">
              <div className="flex justify-between gap-3 font-semibold">
                <dt>Total</dt>
                <dd>{money(b.total)}</dd>
              </div>
              {b.advance !== null && (
                <div className="flex justify-between gap-3">
                  <dt>Advance ({b.advancePercent}%)</dt>
                  <dd>{money(b.advance)}</dd>
                </div>
              )}
              {b.balance !== null && (
                <div className="flex justify-between gap-3 text-[#6A5F56]">
                  <dt>Balance</dt>
                  <dd>{money(b.balance)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}

      {/* Calendar check */}
      <div
        className={`mx-4 mb-4 flex gap-2.5 rounded-xl px-3.5 py-3 text-sm ${
          slot.status === 'no_time' ? 'bg-[#F4EFEA] text-[#6A5F56]' : slotFree ? 'bg-[#EEF8F1] text-[#1F7A45]' : 'bg-[#FDECEC] text-[#B42318]'
        }`}
      >
        {slotFree || slot.status === 'no_time' ? <CalendarCheck className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <CalendarX className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
        <div className="min-w-0">
          <p className="font-medium">
            {slot.status === 'no_time'
              ? 'No time saved yet, so the calendar can’t be checked.'
              : slotFree
                ? 'Time is free on the calendar.'
                : slot.status === 'fully_booked'
                  ? 'The day is marked Fully booked on the calendar.'
                  : 'This time clashes with something on the calendar:'}
          </p>
          {!slotFree && slot.conflicts.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {slot.conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Payment */}
      {(b.status || b.proofs.length > 0) && (
        <div className="border-t border-[#F1ECE6] px-4 py-4">
          <h4 className="text-xs uppercase tracking-[0.12em] text-[#9E7D53]">Payment</h4>
          <ul className="mt-2 space-y-1 text-xs text-[#6A5F56]">
            {b.paymentRequestedAt && (
              <li className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" aria-hidden /> Advance asked for {fullDateTime(b.paymentRequestedAt)}
              </li>
            )}
            {b.paymentSubmittedAt && (
              <li className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" aria-hidden /> Screenshot received {fullDateTime(b.paymentSubmittedAt)}
              </li>
            )}
            {b.confirmedAt && (
              <li className="flex items-center gap-1.5 text-[#1F7A45]">
                <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Confirmed {fullDateTime(b.confirmedAt)}
                {b.confirmedByName ? ` by ${b.confirmedByName}` : ''}
              </li>
            )}
          </ul>

          {b.proofs.length > 0 ? (
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {b.proofs.map((p) => (
                <li key={p.id}>
                  <a
                    href={paymentProofUrl(p.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl border border-[#E7DFD6] bg-[#FAF7F2] overflow-hidden hover:border-[#9E7D53] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9E7D53]"
                    title={`Received ${fullDateTime(p.createdAt)}: open full size`}
                  >
                    {isViewableImage(p.contentType) ? (
                      <img src={paymentProofUrl(p.id)} alt={`Payment screenshot received ${fullDateTime(p.createdAt)}`} className="h-24 w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-24 flex-col items-center justify-center gap-1 text-xs text-[#6A5F56]">
                        <FileText className="w-5 h-5 text-[#9E7D53]" aria-hidden />
                        {p.contentType === 'application/pdf' ? 'PDF receipt' : 'Open file'}
                      </span>
                    )}
                  </a>
                  <p className="mt-1 text-[11px] text-[#A39689]">{fullDateTime(p.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            waitingOnPayment && <p className="mt-3 text-sm text-[#A39689]">No payment screenshot yet.</p>
          )}

          {waitingOnPayment && outsideWindow && (
            <p className="mt-3 flex gap-2 rounded-xl border border-[#F3E2AE] bg-[#FFF8E6] px-3.5 py-2.5 text-xs leading-relaxed text-[#8A6100]">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
              <span>
                The customer's last WhatsApp message was {lastMessage === null ? 'not found' : 'more than 24 hours ago'}, so WhatsApp may not deliver the automatic message. After
                approving, also message them directly with the WhatsApp button above.
              </span>
            </p>
          )}

          {waitingOnPayment && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => void act('approve')}
                disabled={acting !== null}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] disabled:opacity-50 ${
                  b.status === 'payment_review' ? 'bg-[#1F7A45] text-white hover:bg-[#18663A]' : 'border border-[#C7E7D3] bg-white text-[#1F7A45] hover:bg-[#EEF8F1]'
                }`}
              >
                <BadgeCheck className="w-4 h-4" aria-hidden /> {acting === 'approve' ? 'Approving…' : 'Approve booking'}
              </button>
              {b.status === 'payment_review' && (
                <button
                  onClick={() => void act('reopen')}
                  disabled={acting !== null}
                  className="inline-flex items-center gap-2 rounded-full border border-[#D9D0C5] bg-white px-4 py-2 text-xs font-medium hover:bg-[#F4EFEA] disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden /> {acting === 'reopen' ? 'Sending…' : 'Payment not received — ask again'}
                </button>
              )}
            </div>
          )}
          {b.status === 'awaiting_payment' && (
            <p className="mt-2 text-xs text-[#A39689]">Waiting for the customer to pay and send the screenshot. You can still approve if the advance reached you another way.</p>
          )}
        </div>
      )}

      <p role="status" aria-live="polite" className={result ? `mx-4 mb-4 rounded-xl px-3.5 py-3 text-sm ${result.ok ? 'bg-[#EEF8F1] text-[#1F7A45]' : 'bg-[#FDF1EF] text-[#A1332A]'}` : 'sr-only'}>
        {result?.text ?? ''}
      </p>
    </section>
  );
};

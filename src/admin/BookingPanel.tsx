/**
 * The "WhatsApp booking" part of the lead panel: the customer's enquiry form, who does the makeup, the quote and
 * advance, whether the time is still free on Deepika's calendar, the payment screenshots, and the team's buttons:
 * - an enquiry waiting for review: Approve (the customer gets their artist and prices) or Not available;
 * - a payment screenshot: Approve booking (the customer gets the confirmation) or Payment not received.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarCheck, CalendarX, Clock, FileText, RotateCcw, Send, XCircle } from 'lucide-react';
import { ARTIST_LABELS, money, PAYMENT_STAGES, timeLabel, type Artist, type BookingDetails } from '../data/bookingFlow';
import type { Lead } from '../data/leads';
import { api, NotLoggedIn, paymentProofUrl } from './api';
import { BookingStatusPill } from './controls';
import { eventDateLabel, fullDateTime } from './format';

/** WhatsApp only delivers our messages within 24 hours of the customer's last message. */
const WHATSAPP_WINDOW_MS = 24 * 3_600_000;

/** Images the browser can show inline (HEIC, PDFs and anything else open as files). */
const isViewableImage = (type: string) => /^image\/(jpeg|png|webp|gif)$/i.test(type);

/** Worth showing: the lead has a WhatsApp enquiry or booking in progress, not just a chat. */
export const hasBooking = (b: BookingDetails) =>
  Boolean(b.status || b.items.length || b.eventTime || b.enquiry.eventStartTime || b.enquiry.eventCity || b.enquiry.eventsCount !== null);

/** "1 bridal · 1 groom · 3 non-bridal" */
const people = (b: BookingDetails) =>
  [
    [b.enquiry.bridalCount, 'bridal'],
    [b.enquiry.groomCount, 'groom'],
    [b.enquiry.nonBridalCount, 'non-bridal'],
  ]
    .filter(([n]) => n !== null)
    .map(([n, what]) => `${n} ${what}`)
    .join(' · ');

const ARTIST_PLACE: Record<Artist, string> = { deepika: 'Atlanta area', senior: 'outside Atlanta' };

type Action = 'approve' | 'reopen' | 'enquiry_approve' | 'enquiry_decline';

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
  const [acting, setActing] = useState<Action | null>(null);
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
  const reviewing = b.status === 'enquiry_review';
  const lastMessage = b.lastCustomerMessageAt ? new Date(b.lastCustomerMessageAt).getTime() : null;
  const outsideWindow = lastMessage === null || now - lastMessage > WHATSAPP_WINDOW_MS;
  // The artist: decided when the enquiry is approved; until then, who the location points to under Settings
  const artist = b.artist ?? b.artistForLocation;
  const notGiven = <span className="text-[#A39689]">Not given yet</span>;

  const act = async (kind: Action) => {
    const advance = b.advance !== null ? ` of ${money(b.advance)}` : '';
    const question = {
      enquiry_approve: `Approve ${name}'s enquiry?\n\nThey get a WhatsApp message that ${
        b.artistForLocation === 'deepika' ? 'Deepika herself (Atlanta area)' : 'one of Deepika’s senior artists (outside Atlanta)'
      } will do their makeup, with the prices.`,
      enquiry_decline: `Mark ${name}'s enquiry as Not available?\n\nThey get a WhatsApp message that we're not available for their event${
        lead.eventDate ? ` on ${eventDateLabel(lead.eventDate)}` : ''
      }, and can send another date.`,
      reopen: `Ask ${name} to send the payment again?\n\nThey get a WhatsApp message saying the advance payment couldn't be verified yet, with a request to share the screenshot again.`,
      approve:
        b.status === 'awaiting_payment'
          ? `No payment screenshot was received for this booking.\n\nApprove it anyway (for example, if the advance${advance} reached you another way)? ${name} gets the booking confirmation on WhatsApp straight away.`
          : `Approve this booking?\n\nOnly approve once you've checked that the advance${advance} has arrived. ${name} gets the booking confirmation on WhatsApp straight away.`,
    }[kind];
    if (!window.confirm(question)) return;
    setActing(kind);
    setResult(null);
    try {
      const r =
        kind === 'enquiry_approve' || kind === 'enquiry_decline'
          ? await api.answerEnquiry(lead.id, kind === 'enquiry_approve' ? 'approve' : 'decline')
          : kind === 'approve'
            ? await api.approveBooking(lead.id)
            : await api.reopenPayment(lead.id);
      setBooking(r.booking);
      onChanged(r.lead);
      const done = {
        enquiry_approve: 'Enquiry approved.',
        enquiry_decline: 'Enquiry marked Not available.',
        approve: 'Booking confirmed.',
        reopen: 'The booking is waiting for the advance again.',
      }[kind];
      const told = {
        enquiry_approve: 'The customer got their artist and the prices on WhatsApp.',
        enquiry_decline: "The customer was told on WhatsApp that we're not available.",
        approve: 'The confirmation was sent to the customer on WhatsApp.',
        reopen: 'The customer was asked on WhatsApp to send the payment again.',
      }[kind];
      const teamQuotes = r.teamQuotes?.length ? ` There's no price list for ${r.teamQuotes.join(', ').replace(/_/g, ' ')} with this artist: please send them that quote yourself.` : '';
      setResult(
        r.message.sent
          ? { ok: !teamQuotes, text: `${done} ${told}${teamQuotes}` }
          : { ok: false, text: `${done} But the WhatsApp message couldn't be sent${r.message.error ? ` (${r.message.error})` : ''}. Please message the customer directly.${teamQuotes}` },
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
  const outsideWindowNote = (after: string) => (
    <p className="mt-3 flex gap-2 rounded-xl border border-[#F3E2AE] bg-[#FFF8E6] px-3.5 py-2.5 text-xs leading-relaxed text-[#8A6100]">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
      <span>
        The customer's last WhatsApp message was {lastMessage === null ? 'not found' : 'more than 24 hours ago'}, so WhatsApp may not deliver the automatic message. After {after}, also
        message them directly with the WhatsApp button above.
      </span>
    </p>
  );

  return (
    <section aria-labelledby="booking-title" className="rounded-2xl border border-[#E7DFD6] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1ECE6] px-4 py-3">
        <h3 id="booking-title" className="font-serif text-lg">
          WhatsApp booking
        </h3>
        <BookingStatusPill status={b.status} />
      </div>

      {/* The enquiry form's answers */}
      <div className="px-4">
        <dl>
          {b.eventType && <Line label="Occasion">{b.eventType}</Line>}
          <Line label="Event date">{eventDateLabel(lead.eventDate) ?? notGiven}</Line>
          <Line label="Location">
            {lead.eventLocation || notGiven}
            {b.enquiry.eventCity && !(lead.eventLocation ?? '').toLowerCase().includes(b.enquiry.eventCity.toLowerCase()) && (
              <span className="text-[#6A5F56]"> · {b.enquiry.eventCity}</span>
            )}
          </Line>
          <Line label="Event starts">{timeLabel(b.enquiry.eventStartTime) || notGiven}</Line>
          <Line label="Ready / reporting">{timeLabel(b.eventTime) || notGiven}</Line>
          <Line label="Makeup for">{people(b) || notGiven}</Line>
          <Line label="Events">{b.enquiry.eventsCount ?? notGiven}</Line>
          {b.specialRequirements && <Line label="Requirements">{b.specialRequirements}</Line>}
          <Line label="Artist">
            {artist ? (
              <>
                {ARTIST_LABELS[artist]}
                <span className="text-xs text-[#6A5F56]"> ({ARTIST_PLACE[artist]})</span>
                {!b.artist && <span className="block text-xs text-[#6A5F56]">Decided when you approve the enquiry, from the location.</span>}
                {!b.artist && artist === 'senior' && (
                  <span className="block text-xs text-[#8A6100]">
                    The location doesn't name a place in your Atlanta service area. If it is in Atlanta, add the city in Settings before approving.
                  </span>
                )}
              </>
            ) : (
              <span className="text-[#A39689]">Known once the location is given</span>
            )}
          </Line>
          {b.contactPhone && <Line label="Contact phone">{b.contactPhone}</Line>}
        </dl>
      </div>

      {/* The team's answer to the enquiry */}
      {(reviewing || b.enquirySubmittedAt) && (
        <div className="border-t border-[#F1ECE6] px-4 py-4">
          <h4 className="text-xs uppercase tracking-[0.12em] text-[#9E7D53]">Enquiry</h4>
          <ul className="mt-2 space-y-1 text-xs text-[#6A5F56]">
            {b.enquirySubmittedAt && (
              <li className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" aria-hidden /> Form completed {fullDateTime(b.enquirySubmittedAt)}
              </li>
            )}
            {b.enquiryReviewedAt && (
              <li className={`flex items-center gap-1.5 ${b.status === 'not_available' ? '' : 'text-[#1F7A45]'}`}>
                {b.status === 'not_available' ? <XCircle className="w-3.5 h-3.5" aria-hidden /> : <BadgeCheck className="w-3.5 h-3.5" aria-hidden />}
                {b.status === 'not_available' ? 'Marked Not available' : 'Approved'} {fullDateTime(b.enquiryReviewedAt)}
                {b.enquiryReviewedByName ? ` by ${b.enquiryReviewedByName}` : ' on WhatsApp'}
              </li>
            )}
          </ul>
          {reviewing && (
            <>
              <p className="mt-3 text-sm text-[#3A322C]">
                Approve to send {name} the news about their artist and the prices on WhatsApp. They were told the team would update them within two hours.
              </p>
              {outsideWindow && outsideWindowNote('answering')}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => void act('enquiry_approve')}
                  disabled={acting !== null}
                  className="inline-flex items-center gap-2 rounded-full bg-[#1F7A45] px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-[#18663A] disabled:opacity-50"
                >
                  <Send className="w-4 h-4" aria-hidden /> {acting === 'enquiry_approve' ? 'Approving…' : 'Approve · send prices'}
                </button>
                <button
                  onClick={() => void act('enquiry_decline')}
                  disabled={acting !== null}
                  className="inline-flex items-center gap-2 rounded-full border border-[#D9D0C5] bg-white px-4 py-2 text-xs font-medium hover:bg-[#F4EFEA] disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" aria-hidden /> {acting === 'enquiry_decline' ? 'Sending…' : 'Not available'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

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

      {/* Deepika's calendar at the ready / reporting time (a senior artist's booking doesn't take her time) */}
      {artist === 'senior' ? (
        <div className="mx-4 mb-4 flex gap-2.5 rounded-xl bg-[#F4EFEA] px-3.5 py-3 text-sm text-[#6A5F56]">
          <CalendarCheck className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <p className="font-medium">A senior artist does the makeup, so Deepika's calendar isn't needed.</p>
        </div>
      ) : (
        <div
          className={`mx-4 mb-4 flex gap-2.5 rounded-xl px-3.5 py-3 text-sm ${
            slot.status === 'no_time' ? 'bg-[#F4EFEA] text-[#6A5F56]' : slotFree ? 'bg-[#EEF8F1] text-[#1F7A45]' : 'bg-[#FDECEC] text-[#B42318]'
          }`}
        >
          {slotFree || slot.status === 'no_time' ? <CalendarCheck className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <CalendarX className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
          <div className="min-w-0">
            <p className="font-medium">
              {slot.status === 'no_time'
                ? 'No date and ready time yet, so the calendar can’t be checked.'
                : slotFree
                  ? 'The ready / reporting time is free on the calendar.'
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
      )}

      {/* Payment */}
      {((b.status && PAYMENT_STAGES.includes(b.status)) || b.proofs.length > 0) && (
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

          {waitingOnPayment && outsideWindow && outsideWindowNote('approving')}

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

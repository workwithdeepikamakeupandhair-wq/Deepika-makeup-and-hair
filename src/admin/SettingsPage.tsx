/**
 * Booking settings for the WhatsApp assistant (Pooja): the payment details she sends with the advance request, the
 * numbers that approve enquiries and payments on WhatsApp, how long a booking takes on the calendar, and the places of
 * the Atlanta area, where Deepika does the makeup herself.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, CreditCard, MapPin, MessageCircle, RefreshCw, Smartphone } from 'lucide-react';
import { DEFAULT_BOOKING_SETTINGS, type BookingSettings } from '../data/bookingFlow';
import { ADVANCE_PERCENT } from '../data/portfolioData';
import { api, NotLoggedIn } from './api';

interface Form {
  paymentDetails: string;
  appointmentHours: string;
  areas: string;
  approvers: string;
}

const toForm = (s: BookingSettings): Form => ({
  paymentDetails: s.paymentDetails,
  appointmentHours: String(s.appointmentHours),
  areas: s.atlantaAreas.join(', '),
  approvers: (s.approverWhatsapp ?? []).join(', '),
});

const listOf = (value: string) => value.split(/[,;\n]+/).map((v) => v.trim()).filter(Boolean);

const sameForm = (a: Form, b: Form) =>
  a.paymentDetails.trim() === b.paymentDetails.trim() &&
  Number(a.appointmentHours) === Number(b.appointmentHours) &&
  listOf(a.areas).join(',') === listOf(b.areas).join(',') &&
  listOf(a.approvers).join(',') === listOf(b.approvers).join(',');

const inputClass =
  'w-full rounded-xl border border-[#D9D0C5] bg-white p-3 text-sm outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40';

const Card: React.FC<{ icon: typeof Clock; title: string; htmlFor: string; children: React.ReactNode }> = ({ icon: Icon, title, htmlFor, children }) => (
  <section className="rounded-2xl border border-[#E7DFD6] bg-white p-4 sm:p-6 shadow-xs">
    <label htmlFor={htmlFor} className="flex items-center gap-2 font-serif text-xl">
      <Icon className="w-4 h-4 text-[#9E7D53]" aria-hidden /> {title}
    </label>
    <div className="mt-3 space-y-3">{children}</div>
  </section>
);

export const SettingsPage: React.FC<{ onLoggedOut: () => void }> = ({ onLoggedOut }) => {
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form>(toForm(DEFAULT_BOOKING_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof NotLoggedIn) onLoggedOut();
      else setError(err instanceof Error ? err.message : 'Something went wrong.');
    },
    [onLoggedOut],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const f = toForm(await api.settings());
      setSaved(f);
      setForm(f);
      setError('');
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  const change = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setState('idle');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('saving');
    try {
      const next = await api.saveSettings({
        paymentDetails: form.paymentDetails.trim(),
        appointmentHours: Number(form.appointmentHours),
        atlantaAreas: listOf(form.areas),
        approverWhatsapp: listOf(form.approvers),
      });
      const f = toForm(next);
      setSaved(f);
      setForm(f);
      setError('');
      setState('saved');
    } catch (err) {
      setState('idle');
      handleError(err);
    }
  };

  const unchanged = saved !== null && sameForm(form, saved);
  const noPaymentDetails = saved !== null && !saved.paymentDetails.trim();

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#6A5F56]">
            How Pooja, the WhatsApp assistant, takes bookings: the payment details she sends, who approves enquiries and payments, how long a booking takes on the calendar, and
            where Deepika does the makeup herself.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-full border border-[#E7DFD6] bg-white px-4 py-2 text-xs font-medium hover:bg-[#F4EFEA]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-[#F2C9C4] bg-[#FDF1EF] px-4 py-3 text-sm text-[#A1332A]">
          <span>{error}</span>
          <button onClick={() => void load()} className="shrink-0 font-medium underline">
            Try again
          </button>
        </div>
      )}

      {noPaymentDetails && (
        <div role="status" className="mt-4 flex gap-3 rounded-xl border border-[#F3E2AE] bg-[#FFF8E6] px-4 py-3 text-sm text-[#8A6100]">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <p>
            <strong>No payment details yet.</strong> Until you add them, Pooja can't ask customers for the advance: when a customer is ready to pay, she tells them the team will send the
            payment details and passes them to Deepika instead.
          </p>
        </div>
      )}

      <form onSubmit={save} className="mt-6 space-y-5" aria-busy={loading}>
        <Card icon={CreditCard} title="Payment details" htmlFor="settings-payment">
          <p className="text-sm text-[#6A5F56] leading-relaxed">
            Sent to the customer word for word when Pooja asks for the {ADVANCE_PERCENT}% advance, together with the booking summary and the amounts. Write exactly how they
            should pay.
          </p>
          <textarea
            id="settings-payment"
            rows={4}
            maxLength={600}
            value={form.paymentDetails}
            onChange={(e) => change({ paymentDetails: e.target.value })}
            placeholder="e.g. Zelle: +1 980-497-7720 (Deepika S)"
            className={inputClass}
          />
          <p className="flex gap-2 rounded-xl bg-[#F6EFE7] px-3.5 py-3 text-xs leading-relaxed text-[#5A4D42]">
            <MessageCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#25D366]" aria-hidden />
            <span>
              Pooja then asks for the payment screenshot. Nothing counts as paid until you check the screenshot and approve the booking (in Leads, or on WhatsApp below).
            </span>
          </p>
        </Card>

        <Card icon={Smartphone} title="Approve on WhatsApp" htmlFor="settings-approvers">
          <p className="text-sm text-[#6A5F56] leading-relaxed">
            These WhatsApp numbers get, from the assistant's number:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[#6A5F56] leading-relaxed">
            <li>
              every completed <strong>enquiry form</strong>, with two buttons: <strong>Approve</strong> (the customer gets their artist and the prices) or{' '}
              <strong>Not available</strong> (the customer is told);
            </li>
            <li>
              every <strong>payment screenshot</strong>, with the booking details and two buttons: <strong>Approve</strong> (the booking is confirmed and the customer gets the
              confirmation) or <strong>Not received</strong> (the customer is asked to send it again).
            </li>
          </ul>
          <p className="text-sm text-[#6A5F56] leading-relaxed">
            Use full international numbers, separated by commas. These numbers talk to the assistant only for approvals, not as customers.
          </p>
          <input
            id="settings-approvers"
            type="text"
            inputMode="tel"
            value={form.approvers}
            onChange={(e) => change({ approvers: e.target.value })}
            placeholder="+91 70229 08519"
            className={`${inputClass} tabular-nums`}
          />
          <p className="text-xs text-[#A39689]">Leave empty to approve only here in the dashboard. Up to 5 numbers.</p>
        </Card>

        <Card icon={Clock} title="Booking length" htmlFor="settings-hours">
          <p className="text-sm text-[#6A5F56] leading-relaxed">
            How long each of Deepika's bookings takes on the calendar, from its makeup ready / reporting time. The calendar check on an enquiry, and again before Pooja asks for
            the advance, treats every booking that day as taking this long, so two bookings never overlap.
          </p>
          <div className="flex items-center gap-3">
            <input
              id="settings-hours"
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              required
              value={form.appointmentHours}
              onChange={(e) => change({ appointmentHours: e.target.value })}
              className={`${inputClass} max-w-[120px] tabular-nums`}
            />
            <span className="text-sm text-[#6A5F56]">hours</span>
          </div>
        </Card>

        <Card icon={MapPin} title="Atlanta service area" htmlFor="settings-areas">
          <p className="text-sm text-[#6A5F56] leading-relaxed">
            Cities, towns and neighbourhoods, separated by commas. When you approve an enquiry whose location names one of these places, the customer is told that{' '}
            <strong>Deepika herself</strong> will do their makeup and gets her prices. Anywhere else (or a US state other than Georgia) gets{' '}
            <strong>one of her senior artists</strong> and the senior artist's prices.
          </p>
          <textarea
            id="settings-areas"
            rows={5}
            value={form.areas}
            onChange={(e) => change({ areas: e.target.value })}
            placeholder="Atlanta, Buckhead, Alpharetta, Marietta…"
            className={inputClass}
          />
          <p className="text-xs text-[#A39689]">
            The starting list is Atlanta, its neighbourhoods and the cities of metro Atlanta ({DEFAULT_BOOKING_SETTINGS.atlantaAreas.length} places). Add a town to include it, or
            remove places to narrow the area down.
          </p>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || state === 'saving' || unchanged}
            className="rounded-full bg-[#1D1714] px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-[#3A322C] disabled:opacity-40"
          >
            {state === 'saving' ? 'Saving…' : 'Save settings'}
          </button>
          {saved && !unchanged && (
            <button type="button" onClick={() => change(saved)} className="text-xs font-medium text-[#6A5F56] underline hover:text-[#1D1714]">
              Undo changes
            </button>
          )}
          <span role="status" className="text-xs text-[#1F7A45]">
            {state === 'saved' ? 'Saved. Pooja uses the new settings from her next reply.' : ''}
          </span>
        </div>
      </form>
    </main>
  );
};

/**
 * The leads dashboard: every enquiry from Meta ads, the website form and the WhatsApp assistant, with stage and
 * owner editable in place. Refreshes itself every minute so new ad leads appear without reloading. "Payments to
 * verify" lists the WhatsApp bookings whose payment screenshot waits for the team's approval.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, Inbox, Phone, RefreshCw, Search } from 'lucide-react';
import { timeLabel } from '../data/bookingFlow';
import { LEAD_SOURCES, LEAD_STAGES, type AdminUser, type Lead } from '../data/leads';
import { api, NotLoggedIn, type LeadsPageData } from './api';
import { AssigneeSelect, BookingStatusPill, SourcePill, StageSelect } from './controls';
import { channelLabel, eventDateLabel, fullDateTime, timeAgo } from './format';
import { LeadDrawer } from './LeadDrawer';

const AUTO_REFRESH_MS = 60_000;
const TO_VERIFY = 'payment_review';

type Changes = { stage?: string; assignedTo?: string | null; adminNotes?: string | null };

export const LeadsPage: React.FC<{
  onLoggedOut: () => void;
  /** The latest count of payments to verify, for the header's badge. */
  onPaymentsToVerify?: (n: number) => void;
  /** A booking was approved or sent back: the header's badge should refresh. */
  onBookingChanged?: () => void;
}> = ({ onLoggedOut, onPaymentsToVerify, onBookingChanged }) => {
  const [stage, setStage] = useState('');
  /** '' or 'payment_review' (the "Payments to verify" filter) */
  const [booking, setBooking] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<LeadsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const latestRequest = useRef(0);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof NotLoggedIn) onLoggedOut();
      else setError(err instanceof Error ? err.message : 'Something went wrong.');
    },
    [onLoggedOut],
  );

  // Search as you type, without a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (silent = false) => {
      const id = ++latestRequest.current;
      if (!silent) setLoading(true);
      try {
        const page = await api.leads({ stage, source, booking, q: query });
        if (id !== latestRequest.current) return; // a newer filter change already replaced this request
        setData(page);
        onPaymentsToVerify?.(page.paymentsToVerify);
        setError('');
        setUpdatedAt(new Date());
        setNow(Date.now());
      } catch (err) {
        if (id === latestRequest.current) handleError(err);
      } finally {
        if (id === latestRequest.current) setLoading(false);
      }
    },
    [stage, source, booking, query, handleError, onPaymentsToVerify],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.users().then(setUsers, handleError);
  }, [handleError]);

  // Refresh every minute while the tab is visible, unless a lead is open or extra pages were loaded
  const loadedExtraPages = (data?.leads.length ?? 0) > 50;
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === 'visible' && !openId && !loadedExtraPages) void load(true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [load, openId, loadedExtraPages]);

  const loadMore = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const page = await api.leads({ stage, source, booking, q: query, offset: data.leads.length });
      setData((d) => d && { ...d, hasMore: page.hasMore, leads: [...d.leads, ...page.leads.filter((l) => !d.leads.some((x) => x.id === l.id))] });
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingMore(false);
    }
  };

  /** Puts an updated lead into the list and moves its count to the new stage. */
  const replaceLead = (next: Lead, previousStage: string) =>
    setData((d) => {
      if (!d) return d;
      const counts = { ...d.counts };
      if (previousStage !== next.stage) {
        counts[previousStage] = Math.max(0, (counts[previousStage] ?? 1) - 1);
        counts[next.stage] = (counts[next.stage] ?? 0) + 1;
      }
      return { ...d, counts, leads: d.leads.map((l) => (l.id === next.id ? next : l)) };
    });

  /** Shows the change at once, saves it, and puts it back if saving fails. */
  const updateLead = async (lead: Lead, changes: Changes) => {
    const optimistic: Lead = {
      ...lead,
      ...(changes.stage !== undefined && { stage: changes.stage }),
      ...(changes.assignedTo !== undefined && {
        assignedTo: changes.assignedTo,
        assignedToName: users.find((u) => u.id === changes.assignedTo)?.name ?? null,
      }),
    };
    replaceLead(optimistic, lead.stage);
    try {
      const saved = await api.updateLead(lead.id, changes);
      replaceLead(saved, optimistic.stage);
      setError('');
      return saved;
    } catch (err) {
      replaceLead(lead, optimistic.stage);
      handleError(err);
      throw err;
    }
  };

  /** A booking was approved or sent back from the side panel: show the new lead, and refresh the badge. */
  const bookingChanged = (next: Lead, previous: Lead) => {
    replaceLead(next, previous.stage);
    if (previous.bookingStatus === TO_VERIFY && next.bookingStatus !== TO_VERIFY) {
      setData((d) => d && { ...d, paymentsToVerify: Math.max(0, d.paymentsToVerify - 1) });
    }
    onBookingChanged?.();
  };

  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const openLead = data?.leads.find((l) => l.id === openId) ?? null;
  const filtered = Boolean(stage || source || query || booking);
  const toVerify = data?.paymentsToVerify ?? 0;
  const verifying = booking === TO_VERIFY;

  return (
    <>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl">Leads</h1>
            <p className="mt-1 text-sm text-[#6A5F56]">Enquiries from your ads, the website and WhatsApp, newest first.</p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-full border border-[#E7DFD6] bg-white px-4 py-2 text-xs font-medium hover:bg-[#F4EFEA]"
            title={updatedAt ? `Last updated ${updatedAt.toLocaleTimeString()}` : undefined}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Payments to verify, then the stage tabs with counts */}
        <div role="tablist" aria-label="Filter by stage" className="mt-6 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            role="tab"
            aria-selected={verifying}
            onClick={() => {
              setBooking(verifying ? '' : TO_VERIFY);
              setStage('');
            }}
            title="WhatsApp bookings whose payment screenshot waits for your approval"
            className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
              verifying
                ? 'border-[#B4236E] bg-[#B4236E] text-white'
                : toVerify > 0
                  ? 'border-[#F5C6DE] bg-[#FCE8F3] text-[#B4236E] hover:bg-[#F9DCEC]'
                  : 'border-[#E7DFD6] bg-white text-[#6A5F56] hover:bg-[#F4EFEA]'
            }`}
          >
            <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Payments to verify
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${verifying ? 'bg-white/20' : toVerify > 0 ? 'bg-white text-[#B4236E]' : 'bg-[#F4EFEA]'}`}>
              {toVerify}
            </span>
          </button>
          <span aria-hidden className="shrink-0 my-1.5 w-px bg-[#E7DFD6]" />
          {[{ id: '', label: 'All' }, ...LEAD_STAGES].map((s) => {
            const active = !verifying && stage === s.id;
            const n = s.id ? (counts[s.id] ?? 0) : total;
            return (
              <button
                key={s.id || 'all'}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setStage(s.id);
                  setBooking('');
                }}
                className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                  active ? 'border-[#1D1714] bg-[#1D1714] text-white' : 'border-[#E7DFD6] bg-white text-[#1D1714] hover:bg-[#F4EFEA]'
                }`}
              >
                {s.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? 'bg-white/20' : 'bg-[#F4EFEA] text-[#6A5F56]'}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* Search and source filter */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search leads</span>
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E7D53]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email, campaign or place"
              className="w-full rounded-xl border border-[#E7DFD6] bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40"
            />
          </label>
          <label className="sm:w-56">
            <span className="sr-only">Filter by source</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-xl border border-[#E7DFD6] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40"
            >
              <option value="">All sources</option>
              {Object.entries(LEAD_SOURCES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div role="alert" className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-[#F2C9C4] bg-[#FDF1EF] px-4 py-3 text-sm text-[#A1332A]">
            <span>{error}</span>
            <button onClick={() => void load()} className="shrink-0 font-medium underline">
              Try again
            </button>
          </div>
        )}

        {/* Leads table */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-[#E7DFD6] bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left">
              <thead>
                <tr className="bg-[#F6EFE7] text-[11px] uppercase tracking-[0.12em] text-[#9E7D53]">
                  <th scope="col" className="px-5 py-3.5 font-semibold">Name</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Contact</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Source</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Service &amp; date</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Stage</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Assigned to</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1ECE6]">
                {data?.leads.map((lead) => (
                  <tr key={lead.id} onClick={() => setOpenId(lead.id)} className="cursor-pointer align-top hover:bg-[#FCFAF7]">
                    <td className="px-5 py-4">
                      <button onClick={() => setOpenId(lead.id)} className="text-left text-[15px] font-medium hover:text-[#9E7D53] focus-visible:outline-none focus-visible:underline">
                        {lead.fullName}
                      </button>
                      <p className="mt-0.5 text-xs text-[#A39689]">#{lead.id}</p>
                    </td>
                    <td className="px-4 py-4">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-sm tabular-nums text-[#3A322C] hover:text-[#9E7D53]">
                          <Phone className="w-3.5 h-3.5 text-[#D04F7A]" /> {lead.phone}
                        </a>
                      ) : (
                        <span className="text-sm text-[#A39689]">No phone</span>
                      )}
                      <p className={`mt-1 text-xs truncate max-w-[200px] ${lead.email ? 'text-[#6A5F56]' : 'text-[#C2853D]'}`}>{lead.email || 'No email'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <SourcePill source={lead.source} />
                      <p className="mt-1.5 text-xs text-[#6A5F56] truncate max-w-[210px]" title={lead.campaign ?? undefined}>
                        {lead.campaign || channelLabel(lead.channel) || ''}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm truncate max-w-[220px]" title={lead.service}>
                        {lead.service}
                      </p>
                      <p className="mt-1 text-xs text-[#6A5F56] truncate max-w-[220px]">
                        {[[eventDateLabel(lead.eventDate), timeLabel(lead.eventTime)].filter(Boolean).join(', '), lead.eventLocation].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {lead.bookingStatus && <BookingStatusPill status={lead.bookingStatus} className="mt-1.5" />}
                    </td>
                    <td className="px-4 py-4">
                      <StageSelect value={lead.stage} label={`Stage for ${lead.fullName}`} onChange={(s) => void updateLead(lead, { stage: s }).catch(() => {})} />
                    </td>
                    <td className="px-4 py-4">
                      <AssigneeSelect
                        value={lead.assignedTo}
                        users={users}
                        label={`Assigned to, for ${lead.fullName}`}
                        onChange={(id) => void updateLead(lead, { assignedTo: id }).catch(() => {})}
                      />
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-[#6A5F56] whitespace-nowrap" title={fullDateTime(lead.createdAt)}>
                      {timeAgo(lead.createdAt, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.leads.length === 0 && (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-[#F4EFEA] text-[#9E7D53] flex items-center justify-center">
                <Inbox className="w-6 h-6" />
              </div>
              <p className="mt-4 font-serif text-xl">{verifying && !source && !query ? 'No payments to verify' : filtered ? 'No leads match these filters' : 'No leads yet'}</p>
              <p className="mt-1 max-w-md text-sm text-[#6A5F56]">
                {verifying && !source && !query
                  ? 'When a customer sends their advance payment screenshot on WhatsApp, their booking appears here for you to check and approve.'
                  : filtered
                    ? 'Try another stage or source, or clear the search.'
                    : 'New enquiries from your Instagram and Facebook ads, the website booking form and the WhatsApp assistant will appear here automatically.'}
              </p>
            </div>
          )}
          {!data && loading && <p className="px-6 py-16 text-center text-sm text-[#6A5F56]">Loading leads…</p>}
        </div>

        {data?.hasMore && (
          <div className="mt-5 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-full border border-[#E7DFD6] bg-white px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#F4EFEA] disabled:opacity-60"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </main>

      {openLead && (
        <LeadDrawer
          key={openLead.id}
          lead={openLead}
          users={users}
          onClose={() => setOpenId(null)}
          onUpdate={(changes) => updateLead(openLead, changes)}
          onBookingChanged={(next) => bookingChanged(next, openLead)}
          onLoggedOut={onLoggedOut}
        />
      )}
    </>
  );
};

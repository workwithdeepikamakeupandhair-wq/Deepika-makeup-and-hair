/**
 * Availability calendar: the team marks days as Free, Few slots left or Fully booked, and blocks the times it's busy.
 * The WhatsApp assistant reads these when a customer asks whether Deepika is free on a date or at a time. Days nobody
 * marked are shown, and treated, as Free. Each day also shows how many leads have their event on it and its booked times (the team's
 * blocks and the WhatsApp bookings), so the team can see what's already taken.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MessageCircle, MousePointerClick, RefreshCw, Trash2, Users } from 'lucide-react';
import { AVAILABILITY_STATUSES, MAX_DAYS_PER_CHANGE, type AvailabilityDay, type AvailabilityStatus, type CalendarLead } from '../data/availability';
import { bookingStatusLabel, timeLabel, type CalendarAppointment, type TimeBlock } from '../data/bookingFlow';
import { api, NotLoggedIn } from './api';
import { BOOKING_STATUS_STYLE, STAGE_STYLE, stageLabel } from './format';

/** "Today" and "past" follow Atlanta time, like the assistant. */
const TIME_ZONE = 'America/New_York';
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Calendar dates are handled as UTC midnights, so the viewer's own time zone can never shift a day.
const fromIso = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};
const fmt = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...options }).format(fromIso(iso));

interface Month {
  year: number;
  /** 0 = January */
  month: number;
}

/** Six full weeks, Sunday first, around the month. */
function gridFor({ year, month }: Month): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = addDays(toIso(first), -first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const STATUS_STYLE: Record<AvailabilityStatus, { cell: string; chip: string; dot: string; button: string }> = {
  available: {
    cell: 'bg-[#EEF8F1] border-[#C7E7D3]',
    chip: 'bg-[#D5EFDF] text-[#1F7A45]',
    dot: 'bg-[#2E9E5B]',
    button: 'border-[#C7E7D3] bg-[#EEF8F1] text-[#1F7A45] hover:bg-[#E0F3E7]',
  },
  limited: {
    cell: 'bg-[#FFF8E6] border-[#F3E2AE]',
    chip: 'bg-[#FBEBC0] text-[#8A6100]',
    dot: 'bg-[#D99A00]',
    button: 'border-[#F3E2AE] bg-[#FFF8E6] text-[#8A6100] hover:bg-[#FCF0CF]',
  },
  booked: {
    cell: 'bg-[#FDECEC] border-[#F5C2C0]',
    chip: 'bg-[#F9D3D1] text-[#B42318]',
    dot: 'bg-[#D92D20]',
    button: 'border-[#F5C2C0] bg-[#FDECEC] text-[#B42318] hover:bg-[#FADCDB]',
  },
};

const statusLabel = (status: AvailabilityStatus | undefined) => AVAILABILITY_STATUSES.find((s) => s.id === status)?.label ?? 'Free';

/** What the WhatsApp assistant tells a customer who asks about a day with this mark. */
const ASSISTANT_SAYS: Record<AvailabilityStatus, string> = {
  available: 'the date is open. For the time they ask for, it checks the booked hours above and offers the free hours nearby if it’s taken.',
  limited: 'only a few slots are left that day, so they should book soon. Times are still checked against the booked hours above.',
  booked: 'the date is fully booked at any time, and suggests the nearest open dates instead.',
};

/** "08:00" + hours → "10:00" (stops at 23:59). */
const addHours = (hhmm: string, hours: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + Math.round(hours * 60), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** The hour buttons for a day: whole hours from 4 AM to 9 PM, the same start times the assistant offers. */
const HOURS = Array.from({ length: 18 }, (_, i) => 4 + i);
const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;

/** A compact range for the month grid: "8–11 AM", "11:30 AM–1 PM". */
function rangeShort(start: string, end: string): string {
  const part = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return { text: `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}`, ampm: h < 12 ? 'AM' : 'PM' };
  };
  const [a, b] = [part(start), part(end)];
  return a.ampm === b.ampm ? `${a.text}–${b.text} ${b.ampm}` : `${a.text} ${a.ampm}–${b.text} ${b.ampm}`;
}

/** One booked time on a day: a WhatsApp booking or a team block. */
type BookedTime = { kind: 'appointment'; start: string; end: string; item: CalendarAppointment } | { kind: 'block'; start: string; end: string; item: TimeBlock };

const WEEKDAYS = Array.from({ length: 7 }, (_, i) => fmt(addDays('2026-11-01', i), { weekday: 'short' })); // Nov 1, 2026 is a Sunday

export const CalendarPage: React.FC<{ onLoggedOut: () => void }> = ({ onLoggedOut }) => {
  const today = useMemo(todayIso, []);
  const [month, setMonth] = useState<Month>(() => {
    const [y, m] = today.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const grid = useMemo(() => gridFor(month), [month]);
  const [days, setDays] = useState<Record<string, AvailabilityDay>>({});
  const [leads, setLeads] = useState<CalendarLead[]>([]);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [appointmentHours, setAppointmentHours] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const anchor = useRef<string | null>(null);
  /**
   * Set once a change is saved. The next click then starts a new selection, even in "Select several days" mode, so the
   * day just marked (which stays selected for its note) is never changed again along with the next one.
   */
  const startFresh = useRef(false);
  const latestRequest = useRef(0);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof NotLoggedIn) onLoggedOut();
      else setError(err instanceof Error ? err.message : 'Something went wrong.');
    },
    [onLoggedOut],
  );

  const load = useCallback(
    async (silent = false) => {
      const id = ++latestRequest.current;
      if (!silent) setLoading(true);
      try {
        const data = await api.calendar(grid[0], grid[grid.length - 1]);
        if (id !== latestRequest.current) return; // the month changed meanwhile
        setDays(Object.fromEntries(data.days.map((d) => [d.date, d])));
        setLeads(data.leads);
        setBlocks(data.blocks ?? []);
        setAppointments(data.appointments ?? []);
        setAppointmentHours(data.appointmentHours ?? null);
        setError('');
      } catch (err) {
        if (id === latestRequest.current) handleError(err);
      } finally {
        if (id === latestRequest.current) setLoading(false);
      }
    },
    [grid, handleError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected([]);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const leadsByDay = useMemo(() => {
    const map: Record<string, CalendarLead[]> = {};
    for (const l of leads) (map[l.eventDate] ??= []).push(l);
    return map;
  }, [leads]);

  /** Each day's booked times (WhatsApp bookings and team blocks), earliest first. */
  const timesByDay = useMemo(() => {
    const map: Record<string, BookedTime[]> = {};
    for (const a of appointments) (map[a.date] ??= []).push({ kind: 'appointment', start: a.start, end: a.end, item: a });
    for (const b of blocks) (map[b.date] ??= []).push({ kind: 'block', start: b.start, end: b.end, item: b });
    for (const list of Object.values(map)) list.sort((x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end));
    return map;
  }, [appointments, blocks]);

  const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
  /** A day's mark; days nobody marked are Free from today on (past ones show no mark). */
  const statusOf = useCallback((date: string): AvailabilityStatus | undefined => days[date]?.status ?? (date >= today ? 'available' : undefined), [days, today]);
  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const date of grid) {
      const status = date.startsWith(monthKey) ? statusOf(date) : undefined;
      if (status) counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [grid, monthKey, statusOf]);

  const shiftMonth = (by: number) =>
    setMonth(({ year, month: m }) => {
      const d = new Date(Date.UTC(year, m + by, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });

  const goToday = () => {
    const [y, m] = today.split('-').map(Number);
    setMonth({ year: y, month: m - 1 });
  };

  /** Click: just this day. Ctrl/⌘-click or "Select several days": add or remove it. Shift-click: the whole range. */
  const pick = (date: string, e: React.MouseEvent) => {
    if (date < today) return;
    if (startFresh.current) {
      startFresh.current = false;
      anchor.current = date;
      setSelected((prev) => (prev.length === 1 && prev[0] === date ? [] : [date]));
      return;
    }
    if (e.shiftKey && anchor.current) {
      const [a, b] = [anchor.current, date].sort();
      const range = grid.filter((d) => d >= a && d <= b && d >= today);
      setSelected((prev) => [...new Set([...prev, ...range])].slice(0, MAX_DAYS_PER_CHANGE));
      return;
    }
    anchor.current = date;
    if (multi || e.ctrlKey || e.metaKey) {
      setSelected((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : prev.length < MAX_DAYS_PER_CHANGE ? [...prev, date] : prev));
    } else {
      setSelected((prev) => (prev.length === 1 && prev[0] === date ? [] : [date]));
    }
  };

  /** Shows the change at once, saves it, and puts it back if saving fails. */
  const mark = async (status: AvailabilityStatus | null) => {
    const dates = [...selected].sort();
    if (!dates.length) return;
    const before = days;
    setDays((prev) => {
      const next = { ...prev };
      for (const d of dates) {
        if (status) next[d] = { date: d, status, note: prev[d]?.note ?? null, updatedAt: new Date().toISOString(), updatedByName: prev[d]?.updatedByName ?? null };
        else delete next[d];
      }
      return next;
    });
    setSaving(true);
    try {
      await api.markDays(dates, status);
      startFresh.current = true;
      setError('');
      const what = `${dates.length === 1 ? fmt(dates[0], { month: 'short', day: 'numeric' }) : `${dates.length} days`}`;
      setAnnouncement(status ? `${what} marked ${statusLabel(status)}.` : `${what} cleared.`);
      if (dates.length > 1) setSelected([]);
      void load(true);
    } catch (err) {
      setDays(before);
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  // ----- One selected day: its note and the leads on it -----
  const single = selected.length === 1 ? selected[0] : null;
  const singleDay = single ? days[single] : undefined;
  const [note, setNote] = useState('');
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const savedNote = singleDay?.note ?? '';
  useEffect(() => {
    setNoteState('idle'); // another day was picked
  }, [single]);
  useEffect(() => {
    setNote(savedNote); // the day changed, or the saved note did (e.g. after a refresh)
  }, [single, savedNote]);

  const saveNote = async () => {
    if (!single) return;
    setNoteState('saving');
    try {
      // A day nobody marked is Free: a note saves it as Free
      const status = singleDay?.status ?? 'available';
      await api.markDays([single], status, note.trim() || null);
      setDays((prev) => ({
        ...prev,
        [single]: { date: single, status, note: note.trim() || null, updatedAt: new Date().toISOString(), updatedByName: prev[single]?.updatedByName ?? null },
      }));
      startFresh.current = true;
      setNoteState('saved');
      void load(true);
    } catch (err) {
      setNoteState('idle');
      handleError(err);
    }
  };

  // ----- One selected day: its booked times, and blocking a time -----
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockNote, setBlockNote] = useState('');
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockError, setBlockError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    // another day was picked
    setBlockStart('');
    setBlockEnd('');
    setBlockNote('');
    setBlockError('');
  }, [single]);

  const addBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!single) return;
    if (!blockStart || !blockEnd) return setBlockError('Choose a start and an end time.');
    if (blockEnd <= blockStart) return setBlockError('The end time must be after the start time.');
    setBlockSaving(true);
    setBlockError('');
    try {
      const block = await api.addTimeBlock(single, blockStart, blockEnd, blockNote.trim() || null);
      await load(true); // touching times with the same note were joined into one
      setBlockStart('');
      setBlockEnd('');
      setBlockNote('');
      startFresh.current = true;
      setAnnouncement(`${timeLabel(block.start)} to ${timeLabel(block.end)} marked as booked on ${fmt(single, { month: 'short', day: 'numeric' })}.`);
    } catch (err) {
      if (err instanceof NotLoggedIn) onLoggedOut();
      else setBlockError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBlockSaving(false);
    }
  };

  const removeBlock = async (block: TimeBlock) => {
    setRemoving(block.id);
    try {
      await api.removeTimeBlock(block.id);
      setBlocks((prev) => prev.filter((b) => b.id !== block.id));
      setAnnouncement(`${timeLabel(block.start)} to ${timeLabel(block.end)} is free again.`);
    } catch (err) {
      handleError(err);
      void load(true); // e.g. someone else already removed it
    } finally {
      setRemoving(null);
    }
  };

  // ----- The hour buttons: tap a free hour to mark it booked, tap a booked one to free it -----
  const [hourSaving, setHourSaving] = useState<number | null>(null);
  /** What takes each hour of the selected day: a WhatsApp booking of Deepika's, a team block, or nothing. */
  const hourState = (hour: number): { kind: 'free' } | BookedTime => {
    const [from, to] = [hour * 60, (hour + 1) * 60];
    const covers = (t: BookedTime) => minutesOf(t.start) < to && minutesOf(t.end) > from;
    const list = (single && timesByDay[single]) || [];
    return (
      list.find((t) => t.kind === 'appointment' && t.item.artist !== 'senior' && covers(t)) ??
      list.find((t) => t.kind === 'block' && covers(t)) ?? { kind: 'free' }
    );
  };

  const toggleHour = async (hour: number) => {
    if (!single || hourSaving !== null) return;
    const state = hourState(hour);
    if (state.kind === 'appointment') return; // a customer's booking: changed from Leads, not here
    setHourSaving(hour);
    try {
      if (state.kind === 'free') await api.addTimeBlock(single, hh(hour), hh(hour + 1), null);
      else await api.freeTime(single, hh(hour), hh(hour + 1));
      await load(true);
      setError('');
      setAnnouncement(`${hourLabel(hour)} on ${fmt(single, { month: 'short', day: 'numeric' })} is now ${state.kind === 'free' ? 'booked' : 'free'}.`);
    } catch (err) {
      handleError(err);
    } finally {
      setHourSaving(null);
    }
  };

  const currentStatus = single ? statusOf(single) : selected.length && selected.every((d) => statusOf(d) === statusOf(selected[0])) ? statusOf(selected[0]) : undefined;
  const sortedSelection = [...selected].sort();
  /** Which WhatsApp answer to describe; none when the selected days have different marks. */
  const assistantKey: AvailabilityStatus | null = currentStatus ?? null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Calendar</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#6A5F56]">
            Mark the hours you're booked on each day (and whole days that are fully booked). Pooja on WhatsApp and the website chat check this calendar whenever a customer asks
            about a date or a time, and offer the free hours nearby when a time is taken. A time is free unless the day is fully booked, you've marked that hour booked, or one of
            Deepika's WhatsApp bookings overlaps it (each booking takes{' '}
            {appointmentHours ? `${appointmentHours} hour${appointmentHours === 1 ? '' : 's'}` : 'the booking length'}, set in Settings). Days you don't mark are Free.
          </p>
        </div>
        <button
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
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Month */}
        <section aria-labelledby="calendar-month" className="rounded-2xl border border-[#E7DFD6] bg-white p-3 sm:p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#F4EFEA]">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 id="calendar-month" className="min-w-[150px] text-center font-serif text-xl sm:text-2xl" aria-live="polite">
                {fmt(`${monthKey}-01`, { month: 'long', year: 'numeric' })}
              </h2>
              <button onClick={() => shiftMonth(1)} aria-label="Next month" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#F4EFEA]">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={goToday} className="ml-1 rounded-full border border-[#E7DFD6] px-3 py-1.5 text-xs font-medium hover:bg-[#F4EFEA]">
                Today
              </button>
            </div>
            <button
              onClick={() => setMulti((m) => !m)}
              aria-pressed={multi}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                multi ? 'border-[#1D1714] bg-[#1D1714] text-white' : 'border-[#E7DFD6] hover:bg-[#F4EFEA]'
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5" /> Select several days
            </button>
          </div>

          {/* Legend with this month's counts */}
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#6A5F56]" aria-label="Legend">
            {AVAILABILITY_STATUSES.map((s) => (
              <li key={s.id} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${STATUS_STYLE[s.id].dot}`} />
                {s.label}
                <span className="tabular-nums text-[#A39689]">({monthCounts[s.id] ?? 0})</span>
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5">
              <Users aria-hidden className="w-3.5 h-3.5 text-[#9E7D53]" /> Leads with their event that day
            </li>
            <li className="hidden sm:inline-flex items-center gap-1.5">
              <Clock aria-hidden className="w-3.5 h-3.5 text-[#9E7D53]" /> Booked times
            </li>
          </ul>

          {/* Weekday names + days */}
          <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-2" aria-busy={loading}>
            {WEEKDAYS.map((w) => (
              <div key={w} aria-hidden className="pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9E7D53]">
                {w}
              </div>
            ))}
            {grid.map((date) => {
              const inMonth = date.startsWith(monthKey);
              const past = date < today;
              const day = days[date];
              const status = statusOf(date);
              const style = status ? STATUS_STYLE[status] : null;
              const isSelected = selected.includes(date);
              const n = leadsByDay[date]?.length ?? 0;
              const times = timesByDay[date]?.length ?? 0;
              return (
                <button
                  key={date}
                  type="button"
                  data-date={date}
                  onClick={(e) => pick(date, e)}
                  disabled={past}
                  aria-pressed={isSelected}
                  aria-label={`${fmt(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}: ${past && !day ? 'past' : statusLabel(status)}${n ? `, ${n} lead${n > 1 ? 's' : ''}` : ''}${times ? `, ${times} booked time${times > 1 ? 's' : ''}` : ''}${date === today ? ' (today)' : ''}`}
                  className={`relative flex min-h-[54px] sm:min-h-[92px] flex-col items-start gap-1 rounded-lg sm:rounded-xl border p-1.5 sm:p-2 text-left transition-[box-shadow,background-color] outline-none focus-visible:ring-2 focus-visible:ring-[#9E7D53] ${
                    style ? style.cell : 'border-[#EFE9E2] bg-white hover:bg-[#FCFAF7]'
                  } ${inMonth ? '' : 'opacity-45'} ${past ? 'cursor-default opacity-40' : 'cursor-pointer'} ${
                    isSelected ? 'ring-2 ring-[#1D1714] ring-offset-1' : ''
                  }`}
                >
                  <span
                    className={`text-xs sm:text-sm font-semibold tabular-nums ${
                      date === today ? 'inline-flex w-6 h-6 items-center justify-center rounded-full bg-[#1D1714] text-white' : 'text-[#1D1714]'
                    }`}
                  >
                    {Number(date.slice(8))}
                  </span>
                  {status && (
                    <>
                      <span aria-hidden className={`hidden sm:block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${style!.chip}`}>
                        {statusLabel(status)}
                      </span>
                      <span aria-hidden className={`sm:hidden absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full ${style!.dot}`} />
                    </>
                  )}
                  {/* Booked times (computers): the first two, then "+N more" */}
                  {times > 0 && (
                    <span aria-hidden className="hidden sm:flex max-w-full flex-col gap-0.5">
                      {timesByDay[date].slice(0, 2).map((t) => (
                        <span
                          key={t.kind === 'appointment' ? `a${t.item.leadId}` : `b${t.item.id}`}
                          className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                            t.kind === 'block' ? 'bg-[#1D1714] text-white' : t.item.status === 'confirmed' ? 'bg-[#D5EFDF] text-[#1F7A45]' : 'bg-[#FBEBC0] text-[#8A6100]'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5 shrink-0" /> {rangeShort(t.start, t.end)}
                        </span>
                      ))}
                      {times > 2 && <span className="text-[10px] font-semibold text-[#6A5F56]">+{times - 2} more</span>}
                    </span>
                  )}
                  {day?.note && (
                    <span aria-hidden className="hidden md:block max-w-full truncate text-[11px] text-[#6A5F56]" title={day.note}>
                      {day.note}
                    </span>
                  )}
                  {(n > 0 || times > 0) && (
                    <span aria-hidden className="absolute bottom-1 right-1 sm:bottom-auto sm:top-1.5 sm:right-1.5 flex items-center gap-1">
                      {times > 0 && (
                        <span className="sm:hidden inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1 py-0.5 text-[10px] font-semibold text-[#5A4D42]">
                          <Clock className="w-2.5 h-2.5" /> {times}
                        </span>
                      )}
                      {n > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1 sm:px-1.5 py-0.5 text-[10px] font-semibold text-[#7D6243]">
                          <Users className="hidden sm:block w-3 h-3" /> {n}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 hidden sm:block text-xs text-[#A39689]">
            Tip: Ctrl/⌘-click picks several days, Shift-click picks a range. Esc clears the selection.
          </p>
        </section>

        {/* Selected days */}
        <aside aria-labelledby="calendar-panel" className="rounded-2xl border border-[#E7DFD6] bg-white p-4 sm:p-5 shadow-xs lg:sticky lg:top-20">
          {selected.length === 0 ? (
            <>
              <h2 id="calendar-panel" className="font-serif text-xl">Mark your days and hours</h2>
              <p className="mt-2 text-sm text-[#6A5F56] leading-relaxed">
                Tap a day to see its hours, then tap the hours that are <strong>booked</strong> (for example a booking made by phone). WhatsApp bookings appear there on their own,
                and stay booked once you approve them.
              </p>
              <p className="mt-2 text-sm text-[#6A5F56] leading-relaxed">
                Use <strong>Fully booked</strong> only when the whole day is taken. To mark several days at once, turn on “Select several days” (or Ctrl/⌘-click them).
              </p>
              <div className="mt-4 flex gap-3 rounded-xl bg-[#F6EFE7] p-3.5 text-sm text-[#5A4D42]">
                <MessageCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#25D366]" aria-hidden />
                <p>
                  When a customer asks the WhatsApp assistant or the website chat about a date or a time, it checks here and answers free or booked from your marks and booked
                  times. Fully booked days get the nearest open dates suggested instead, and a taken time the nearest free times that day.
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 id="calendar-panel" className="font-serif text-xl">
                {single ? fmt(single, { weekday: 'long', month: 'long', day: 'numeric' }) : `${selected.length} days selected`}
              </h2>
              {!single && (
                <p className="mt-1 text-xs text-[#6A5F56]">
                  {sortedSelection.slice(0, 6).map((d) => fmt(d, { month: 'short', day: 'numeric' })).join(', ')}
                  {selected.length > 6 ? ` and ${selected.length - 6} more` : ''}
                </p>
              )}
              {single && <p className="mt-1 text-xs text-[#6A5F56]">Whole day: {statusLabel(statusOf(single))}{singleDay?.updatedByName ? ` · marked by ${singleDay.updatedByName}` : ''}</p>}

              {/* The day's hours: tap to mark booked or free. WhatsApp bookings show here on their own. */}
              {single && (
                <section className="mt-4" aria-labelledby="day-hours">
                  <h3 id="day-hours" className="text-xs uppercase tracking-[0.12em] text-[#9E7D53]">
                    Booked hours
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-[#6A5F56]">
                    Tap the hours that are taken (for example a booking made by phone); tap again to free them. When a customer asks for a taken time, Pooja offers the free hours nearby.
                  </p>
                  {singleDay?.status === 'booked' && (
                    <p className="mt-2 rounded-lg bg-[#FDECEC] px-3 py-2 text-xs text-[#B42318]">
                      The whole day is marked <strong>Fully booked</strong>, so Pooja offers no time at all. If only some hours are taken, clear that mark below and tap those hours instead.
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-4 gap-1.5" role="group" aria-label="Hours of the day">
                    {HOURS.map((hour) => {
                      const state = hourState(hour);
                      const who =
                        state.kind === 'appointment'
                          ? `${state.item.fullName} (lead #${state.item.leadId}) · ${bookingStatusLabel(state.item.status)}`
                          : state.kind === 'block'
                            ? `Booked ${timeLabel(state.start)}–${timeLabel(state.end)}${state.item.note ? `: ${state.item.note}` : ''}`
                            : 'Free';
                      return (
                        <button
                          key={hour}
                          type="button"
                          onClick={() => void toggleHour(hour)}
                          disabled={hourSaving !== null || state.kind === 'appointment'}
                          aria-pressed={state.kind !== 'free'}
                          aria-label={`${hourLabel(hour)}: ${who}`}
                          title={state.kind === 'appointment' ? `${who} (change it from Leads)` : who}
                          className={`relative rounded-lg border px-1 py-2 text-xs font-semibold tabular-nums transition-colors disabled:cursor-default ${
                            state.kind === 'block'
                              ? 'border-[#1D1714] bg-[#1D1714] text-white hover:bg-[#3A322C]'
                              : state.kind === 'appointment'
                                ? state.item.status === 'confirmed'
                                  ? 'border-[#C7E7D3] bg-[#D5EFDF] text-[#1F7A45]'
                                  : 'border-[#F3E2AE] bg-[#FBEBC0] text-[#8A6100]'
                                : 'border-[#E7DFD6] bg-white text-[#1D1714] hover:border-[#9E7D53] hover:bg-[#FAF7F2]'
                          } ${hourSaving === hour ? 'opacity-50' : ''}`}
                        >
                          {hourLabel(hour)}
                        </button>
                      );
                    })}
                  </div>
                  <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#6A5F56]" aria-label="Hour colours">
                    <li className="inline-flex items-center gap-1">
                      <span aria-hidden className="w-2.5 h-2.5 rounded-sm border border-[#E7DFD6] bg-white" /> Free
                    </li>
                    <li className="inline-flex items-center gap-1">
                      <span aria-hidden className="w-2.5 h-2.5 rounded-sm bg-[#1D1714]" /> Booked by you
                    </li>
                    <li className="inline-flex items-center gap-1">
                      <span aria-hidden className="w-2.5 h-2.5 rounded-sm bg-[#D5EFDF] border border-[#C7E7D3]" /> Confirmed booking
                    </li>
                    <li className="inline-flex items-center gap-1">
                      <span aria-hidden className="w-2.5 h-2.5 rounded-sm bg-[#FBEBC0] border border-[#F3E2AE]" /> Waiting for the advance
                    </li>
                  </ul>
                </section>
              )}

              <h3 className="mt-6 text-xs uppercase tracking-[0.12em] text-[#9E7D53]">{single ? 'Whole day' : 'Mark these days'}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#6A5F56]">
                <strong>Fully booked</strong> closes the whole day: Pooja offers no time at all and suggests other dates.{single ? ' If only some hours are taken, tap them above instead.' : ''}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2" role="group" aria-label="Set availability">
                {AVAILABILITY_STATUSES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => void mark(s.id)}
                    disabled={saving}
                    aria-pressed={currentStatus === s.id}
                    className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${STATUS_STYLE[s.id].button} ${
                      currentStatus === s.id ? 'ring-2 ring-offset-1 ring-[#1D1714]' : ''
                    }`}
                  >
                    <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${STATUS_STYLE[s.id].dot}`} /> {s.label}
                  </button>
                ))}
              </div>

              {assistantKey && (
                <p className="mt-4 rounded-xl bg-[#F6EFE7] px-3.5 py-3 text-xs leading-relaxed text-[#5A4D42]">
                  <MessageCircle className="inline w-3.5 h-3.5 -mt-0.5 mr-1 text-[#25D366]" aria-hidden />
                  On WhatsApp, the assistant tells customers {ASSISTANT_SAYS[assistantKey]}
                </p>
              )}

              {single && (
                <section className="mt-6" aria-labelledby="booked-times">
                  <h3 id="booked-times" className="text-xs uppercase tracking-[0.12em] text-[#9E7D53] mb-2">
                    All booked times this day
                  </h3>
                  {timesByDay[single]?.length ? (
                    <ul className="divide-y divide-[#F1ECE6] rounded-xl border border-[#E7DFD6]">
                      {timesByDay[single].map((t) =>
                        t.kind === 'appointment' ? (
                          <li key={`a${t.item.leadId}`} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium tabular-nums">
                                {timeLabel(t.start)}–{timeLabel(t.end)}
                              </p>
                              <p className="text-xs text-[#6A5F56] truncate">
                                {t.item.fullName} · #{t.item.leadId} · {t.item.service}
                              </p>
                              {t.item.artist === 'senior' && <p className="text-[11px] text-[#A39689]">Senior artist: doesn't take Deepika's time</p>}
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BOOKING_STATUS_STYLE[t.item.status] ?? STAGE_STYLE.lost}`}>
                              {bookingStatusLabel(t.item.status)}
                            </span>
                          </li>
                        ) : (
                          <li key={`b${t.item.id}`} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium tabular-nums">
                                {timeLabel(t.start)}–{timeLabel(t.end)} <span className="text-xs font-normal text-[#6A5F56]">· booked by you</span>
                              </p>
                              {t.item.note && <p className="text-xs text-[#6A5F56] break-words">{t.item.note}</p>}
                            </div>
                            <button
                              onClick={() => void removeBlock(t.item)}
                              disabled={removing === t.item.id}
                              aria-label={`Free ${timeLabel(t.start)} to ${timeLabel(t.end)} again`}
                              title="Free this time again"
                              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[#6A5F56] hover:bg-[#F4EFEA] hover:text-[#B42318] disabled:opacity-40"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden />
                            </button>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#A39689]">None yet: every time is free{singleDay?.status === 'booked' ? ' (but the day is fully booked)' : ''}.</p>
                  )}

                  <details className="mt-3 rounded-xl bg-[#FAF7F2] p-3 group">
                    <summary className="cursor-pointer text-xs font-medium text-[#5A4D42] marker:text-[#9E7D53]">
                      Add a time with a note, or one not on the hour (e.g. 7:30–10:00)
                    </summary>
                  <form onSubmit={addBlock} className="mt-2" aria-label="Book a time">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px] text-[#6A5F56]">
                        From
                        <input
                          type="time"
                          step={900}
                          value={blockStart}
                          onChange={(e) => {
                            const start = e.target.value;
                            setBlockStart(start);
                            setBlockError('');
                            // A sensible end: one booking's length later
                            if (start && !blockEnd && appointmentHours) setBlockEnd(addHours(start, appointmentHours));
                          }}
                          className="mt-1 w-full rounded-lg border border-[#D9D0C5] bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40"
                        />
                      </label>
                      <label className="text-[11px] text-[#6A5F56]">
                        To
                        <input
                          type="time"
                          step={900}
                          value={blockEnd}
                          onChange={(e) => {
                            setBlockEnd(e.target.value);
                            setBlockError('');
                          }}
                          className="mt-1 w-full rounded-lg border border-[#D9D0C5] bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40"
                        />
                      </label>
                    </div>
                    <label className="mt-2 block text-[11px] text-[#6A5F56]">
                      Note (only the team sees it)
                      <input
                        type="text"
                        maxLength={200}
                        value={blockNote}
                        onChange={(e) => setBlockNote(e.target.value)}
                        placeholder="e.g. Anita's reception, booked by phone"
                        className="mt-1 w-full rounded-lg border border-[#D9D0C5] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40"
                      />
                    </label>
                    {blockError && (
                      <p role="alert" className="mt-2 text-xs text-[#A1332A]">
                        {blockError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={blockSaving}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#1D1714] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-[#3A322C] disabled:opacity-40"
                    >
                      <Clock className="w-3.5 h-3.5" aria-hidden /> {blockSaving ? 'Saving…' : 'Mark as booked'}
                    </button>
                  </form>
                  </details>
                </section>
              )}

              {single && (
                <div className="mt-5">
                  <label htmlFor="day-note" className="block text-xs uppercase tracking-[0.12em] text-[#9E7D53] mb-2">
                    Team note (never shown to customers)
                  </label>
                  <textarea
                    id="day-note"
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setNoteState('idle');
                    }}
                    placeholder="e.g. Priya's wedding, ready by 7 am"
                    className="w-full rounded-xl border border-[#D9D0C5] bg-white p-3 text-sm outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={saveNote}
                      disabled={noteState === 'saving' || note.trim() === savedNote}
                      className="rounded-full bg-[#1D1714] px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-[#3A322C] disabled:opacity-40"
                    >
                      {noteState === 'saving' ? 'Saving…' : 'Save note'}
                    </button>
                    {noteState === 'saved' && (
                      <span className="text-xs text-[#1F7A45]" role="status">
                        Saved
                      </span>
                    )}
                  </div>
                </div>
              )}

              {single && (
                <section className="mt-5">
                  <h3 className="text-xs uppercase tracking-[0.12em] text-[#9E7D53] mb-2">Leads with their event this day</h3>
                  {leadsByDay[single]?.length ? (
                    <ul className="divide-y divide-[#F1ECE6] rounded-xl border border-[#E7DFD6]">
                      {leadsByDay[single].map((l) => (
                        <li key={l.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{l.fullName}</p>
                            <p className="text-xs text-[#6A5F56] truncate">
                              #{l.id} · {l.service}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STAGE_STYLE[l.stage] ?? STAGE_STYLE.lost}`}>{stageLabel(l.stage)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#A39689]">None yet.</p>
                  )}
                </section>
              )}

              <button onClick={() => setSelected([])} className="mt-5 text-xs font-medium text-[#6A5F56] underline hover:text-[#1D1714]">
                Clear selection
              </button>
            </>
          )}
        </aside>
      </div>
    </main>
  );
};

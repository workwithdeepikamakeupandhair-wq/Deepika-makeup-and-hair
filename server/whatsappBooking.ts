/**
 * Bookings made in a WhatsApp chat with Pooja, the assistant (server/whatsappBot.ts), from the enquiry form to the
 * team's approval of the payment. Each is a row in `bookings`, so it's also a lead in the dashboard.
 *
 * The parts that must be right are worked out here, never by the language model:
 * - that the enquiry form is complete before it goes to the team, and that prices come only after the team approves it;
 * - who does the makeup: Deepika herself when the event is in the Atlanta service area (a place listed in Settings),
 *   one of her senior artists anywhere else (with the senior artist's prices);
 * - the price of each package, from the price lists in portfolioData.ts;
 * - the advance (ADVANCE_PERCENT of the total) and the balance;
 * - that Deepika's time is still free on the calendar when the advance is asked for;
 * - that a booking is confirmed only when the team approves it, after checking the payment.
 *
 * Booking stages (`booking_status`): none while the customer fills in the enquiry form → 'enquiry_review' once it's
 * complete → 'quoted' when the team approves the enquiry (the customer gets the artist and prices) or 'not_available'
 * → 'awaiting_payment' once the payment message is sent → 'payment_review' when the customer sends a payment
 * screenshot → 'confirmed' when the team approves the payment.
 */
import { SERVICE_NOT_SPECIFIED } from '../src/data/leads.js';
import {
  artistForPlace,
  money,
  PAYMENT_STAGES,
  timeLabel,
  type Artist,
  type BookingDetails,
  type BookingStatus,
  type QuoteItem,
} from '../src/data/bookingFlow.js';
import {
  ADVANCE_PERCENT,
  BUSINESS_INFO as B,
  bookingName,
  FUNCTION_PRICES,
  PARTY_PRICES,
  SENIOR_ARTIST_SERVICES,
  SERVICES,
  type OccasionPrice,
} from '../src/data/portfolioData.js';
import { checkTime, checkTimeForAssistant, isIsoDate, plain, todayInAtlanta, toMinutes, fromMinutes, weekdayOf } from './availability.js';
import { getDb, pool } from './db.js';
import { getBookingSettings } from './settings.js';
import { chatStore } from './whatsappChats.js';
import {
  ARTIST_FOR_CUSTOMER,
  bookingConfirmedMessage,
  enquiryApprovedMessages,
  enquiryNotAvailableMessage,
  EVENT_OCCASIONS,
  longDate,
  paymentRequestMessage,
  QUOTATIONS,
  quotationsFor,
  type BookingSummary,
  type EventOccasion,
  type QuoteOccasion,
} from './whatsappQuotes.js';

// ---------- What can be booked, at which price ----------

interface Price {
  title: string;
  price: number;
  perPerson: boolean;
}

const ALL_SERVICES = [...SERVICES, ...SENIOR_ARTIST_SERVICES];
const fromList = (id: string): Price => {
  const s = ALL_SERVICES.find((x) => x.id === id);
  if (!s) throw new Error(`No service "${id}" in the price lists`);
  return { title: bookingName(s), price: s.price, perPerson: Boolean(s.perPerson) };
};
const fromOccasion = (q: OccasionPrice | undefined): Price => {
  if (!q) throw new Error('A quoted occasion price is missing from portfolioData.ts');
  return { title: q.bookingName, price: q.price, perPerson: Boolean(q.perPerson) };
};

/**
 * Every package Pooja can book, with its price for each artist who offers it, and the quotation that shows it.
 * Engagement / house warming / half saree, party and the separate charges are on Deepika's price list only.
 */
export const PACKAGES = {
  hd_bridal: { occasion: 'bridal', prices: { deepika: fromList('hd-bridal'), senior: fromList('senior-hd-bridal') } },
  advanced_bridal: { occasion: 'bridal', prices: { deepika: fromList('advanced-bridal'), senior: fromList('senior-advanced-bridal') } },
  airbrush_bridal: { occasion: 'bridal', prices: { deepika: fromList('airbrush-bridal'), senior: fromList('senior-airbrush-bridal') } },
  non_bridal: { occasion: 'non_bridal', prices: { deepika: fromList('non-bridal-family-glam'), senior: fromList('senior-non-bridal-family-glam') } },
  groom: { occasion: 'groom', prices: { deepika: fromList('groom-makeover'), senior: fromList('senior-groom-makeover') } },
  function_hd_makeup: { occasion: 'engagement', prices: { deepika: fromOccasion(FUNCTION_PRICES[0]) } },
  party_basic: { occasion: 'party', prices: { deepika: fromOccasion(PARTY_PRICES[0]) } },
  party_hd: { occasion: 'party', prices: { deepika: fromOccasion(PARTY_PRICES[1]) } },
  party_advanced: { occasion: 'party', prices: { deepika: fromOccasion(PARTY_PRICES[2]) } },
  only_makeup: { occasion: null, prices: { deepika: fromList('only-makeup') } },
  only_hair: { occasion: null, prices: { deepika: fromList('only-hair') } },
  only_saree_draping: { occasion: null, prices: { deepika: fromList('only-saree-draping') } },
} satisfies Record<string, { occasion: QuoteOccasion | null; prices: Partial<Record<Artist, Price>> }>;

export type PackageId = keyof typeof PACKAGES;
export const PACKAGE_IDS = Object.keys(PACKAGES) as PackageId[];
const isPackage = (id: string): id is PackageId => Object.hasOwn(PACKAGES, id);

/** For the tool description: "hd_bridal = HD Bridal Makeup ($550 with Deepika, $500 senior artist)". */
export const PACKAGE_GUIDE = PACKAGE_IDS.map((id) => {
  const p: { deepika?: Price; senior?: Price } = PACKAGES[id].prices;
  const each = p.deepika!.perPerson ? ' per person' : '';
  return `${id} = ${p.deepika!.title} ($${p.deepika!.price}${each} with Deepika${p.senior ? `, $${p.senior.price}${each} with a senior artist` : ''})`;
}).join('; ');

const ADVANCE_SHARE = ADVANCE_PERCENT / 100;
const cents = (usd: number) => Math.round(usd * 100) / 100;

// ---------- The customer's booking ----------

export interface Draft {
  id: string;
  fullName: string;
  contactPhone: string | null;
  eventType: string | null;
  eventDate: string | null;
  /** The form's makeup ready / reporting time: the time the booking takes on the calendar */
  eventTime: string | null;
  /** The form's event start time */
  startTime: string | null;
  /** The form's event location (city & venue), as the customer wrote it */
  address: string | null;
  city: string | null;
  state: string | null;
  bridalCount: number | null;
  groomCount: number | null;
  nonBridalCount: number | null;
  eventsCount: number | null;
  artist: Artist | null;
  items: QuoteItem[];
  total: number | null;
  advance: number | null;
  status: BookingStatus | null;
  specialRequirements: string | null;
  enquirySubmittedAt: Date | null;
  paymentRequestedAt: Date | null;
  createdAt: Date;
}

/** The booking's columns; `t` is the table alias with its dot, e.g. "b.". */
const draftColumns = (t = '') => `${t}id::text AS id, ${t}full_name, ${t}contact_phone, ${t}event_type,
  to_char(${t}event_date, 'YYYY-MM-DD') AS event_date, to_char(${t}event_time, 'HH24:MI') AS event_time,
  to_char(${t}event_start_time, 'HH24:MI') AS event_start_time, ${t}event_location, ${t}event_city, ${t}event_state,
  ${t}bridal_count, ${t}groom_count, ${t}non_bridal_count, ${t}events_count,
  ${t}artist, ${t}quote_items, ${t}total_price::float8 AS total_price, ${t}advance_amount::float8 AS advance_amount,
  ${t}booking_status, ${t}special_requirements, ${t}enquiry_submitted_at, ${t}payment_requested_at, ${t}created_at`;

interface DraftRow {
  id: string;
  full_name: string;
  contact_phone: string | null;
  event_type: string | null;
  event_date: string | null;
  event_time: string | null;
  event_start_time: string | null;
  event_location: string | null;
  event_city: string | null;
  event_state: string | null;
  bridal_count: number | null;
  groom_count: number | null;
  non_bridal_count: number | null;
  events_count: number | null;
  artist: Artist | null;
  quote_items: QuoteItem[] | null;
  total_price: number | null;
  advance_amount: number | null;
  booking_status: BookingStatus | null;
  special_requirements: string | null;
  enquiry_submitted_at: Date | null;
  payment_requested_at: Date | null;
  created_at: Date;
}

const toDraft = (r: DraftRow): Draft => ({
  id: r.id,
  fullName: r.full_name,
  contactPhone: r.contact_phone,
  eventType: r.event_type,
  eventDate: r.event_date,
  eventTime: r.event_time,
  startTime: r.event_start_time,
  address: r.event_location,
  city: r.event_city,
  state: r.event_state,
  bridalCount: r.bridal_count,
  groomCount: r.groom_count,
  nonBridalCount: r.non_bridal_count,
  eventsCount: r.events_count,
  artist: r.artist,
  items: r.quote_items ?? [],
  total: r.total_price,
  advance: r.advance_amount,
  status: r.booking_status,
  specialRequirements: r.special_requirements,
  enquirySubmittedAt: r.enquiry_submitted_at,
  paymentRequestedAt: r.payment_requested_at,
  createdAt: r.created_at,
});

/** Who the booking's place points to under the current Settings (Deepika in the Atlanta area, a senior artist outside). */
export const artistForDraft = (d: Pick<Draft, 'city' | 'state' | 'address'>, areas: readonly string[]) =>
  artistForPlace({ city: d.city, state: d.state, location: d.address }, areas);

/** "1 bridal, 1 groom, 3 non-bridal" (the form's numbers that aren't 0). */
export function peopleSummary(d: Pick<Draft, 'bridalCount' | 'groomCount' | 'nonBridalCount'>): string {
  return [
    [d.bridalCount, 'bridal'],
    [d.groomCount, 'groom'],
    [d.nonBridalCount, 'non-bridal'],
  ]
    .filter(([n]) => typeof n === 'number' && n > 0)
    .map(([n, what]) => `${n} ${what}`)
    .join(', ');
}

/**
 * The customer's current WhatsApp booking: their latest one from the last 120 days that isn't lost (a confirmed one
 * too, so Pooja can answer questions about it). Leads the team marked Confirmed by hand, without a WhatsApp booking,
 * don't count. Null when there's none, or without a database.
 */
export async function currentBooking(waId: string): Promise<Draft | null> {
  if (!pool) return null;
  const { rows } = await pool.query<DraftRow>(
    `SELECT ${draftColumns()} FROM bookings
      WHERE channel = 'whatsapp' AND phone = $1 AND status <> 'lost' AND (booking_status IS NOT NULL OR status <> 'confirmed')
        AND created_at > now() - interval '120 days'
      ORDER BY id DESC LIMIT 1`,
    [`+${waId}`],
  );
  return rows[0] ? toDraft(rows[0]) : null;
}

/** Saved until the customer types their name (their WhatsApp profile name may be a nickname). */
const NO_NAME = 'WhatsApp customer';

/**
 * Whether the booking's name is one the customer typed in the chat (`customerSaid`: all their messages). Until then
 * it's their profile name or a placeholder, and Pooja still has to ask for it.
 */
const nameTyped = (name: string, customerSaid: string) => name !== NO_NAME && plain(customerSaid).includes(plain(name));

/**
 * Quotations with a choice of packages, and the word a customer uses for each ("I'll take the airbrush one").
 * Used to check that the saved package is the one the customer last named themselves.
 */
const CHOICES: Record<string, { group: string; word: string; re: RegExp }> = {
  hd_bridal: { group: 'bridal', word: 'HD', re: /\bhd\b/g },
  advanced_bridal: { group: 'bridal', word: 'Advanced', re: /\badvanced\b/g },
  airbrush_bridal: { group: 'bridal', word: 'Airbrush', re: /\bair ?brush\b/g },
  party_basic: { group: 'party', word: 'Basic', re: /\bbasic\b/g },
  party_hd: { group: 'party', word: 'HD', re: /\bhd\b/g },
  party_advanced: { group: 'party', word: 'Advanced', re: /\badvanced\b/g },
};

/**
 * For each saved package that came from a choice (bridal: HD / Advanced / Airbrush; party: Basic / HD / Advanced),
 * the package the customer named last must be that one. Returns what's wrong, or null.
 */
export function packageChoiceProblem(items: QuoteItem[], customerSaid: string): string | null {
  const said = plain(customerSaid);
  for (const item of items) {
    const choice = CHOICES[item.package];
    if (!choice) continue;
    const options = Object.entries(CHOICES).filter(([, c]) => c.group === choice.group);
    let latest: { id: string; at: number } | null = null;
    for (const [id, c] of options) {
      for (const m of said.matchAll(new RegExp(c.re.source, 'g'))) if (!latest || m.index! > latest.at) latest = { id, at: m.index! };
    }
    const names = options.map(([, c]) => c.word).join(', ');
    if (!latest) return `The customer hasn't chosen their ${choice.group} package in their own words yet (${names}): ask which one they'd like, save it with save_booking_details, then try again.`;
    // The same word in two groups (HD, Advanced) is fine: it names this item's package if the words match
    if (CHOICES[latest.id].word !== choice.word) {
      return `The saved package is ${item.title}, but the customer last chose ${CHOICES[latest.id].word}. Save the package they chose with save_booking_details (items), check with them if unsure, then try again.`;
    }
  }
  return null;
}

/** The enquiry form's answers that are still missing (the team needs them all to review the enquiry). */
export function missingFromEnquiry(d: Pick<Draft, 'eventDate' | 'address' | 'city' | 'startTime' | 'eventTime' | 'bridalCount' | 'groomCount' | 'nonBridalCount' | 'eventsCount'>): string[] {
  const people = (d.bridalCount ?? 0) + (d.groomCount ?? 0) + (d.nonBridalCount ?? 0);
  return [
    !d.eventDate && 'event date',
    !d.address && 'event location (city & venue)',
    d.address && !d.city && 'the city of the venue',
    !d.startTime && 'event start time',
    !d.eventTime && 'makeup ready time / reporting time',
    !people && 'how many need bridal, groom and non-bridal makeup',
    !d.eventsCount && 'number of events / functions',
  ].filter((x): x is string => Boolean(x));
}

/** What still has to be known before the advance can be asked for (the enquiry itself was approved by the team). */
function missingForAdvance(d: Pick<Draft, 'fullName' | 'eventDate' | 'eventTime' | 'items'>, nameKnown: boolean): string[] {
  return [
    !nameKnown && 'full name',
    !d.eventDate && 'event date',
    !d.eventTime && 'makeup ready time',
    !d.items.length && 'package (and how many people)',
  ].filter((x): x is string => Boolean(x));
}

/**
 * A booking that's over: confirmed, not available, or its event date has passed. A customer who writes again after
 * that is starting something new: they get the enquiry form, and their enquiry becomes a new booking.
 */
export const bookingIsOver = (d: Pick<Draft, 'status' | 'eventDate'>) =>
  d.status === 'confirmed' || d.status === 'not_available' || Boolean(d.status && d.eventDate && d.eventDate < todayInAtlanta().iso);

/**
 * Whether anything about the event has been saved. Every chat is a lead from its first message (and an ad click
 * before that), so a booking row can exist with nothing in it yet.
 */
export const hasBookingDetails = (d: Draft) =>
  Boolean(
    d.status || d.eventType || d.eventDate || d.eventTime || d.startTime || d.address || d.city || d.bridalCount !== null || d.groomCount !== null ||
      d.nonBridalCount !== null || d.eventsCount !== null || d.items.length || d.specialRequirements || d.contactPhone,
  );

const first = B.artist.split(' ')[0]; // "Deepika"

/** The booking, as the model sees it at the top of every reply (THIS CHAT in the prompt). */
export function describeBooking(d: Draft | null, quotedArtist: Artist | undefined, customerSaid: string): string {
  if (!d || (!hasBookingDetails(d) && !nameTyped(d.fullName, customerSaid))) return 'No enquiry details saved yet (save_enquiry saves them).';
  const stage: Record<string, string> = {
    none: 'the customer is filling in the enquiry form (not sent to the team yet)',
    enquiry_review: `the enquiry form is complete and ${first}'s team is reviewing it; they'll update the customer within two hours. No prices until they approve it`,
    not_available: `${first}'s team reviewed the enquiry and is NOT available for it (the customer was told). If they'd like another date, save it with save_enquiry: it goes to the team again`,
    quoted: `${first}'s team APPROVED the enquiry: the customer got the news about their artist and the quotation(s). Now: their package choice, name, then the advance`,
    awaiting_payment: 'the payment message was sent; waiting for the customer to pay the advance and send the screenshot',
    payment_review: `the customer sent the payment screenshot; ${first}'s team is verifying it (not confirmed yet)`,
    confirmed:
      'CONFIRMED by the team (the customer got the confirmation message). Makeup for a new event is a new enquiry: the enquiry form as usual (save_enquiry makes it a new booking). Only changes to this booking itself go to handoff_to_deepika',
  };
  const past = d.status && d.status !== 'confirmed' && d.eventDate && d.eventDate < todayInAtlanta().iso;
  const given = (v: string | number | null, show = String(v)) => (v === null || v === '' ? '(not given)' : show);
  const lines = [
    past
      ? `Booking #${d.id}: an earlier enquiry whose event date has passed (it was: ${stage[d.status!]}). Anything they ask for now is a new enquiry: the enquiry form as usual (save_enquiry makes it a new booking).`
      : `Booking #${d.id}: ${stage[d.status ?? 'none']}.`,
    `- Name: ${nameTyped(d.fullName, customerSaid) ? d.fullName : '(not given yet)'}${d.contactPhone ? ` · contact phone: ${d.contactPhone}` : ' · contact phone: this WhatsApp number'}`,
    `- Enquiry form: occasion ${d.eventType || '(not said; a wedding unless they say otherwise)'} · date ${d.eventDate ? `${longDate(d.eventDate)} (${d.eventDate})` : '(not given)'} · location ${given(d.address)} · city ${given(d.city)}${d.state ? `, ${d.state}` : ''} · event starts ${d.startTime ? timeLabel(d.startTime) : '(not given)'} · makeup ready/reporting ${d.eventTime ? timeLabel(d.eventTime) : '(not given)'} · bridal ${given(d.bridalCount)} · groom ${given(d.groomCount)} · non-bridal ${given(d.nonBridalCount)} · events ${given(d.eventsCount)} · additional requirements ${given(d.specialRequirements)}`,
    `- Artist: ${d.artist ? `${ARTIST_FOR_CUSTOMER[d.artist]} (${d.artist === 'deepika' ? 'Atlanta area' : 'outside Atlanta'})` : 'decided when the team approves the enquiry'}`,
    d.items.length
      ? `- Packages: ${d.items.map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''} (${money(i.unitPrice * i.quantity)})`).join(', ')} · total ${money(d.total ?? 0)} · advance (${ADVANCE_PERCENT}%) ${money(d.advance ?? 0)}`
      : '- Packages: (not chosen yet)',
    `- Quotation already sent with ${quotedArtist ? (quotedArtist === 'deepika' ? "Deepika's prices" : "the senior artist's prices") : "nobody's prices yet"}.`,
  ];
  if (!d.status || d.status === 'not_available') {
    const missing = missingFromEnquiry(d);
    lines.push(missing.length ? `- Still missing from the enquiry form: ${missing.join(', ')}.` : '- The enquiry form is complete.');
  } else if (d.status === 'quoted') {
    const missing = missingForAdvance(d, nameTyped(d.fullName, customerSaid));
    lines.push(missing.length ? `- Still needed before the advance: ${missing.join(', ')}.` : '- All details are saved.');
  }
  return lines.filter(Boolean).join('\n');
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** A number the customer typed in the chat, as its own number ("5", "05", "5th", "5pm"; not the 5 in "15"). */
const typedNumber = (n: number, customerSaid: string) => new RegExp(`(?<!\\d)0?${n}(?!\\d)`).test(customerSaid);

/** The customer typed this date's day ("12" for 2027-03-12), or this time's hour ("4" or "16" for 16:30). */
const dateTyped = (iso: string, customerSaid: string) => typedNumber(Number(iso.slice(8, 10)), customerSaid);
const timeTyped = (hhmm: string, customerSaid: string) => {
  const h = Number(hhmm.slice(0, 2));
  return typedNumber(h, customerSaid) || typedNumber(h % 12 || 12, customerSaid) || (h === 12 && /noon/i.test(customerSaid));
};

/** Prices the items for an artist (Deepika's prices while the artist isn't known yet). */
function price(items: { package: PackageId; quantity: number }[], artist: Artist | null) {
  const priced: QuoteItem[] = [];
  const unavailable: string[] = [];
  for (const item of items) {
    const prices: { deepika?: Price; senior?: Price } = PACKAGES[item.package].prices;
    const p = prices[artist ?? 'deepika'];
    if (!p) {
      unavailable.push(prices.deepika!.title);
      continue;
    }
    priced.push({ package: item.package, title: p.title, quantity: item.quantity, unitPrice: p.price, perPerson: p.perPerson });
  }
  const total = cents(priced.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0));
  const advance = cents(total * ADVANCE_SHARE);
  return { priced, unavailable, total, advance, balance: cents(total - advance) };
}

/** A count from the form: -1 (or anything that isn't a whole number from 0 to 99) means "not given". */
const count = (value: unknown): number | null => (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 99 ? (value as number) : null);

/** The booking's line in the leads list before packages are chosen: "Wedding: 1 bridal, 3 non-bridal". */
const enquiryServiceName = (d: Pick<Draft, 'eventType' | 'bridalCount' | 'groomCount' | 'nonBridalCount'>) => {
  const people = peopleSummary(d);
  return (d.eventType ? `${d.eventType}${people ? `: ${people}` : ''}` : people ? `Makeup: ${people}` : SERVICE_NOT_SPECIFIED).slice(0, 300);
};

/** Who saved what; returned by saveEnquiry so the bot knows what to send and whom to tell. */
export type EnquiryOutcome = 'incomplete' | 'submitted' | 'resubmitted' | 'unchanged';

/**
 * save_enquiry: saves the enquiry form's answers as the customer gives them (only the answers given; the others keep
 * their saved value). Once every answer is there, the enquiry goes to the team for review (booking_status
 * 'enquiry_review'). A change to an enquiry the team is reviewing, approved, or not available for goes to the team
 * again, since they approved (or declined) the details as they were.
 */
export async function saveEnquiry(
  waId: string,
  chat: { profileName?: string; adSource?: string },
  args: Record<string, unknown>,
  customerSaid: string,
): Promise<{ ok: false; error: string } | { ok: true; outcome: EnquiryOutcome; bookingId: string; result: Record<string, unknown> }> {
  if (!pool) return { ok: false, error: `The enquiry can't be saved right now. Tell the customer ${B.artist} will reply personally.` };
  let draft = await currentBooking(waId);
  // A different, new event: a new booking (and lead), whatever happened to the earlier one. Asked for a booking
  // started in the last few hours that hasn't gone to the team yet, or a lead with no details yet (made from the
  // first message), it carries on with that one instead.
  const justStarted = draft && !draft.status && (draft.createdAt.getTime() > Date.now() - 20 * 3_600_000 || !hasBookingDetails(draft));
  if (args.start_new_booking === true && !justStarted) draft = null;
  // A confirmed booking, or one whose event has passed, is over: these details are for a new event, so a new booking.
  // (One the team wasn't available for carries on: a new date for it goes back to the team.)
  if (draft && bookingIsOver(draft) && draft.status !== 'not_available') draft = null;
  if (draft?.status === 'not_available' && draft.eventDate && draft.eventDate < todayInAtlanta().iso) draft = null;
  if (draft?.status === 'payment_review') {
    return {
      ok: false,
      error: `The customer already sent the payment screenshot for booking #${draft.id}, and the team is verifying it. Don't change it here: call handoff_to_deepika with the change they want, and tell them the team will help.`,
    };
  }

  const problems: string[] = [];
  const notTyped: string[] = [];
  const eventDate = text(args.event_date, 10);
  const location = text(args.event_location, 300);
  const city = text(args.event_city, 80);
  const state = text(args.event_state, 60);
  const occasionArg = text(args.occasion, 40);
  const requirements = text(args.additional_requirements, 1000);
  const times = { startTime: text(args.event_start_time, 8), eventTime: text(args.ready_time, 8) };
  const counts = {
    bridalCount: count(args.bridal_count),
    groomCount: count(args.groom_count),
    nonBridalCount: count(args.non_bridal_count),
    eventsCount: count(args.events_count),
  };

  let date: string | null = null;
  if (eventDate && !isIsoDate(eventDate)) problems.push('event_date must be a real date as YYYY-MM-DD');
  else if (eventDate && eventDate < todayInAtlanta().iso) problems.push('the event date is in the past: ask for the right date');
  else if (eventDate && !dateTyped(eventDate, customerSaid)) notTyped.push(`event_date (${longDate(eventDate)})`);
  else if (eventDate) date = eventDate;
  const parsedTimes: Partial<Record<keyof typeof times, string>> = {};
  for (const [key, value] of Object.entries(times) as [keyof typeof times, string][]) {
    if (!value) continue;
    const minutes = toMinutes(value);
    if (minutes === null) problems.push(`${key === 'startTime' ? 'event_start_time' : 'ready_time'} must be HH:MM on the 24-hour clock, e.g. "08:00"`);
    else if (!timeTyped(fromMinutes(minutes), customerSaid)) notTyped.push(`${key === 'startTime' ? 'event_start_time' : 'ready_time'} (${timeLabel(fromMinutes(minutes))})`);
    else parsedTimes[key] = fromMinutes(minutes);
  }
  if (occasionArg && !Object.hasOwn(EVENT_OCCASIONS, occasionArg)) problems.push(`occasion must be one of: ${Object.keys(EVENT_OCCASIONS).join(', ')}, or ""`);
  if (problems.length) return { ok: false, error: `Not saved: ${problems.join('; ')}.` };

  // Merge with what's saved: an empty value keeps the saved one
  const next = {
    eventType: occasionArg ? EVENT_OCCASIONS[occasionArg as EventOccasion] : (draft?.eventType ?? null),
    eventDate: date ?? draft?.eventDate ?? null,
    address: location || draft?.address || null,
    city: city || draft?.city || null,
    // A new city without a state drops the old city's state
    state: state || (city ? null : (draft?.state ?? null)),
    startTime: parsedTimes.startTime ?? draft?.startTime ?? null,
    eventTime: parsedTimes.eventTime ?? draft?.eventTime ?? null,
    bridalCount: counts.bridalCount ?? draft?.bridalCount ?? null,
    groomCount: counts.groomCount ?? draft?.groomCount ?? null,
    nonBridalCount: counts.nonBridalCount ?? draft?.nonBridalCount ?? null,
    eventsCount: counts.eventsCount ?? draft?.eventsCount ?? null,
    specialRequirements: requirements || draft?.specialRequirements || null,
  };
  const missing = missingFromEnquiry(next);
  // The form is complete: the numbers nobody gave are 0 ("Bridal: 1" alone means no groom or non-bridal makeup)
  if (!missing.length) {
    next.bridalCount ??= 0;
    next.groomCount ??= 0;
    next.nonBridalCount ??= 0;
  }
  const changed =
    !draft ||
    (['eventType', 'eventDate', 'address', 'city', 'state', 'startTime', 'eventTime', 'bridalCount', 'groomCount', 'nonBridalCount', 'eventsCount', 'specialRequirements'] as const).some(
      (k) => next[k] !== draft![k],
    );

  // What happens to the booking's stage
  const before = draft?.status ?? null;
  let outcome: EnquiryOutcome;
  if (missing.length) outcome = 'incomplete';
  else if (!before || before === 'not_available') outcome = before === 'not_available' && !changed ? 'unchanged' : 'submitted';
  else outcome = changed ? 'resubmitted' : 'unchanged';
  // Incomplete again after a change (e.g. a new date but no time yet): back to filling in the form
  const stageAfter: BookingStatus | null =
    outcome === 'submitted' || outcome === 'resubmitted' ? 'enquiry_review' : outcome === 'incomplete' && before && before !== 'not_available' ? null : before;

  const values = [
    enquiryServiceName(next),
    next.eventType,
    next.eventDate,
    next.address,
    next.city,
    next.state,
    next.startTime,
    next.eventTime,
    next.bridalCount,
    next.groomCount,
    next.nonBridalCount,
    next.eventsCount,
    next.specialRequirements,
    stageAfter,
  ];
  const db = getDb();
  let id: string;
  // Sent to the team (again): a fresh review. The artist and any prices are worked out again when they approve it.
  const toTeam = outcome === 'submitted' || outcome === 'resubmitted';
  const reset = toTeam || stageAfter === null ? ', artist = NULL, payment_requested_at = NULL, enquiry_reviewed_at = NULL, enquiry_reviewed_by = NULL' : '';
  if (draft) {
    await db.query(
      `UPDATE bookings SET service = CASE WHEN quote_items IS NOT NULL AND jsonb_array_length(quote_items) > 0 THEN service ELSE $1 END,
              event_type = $2, event_date = $3, event_location = $4, event_city = $5, event_state = $6, event_start_time = $7,
              event_time = $8, bridal_count = $9, groom_count = $10, non_bridal_count = $11, events_count = $12,
              special_requirements = $13, booking_status = $14, updated_at = now()
              ${toTeam ? ', enquiry_submitted_at = now()' : ''}${reset}
        WHERE id = $15`,
      [...values, draft.id],
    );
    id = draft.id;
  } else {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO bookings (service, event_type, event_date, event_location, event_city, event_state, event_start_time, event_time,
                             bridal_count, groom_count, non_bridal_count, events_count, special_requirements, booking_status,
                             full_name, phone, source, channel, enquiry_submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'whatsapp', ${toTeam ? 'now()' : 'NULL'})
       RETURNING id::text`,
      [...values, chat.profileName || NO_NAME, `+${waId}`, chat.adSource ?? 'whatsapp'],
    );
    id = rows[0].id;
    console.log(`[whatsapp] new booking #${id} from …${waId.slice(-4)}`);
  }
  if (toTeam || (stageAfter === null && before)) await chatStore.setQuotedArtist(waId, null);
  console.log(`[whatsapp] booking #${id}: enquiry ${outcome === 'incomplete' ? `saved (missing: ${missing.join(', ')})` : outcome}`);

  const result: Record<string, unknown> = {
    ok: true,
    booking_number: id,
    ...(notTyped.length
      ? {
          not_saved: `Not saved, because the customer hasn't written these in the chat themselves: ${notTyped.join(', ')}. Never fill in an answer for them: ask for it (or ask them to confirm it in their own words).`,
        }
      : {}),
  };
  if (outcome === 'incomplete') {
    result.still_missing = missing;
    result.note = `Kindly ask for the missing details (all of them in one short message), then save them with save_enquiry. The enquiry goes to ${first}'s team once it's complete. No prices before the team has approved it.`;
  } else if (outcome === 'submitted') {
    result.note = `The enquiry is complete and has gone to ${first}'s team. The customer gets the message "${ENQUIRY_SENT_NOTE}" word for word: reply exactly NO_REPLY, unless they asked something else.`;
  } else if (outcome === 'resubmitted') {
    result.note = `The changed details have gone to ${first}'s team for review again (they approve the event as it is now); any prices or payment message from before no longer apply. Tell the customer briefly and warmly that you've shared the change with the team and they'll update them within two hours.`;
  } else {
    result.note = before === 'enquiry_review' ? `Nothing changed: the team is already reviewing this enquiry. They'll update the customer within two hours.` : 'Nothing changed.';
  }
  return { ok: true, outcome, bookingId: id, result };
}

/** How the "submitted" result refers to the fixed thank-you message (whatsappQuotes.ts). */
const ENQUIRY_SENT_NOTE = 'Our team will check your application and update you within two hours';

/**
 * save_booking_details: once the team has approved the enquiry, saves the packages the customer chose (priced for
 * their artist), their full name and a contact phone. The result tells the model what to say next.
 */
export async function saveBookingDetails(
  waId: string,
  chat: { profileName?: string; quotedArtist?: Artist },
  args: Record<string, unknown>,
  customerSaid: string,
) {
  if (!pool) return { ok: false, error: `Booking details can't be saved right now. Tell the customer ${B.artist} will reply personally.` };
  const draft = await currentBooking(waId);
  if (!draft) return { ok: false, error: 'There is no enquiry yet: the customer fills in the enquiry form first (save_enquiry).' };
  if (draft.status === 'confirmed') {
    return { ok: false, error: `Booking #${draft.id} is already confirmed. Changes to it go through ${first}'s team: call handoff_to_deepika with what they'd like to change.` };
  }
  if (draft.status === 'payment_review') {
    return {
      ok: false,
      error: `The customer already sent the payment screenshot for booking #${draft.id}, and the team is verifying it. Don't change it here: call handoff_to_deepika with the change they want, and tell them the team will help.`,
    };
  }

  const problems: string[] = [];
  const fullName = text(args.full_name, 120);
  const contactPhone = text(args.contact_phone, 40);
  const rawItems = Array.isArray(args.items) ? args.items : [];
  if (contactPhone && !/^\+?[\d\s().-]{7,20}$/.test(contactPhone)) problems.push('contact_phone looks wrong: ask the customer for it again');
  const items: { package: PackageId; quantity: number }[] = [];
  for (const raw of rawItems) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = text(r.package, 40);
    const quantity = Number(r.quantity);
    if (!isPackage(id)) problems.push(`unknown package "${id}"`);
    else if (!Number.isInteger(quantity) || quantity < 1 || quantity > 30) problems.push(`quantity for ${id} must be a whole number from 1 to 30`);
    else items.push({ package: id, quantity });
  }
  // Packages are chosen from the quotation, which comes only with the team's approval
  const approved = draft.status === 'quoted' || draft.status === 'awaiting_payment';
  if (items.length && !approved) {
    problems.push(`packages can be saved only after ${first}'s team has approved the enquiry and the customer has seen the prices; save the name and phone only`);
  }
  if (problems.length) return { ok: false, error: `Not saved: ${problems.join('; ')}.` };

  const next = {
    fullName: fullName || draft.fullName || chat.profileName || NO_NAME,
    contactPhone: contactPhone || draft.contactPhone || null,
    items: items.length ? items : draft.items.filter((i) => isPackage(i.package)).map((i) => ({ package: i.package as PackageId, quantity: i.quantity })),
  };
  // A name the customer never typed (e.g. taken from the profile) isn't saved over one they did
  const untypedName = Boolean(fullName) && !nameTyped(fullName, customerSaid);
  if (untypedName) next.fullName = draft.fullName || chat.profileName || NO_NAME;
  const nameKnown = nameTyped(next.fullName, customerSaid);
  const artist = draft.artist;
  const quote = price(next.items, artist);
  const people = next.items.reduce((n, i) => n + i.quantity, 0);
  const serviceName = quote.priced.length ? quote.priced.map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(' + ').slice(0, 300) : enquiryServiceName(draft);
  // A change to what was in the payment message means it has to be sent again
  const changedAfterPaymentRequest = draft.status === 'awaiting_payment' && quote.total !== draft.total;

  await getDb().query(
    `UPDATE bookings SET full_name = $1, contact_phone = $2, service = $3, party_size = $4, quote_items = $5, total_price = $6,
            advance_amount = $7, updated_at = now()
            ${changedAfterPaymentRequest ? ", booking_status = 'quoted', payment_requested_at = NULL" : ''}
      WHERE id = $8`,
    [
      next.fullName,
      next.contactPhone,
      serviceName,
      people ? `${people} ${people === 1 ? 'person' : 'people'}` : null,
      JSON.stringify(quote.priced),
      quote.priced.length ? quote.total : null,
      quote.priced.length ? quote.advance : null,
      draft.id,
    ],
  );
  console.log(`[whatsapp] booking #${draft.id}: details saved${changedAfterPaymentRequest ? '; payment request cancelled by a change' : ''}`);

  const missing = missingForAdvance({ ...draft, ...next, items: quote.priced }, nameKnown);
  const occasions = [...new Set(next.items.map((i) => PACKAGES[i.package].occasion).filter(Boolean))];
  return {
    ok: true,
    booking_number: draft.id,
    artist: artist ?? `decided when ${first}'s team approves the enquiry`,
    prices: quote.priced.length
      ? {
          items: quote.priced.map((i) => ({ package: i.title, quantity: i.quantity, price: money(i.unitPrice * i.quantity) })),
          total: money(quote.total),
          [`advance_${ADVANCE_PERCENT}_percent`]: money(quote.advance),
          balance: money(quote.balance),
        }
      : null,
    ...(quote.unavailable.length
      ? {
          price_not_available: `There's no senior artist price for: ${quote.unavailable.join(', ')}. Don't guess a price: tell the customer ${first}'s team will confirm the quote for their location, and call handoff_to_deepika.`,
        }
      : {}),
    ...(artist && approved && chat.quotedArtist !== artist && !quote.unavailable.length
      ? {
          quotation_needed: `The customer hasn't seen ${artist === 'deepika' ? "Deepika's" : "the senior artists'"} prices in this conversation: call send_quotation (${occasions.length ? occasions.join(', ') : 'their occasion'}) in this reply, then ask which package they like.`,
        }
      : {}),
    ...(changedAfterPaymentRequest ? { note: 'The payment message they got earlier no longer matches: once they agree, call request_advance_payment again.' } : {}),
    ...(untypedName ? { full_name_not_saved: 'full_name must be the name the customer typed in this chat: ask them for their full name.' } : {}),
    still_needed_before_advance: !approved
      ? `${first}'s team hasn't approved the enquiry yet`
      : missing.length
        ? missing
        : 'nothing: once the customer has agreed to the package and price, call request_advance_payment',
  };
}

/**
 * request_advance_payment: every detail is saved and priced, the customer has seen the right artist's prices, the
 * time is still free and the team has set its payment details. Then the booking waits for the advance, and the
 * payment message (to send word for word) comes back.
 */
export async function requestAdvancePayment(
  waId: string,
  chat: { quotedArtist?: Artist },
  customerSaid: string,
): Promise<{ ok: true; message: string; bookingId: string } | { ok: false; error: string }> {
  if (!pool) return { ok: false, error: `Bookings can't be saved right now. Tell the customer ${B.artist} will reply personally.` };
  const d = await currentBooking(waId);
  if (!d) return { ok: false, error: 'There is no enquiry yet: the customer fills in the enquiry form first (save_enquiry).' };
  if (d.status === 'confirmed') return { ok: false, error: `Booking #${d.id} is already confirmed: no advance is needed.` };
  if (d.status === 'payment_review') return { ok: false, error: 'They already sent the payment screenshot; the team is verifying it. Tell them so.' };
  if (d.status !== 'quoted' && d.status !== 'awaiting_payment') {
    return {
      ok: false,
      error:
        d.status === 'enquiry_review'
          ? `${first}'s team is still reviewing the enquiry: no prices or advance until they approve it. Tell the customer the team will update them within two hours.`
          : d.status === 'not_available'
            ? `${first}'s team isn't available for this enquiry. If the customer has another date, save it with save_enquiry for the team to check.`
            : `The enquiry form isn't complete yet, so it hasn't gone to ${first}'s team. Ask for what's missing (save_enquiry).`,
    };
  }
  const missing = missingForAdvance(d, nameTyped(d.fullName, customerSaid));
  if (missing.length) return { ok: false, error: `Still needed first: ${missing.join(', ')}. Ask the customer naturally, save with save_booking_details, then try again.` };
  if (!d.artist) return { ok: false, error: `The booking has no artist yet. Call handoff_to_deepika (reason: "approved enquiry without an artist") and tell the customer the team will be in touch.` };
  if (!d.eventDate || !d.eventTime || d.total === null || d.advance === null) return { ok: false, error: 'The booking has no price yet: save the package with save_booking_details.' };
  const stillPriced = price(d.items.filter((i) => isPackage(i.package)).map((i) => ({ package: i.package as PackageId, quantity: i.quantity })), d.artist);
  if (stillPriced.unavailable.length || stillPriced.total !== d.total) {
    return { ok: false, error: 'The prices changed: call save_booking_details again (with the same items) to refresh them, show the customer, and ask again.' };
  }
  // The payment message charges what's saved: it must be the package the customer chose
  const choiceProblem = packageChoiceProblem(d.items, customerSaid);
  if (choiceProblem) {
    console.log(`[whatsapp] booking #${d.id}: advance refused (package not the customer's latest choice)`);
    return { ok: false, error: choiceProblem };
  }
  if (chat.quotedArtist !== d.artist) {
    const occasions = [...new Set(d.items.map((i) => (isPackage(i.package) ? PACKAGES[i.package].occasion : null)).filter(Boolean))];
    return {
      ok: false,
      error: `The customer hasn't seen ${d.artist === 'deepika' ? "Deepika's" : "the senior artist's"} prices yet. Call send_quotation (${occasions.join(', ') || 'their occasion'}) and get their OK on the price first.`,
    };
  }
  const settings = await getBookingSettings();
  if (!settings.paymentDetails) {
    return {
      ok: false,
      error: `The payment details aren't set up yet. Tell the customer ${B.artist.split(' ')[0]}'s team will send them the payment details personally very soon, and call handoff_to_deepika (reason: "ready to pay the advance").`,
    };
  }
  if (d.eventDate < todayInAtlanta().iso) return { ok: false, error: 'The event date is in the past: ask for the right date (save_enquiry; it goes to the team again).' };
  // Deepika's own bookings take her time on the calendar: it may have been taken since the team approved the enquiry
  if (d.artist === 'deepika') {
    const slot = await checkTime(d.eventDate, d.eventTime, { phone: `+${waId}` });
    if (!slot.open) {
      const options = await checkTimeForAssistant(d.eventDate, d.eventTime, { phone: `+${waId}` });
      return {
        ok: false,
        error: `${timeLabel(d.eventTime)} on ${d.eventDate} has just been taken on ${first}'s calendar. Tell the customer kindly and offer only these: ${JSON.stringify(options)}. Save the time they pick as ready_time with save_enquiry: it goes to the team to approve again.`,
      };
    }
  }

  await getDb().query(`UPDATE bookings SET booking_status = 'awaiting_payment', payment_requested_at = now(), updated_at = now() WHERE id = $1`, [d.id]);
  console.log(`[whatsapp] booking #${d.id}: advance of ${money(d.advance)} asked for`);
  return { ok: true, bookingId: d.id, message: paymentRequestMessage(summaryOf(d), settings.paymentDetails) };
}

function summaryOf(d: Draft): BookingSummary {
  return {
    fullName: d.fullName,
    items: d.items,
    date: d.eventDate!,
    time: d.eventTime!,
    artist: d.artist!,
    total: d.total!,
    advance: d.advance!,
    balance: cents(d.total! - d.advance!),
  };
}

/** The booking a payment screenshot from this customer belongs to: one waiting for, or already showing, a payment. */
export async function bookingForPaymentProof(waId: string): Promise<{ id: string; status: BookingStatus } | null> {
  if (!pool) return null;
  const { rows } = await pool.query<{ id: string; booking_status: BookingStatus }>(
    `SELECT id::text, booking_status FROM bookings
      WHERE channel = 'whatsapp' AND phone = $1 AND booking_status IN ('awaiting_payment', 'payment_review') AND status <> 'lost'
      ORDER BY id DESC LIMIT 1`,
    [`+${waId}`],
  );
  return rows[0] ? { id: rows[0].id, status: rows[0].booking_status } : null;
}

/**
 * Keeps a payment screenshot for the team. The first one moves the booking to 'payment_review' (returns true); more
 * screenshots are added to it. Nothing is marked as paid: only the team's approval confirms the booking.
 */
export async function savePaymentProof(bookingId: string, data: Buffer, contentType: string): Promise<{ first: boolean; proofId: string }> {
  const db = getDb();
  const { rows } = await db.query<{ id: string }>('INSERT INTO payment_proofs (booking_id, content_type, data) VALUES ($1, $2, $3) RETURNING id::text', [
    bookingId,
    contentType,
    data,
  ]);
  const { rowCount } = await db.query(
    `UPDATE bookings SET booking_status = 'payment_review', payment_submitted_at = now(), updated_at = now()
      WHERE id = $1 AND booking_status = 'awaiting_payment'`,
    [bookingId],
  );
  console.log(`[whatsapp] booking #${bookingId}: payment screenshot received (${Math.round(data.length / 1024)} KB)`);
  return { first: Boolean(rowCount), proofId: rows[0].id };
}

// ---------- The team (dashboard) ----------

interface AdminBookingRow extends DraftRow {
  phone: string;
  channel: string | null;
  payment_submitted_at: Date | null;
  confirmed_at: Date | null;
  confirmed_by_name: string | null;
  enquiry_reviewed_at: Date | null;
  enquiry_reviewed_by_name: string | null;
  last_customer_message_at: Date | null;
}

async function adminRow(id: string): Promise<AdminBookingRow | null> {
  const { rows } = await getDb().query<AdminBookingRow>(
    `SELECT ${draftColumns('b.')}, b.phone, b.channel, b.payment_submitted_at, b.confirmed_at, b.enquiry_reviewed_at,
            u.name AS confirmed_by_name, r.name AS enquiry_reviewed_by_name,
            (SELECT max(m.created_at) FROM whatsapp_messages m WHERE m.wa_id = substr(b.phone, 2) AND m.role = 'user') AS last_customer_message_at
       FROM bookings b LEFT JOIN admin_users u ON u.id = b.confirmed_by LEFT JOIN admin_users r ON r.id = b.enquiry_reviewed_by
      WHERE b.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Whether a booking's time is free on Deepika's calendar (ignoring the booking itself). */
export async function slotFor(d: Pick<Draft, 'id' | 'eventDate' | 'eventTime'>): Promise<BookingDetails['slot']> {
  if (!d.eventDate || !d.eventTime) return { status: 'no_time', conflicts: [] };
  const check = await checkTime(d.eventDate, d.eventTime, { bookingId: d.id });
  return { status: check.dayStatus === 'fully_booked' ? 'fully_booked' : check.open ? 'open' : 'taken', conflicts: check.conflicts };
}

/** Everything the dashboard shows about a lead's WhatsApp booking, including whether its time is still free. */
export async function bookingDetails(id: string): Promise<BookingDetails | null> {
  const r = await adminRow(id);
  if (!r) return null;
  const d = toDraft(r);
  const [proofs, slot, settings] = await Promise.all([
    getDb().query<{ id: string; content_type: string; created_at: Date }>('SELECT id::text, content_type, created_at FROM payment_proofs WHERE booking_id = $1 ORDER BY id', [id]),
    slotFor(d),
    getBookingSettings(),
  ]);
  return {
    status: d.status,
    eventType: d.eventType,
    eventTime: d.eventTime,
    enquiry: {
      eventStartTime: d.startTime,
      eventCity: [d.city, d.state].filter(Boolean).join(', ') || null,
      bridalCount: d.bridalCount,
      groomCount: d.groomCount,
      nonBridalCount: d.nonBridalCount,
      eventsCount: d.eventsCount,
    },
    enquirySubmittedAt: d.enquirySubmittedAt?.toISOString() ?? null,
    enquiryReviewedAt: r.enquiry_reviewed_at?.toISOString() ?? null,
    enquiryReviewedByName: r.enquiry_reviewed_by_name,
    artistForLocation: artistForDraft(d, settings.atlantaAreas),
    artist: d.artist,
    contactPhone: d.contactPhone,
    specialRequirements: d.specialRequirements,
    items: d.items,
    total: d.total,
    advance: d.advance,
    balance: d.total !== null && d.advance !== null ? cents(d.total - d.advance) : null,
    advancePercent: ADVANCE_PERCENT,
    paymentRequestedAt: r.payment_requested_at?.toISOString() ?? null,
    paymentSubmittedAt: r.payment_submitted_at?.toISOString() ?? null,
    confirmedAt: r.confirmed_at?.toISOString() ?? null,
    confirmedByName: r.confirmed_by_name,
    proofs: proofs.rows.map((p) => ({ id: p.id, contentType: p.content_type, createdAt: p.created_at.toISOString() })),
    slot,
    lastCustomerMessageAt: r.last_customer_message_at?.toISOString() ?? null,
  };
}

export class BookingActionError extends Error {}

/** What the customer gets after the team's decision on their enquiry, in order (texts, and brochure pictures). */
export type CustomerMessages = ({ text: string } | { image: string })[];

/**
 * The team approves an enquiry: the event's place decides the artist (Deepika herself in the Atlanta service area, a
 * senior artist anywhere else), and the customer gets the news with that artist's quotations. Returns those messages,
 * with the customer's WhatsApp number. `userId` is the dashboard user; null when approved on WhatsApp.
 */
export async function approveEnquiry(
  id: string,
  userId: string | null,
): Promise<{ waId: string | null; messages: CustomerMessages; fullName: string; artist: Artist; teamQuotes: QuoteOccasion[] }> {
  const r = await adminRow(id);
  if (!r) throw new BookingActionError('Lead not found.');
  const d = toDraft(r);
  if (d.status !== 'enquiry_review') {
    throw new BookingActionError(
      d.status === 'quoted' || (d.status && PAYMENT_STAGES.includes(d.status))
        ? 'This enquiry is already approved.'
        : d.status === 'not_available'
          ? 'This enquiry was marked Not available. If the customer sends new details, it comes back for approval.'
          : 'Only a complete enquiry that waits for approval can be approved.',
    );
  }
  if (!d.eventDate) throw new BookingActionError('This enquiry has no event date.');
  const settings = await getBookingSettings();
  const artist = artistForDraft(d, settings.atlantaAreas) ?? 'senior';
  const occasions = quotationsFor(d.eventType, { bridal: d.bridalCount ?? 0, groom: d.groomCount ?? 0, nonBridal: d.nonBridalCount ?? 0 });
  const quotes = occasions.filter((o) => QUOTATIONS[o][artist]);
  const teamQuotes = occasions.filter((o) => !QUOTATIONS[o][artist]);
  // Packages saved before a change of details are priced again for the artist
  const repriced = price(d.items.filter((i) => isPackage(i.package)).map((i) => ({ package: i.package as PackageId, quantity: i.quantity })), artist);
  const note = teamQuotes.length
    ? `Enquiry approved on ${todayInAtlanta().iso}: there's no ${artist === 'senior' ? 'senior artist ' : ''}price list for ${teamQuotes.join(', ')}. Please send the customer the quote personally.`
    : null;
  const { rowCount } = await getDb().query(
    `UPDATE bookings SET booking_status = 'quoted', artist = $2, enquiry_reviewed_at = now(), enquiry_reviewed_by = $3,
            quote_items = $4, total_price = $5, advance_amount = $6,
            status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
            notes = CASE WHEN $7::text IS NULL THEN notes ELSE concat_ws(E'\\n\\n', notes, $7::text) END, updated_at = now()
      WHERE id = $1 AND booking_status = 'enquiry_review'`,
    [id, artist, userId, JSON.stringify(repriced.priced), repriced.priced.length ? repriced.total : null, repriced.priced.length ? repriced.advance : null, note],
  );
  if (!rowCount) throw new BookingActionError('This enquiry was just changed by someone else. Refresh and try again.');
  const waId = r.channel === 'whatsapp' ? r.phone.replace(/\D/g, '') : null;
  // The prices this customer has now seen: the advance can be asked for with them
  if (waId && quotes.length) await chatStore.setQuotedArtist(waId, artist);
  console.log(`[whatsapp] booking #${id}: enquiry approved (artist: ${artist})`);
  return { waId, messages: enquiryApprovedMessages(artist, d.eventDate, quotes, teamQuotes), fullName: d.fullName, artist, teamQuotes };
}

/** The team isn't available for an enquiry: the customer is told, and can send another date (which comes back for review). */
export async function declineEnquiry(id: string, userId: string | null): Promise<{ waId: string | null; message: string; fullName: string }> {
  const r = await adminRow(id);
  if (!r) throw new BookingActionError('Lead not found.');
  if (r.booking_status !== 'enquiry_review') {
    throw new BookingActionError(r.booking_status === 'not_available' ? 'This enquiry is already marked Not available.' : 'Only an enquiry that waits for approval can be marked Not available.');
  }
  const { rowCount } = await getDb().query(
    `UPDATE bookings SET booking_status = 'not_available', enquiry_reviewed_at = now(), enquiry_reviewed_by = $2,
            status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, updated_at = now()
      WHERE id = $1 AND booking_status = 'enquiry_review'`,
    [id, userId],
  );
  if (!rowCount) throw new BookingActionError('This enquiry was just changed by someone else. Refresh and try again.');
  console.log(`[whatsapp] booking #${id}: enquiry marked not available`);
  return { waId: r.channel === 'whatsapp' ? r.phone.replace(/\D/g, '') : null, message: enquiryNotAvailableMessage(r.event_date), fullName: r.full_name };
}

/**
 * The team approves a booking after checking the payment: it becomes confirmed (lead stage Confirmed too), its time
 * stays taken on the calendar, and the confirmation message for the customer comes back, with their WhatsApp number.
 * `userId` is the dashboard user; null when approved on WhatsApp (an approval number in Settings).
 */
export async function approveBooking(id: string, userId: string | null): Promise<{ waId: string | null; message: string; fullName: string }> {
  const r = await adminRow(id);
  if (!r) throw new BookingActionError('Lead not found.');
  const d = toDraft(r);
  if (d.status === 'confirmed') throw new BookingActionError('This booking is already confirmed.');
  if (d.status !== 'payment_review' && d.status !== 'awaiting_payment') throw new BookingActionError('Only a booking that is waiting for or showing an advance payment can be approved.');
  if (!d.eventDate || !d.eventTime || !d.artist || d.total === null || d.advance === null) throw new BookingActionError('This booking is missing its date, time, artist or price.');
  await getDb().query(
    `UPDATE bookings SET booking_status = 'confirmed', status = 'confirmed', confirmed_at = now(), confirmed_by = $2, updated_at = now() WHERE id = $1`,
    [id, userId],
  );
  return { waId: r.channel === 'whatsapp' ? r.phone.replace(/\D/g, '') : null, message: bookingConfirmedMessage(summaryOf(d)), fullName: d.fullName };
}

/** The team couldn't match the screenshot to a payment: the booking waits for the advance again (with a fresh hold). */
export async function reopenPayment(id: string): Promise<{ waId: string | null; advance: number | null; fullName: string }> {
  const r = await adminRow(id);
  if (!r) throw new BookingActionError('Lead not found.');
  if (r.booking_status !== 'payment_review') throw new BookingActionError('Only a booking whose payment is being verified can be sent back.');
  await getDb().query(
    `UPDATE bookings SET booking_status = 'awaiting_payment', payment_requested_at = now(), payment_submitted_at = NULL, updated_at = now() WHERE id = $1`,
    [id],
  );
  return { waId: r.channel === 'whatsapp' ? r.phone.replace(/\D/g, '') : null, advance: r.advance_amount, fullName: r.full_name };
}

/** A payment screenshot, for the dashboard. */
export async function paymentProof(id: string): Promise<{ contentType: string; data: Buffer } | null> {
  const { rows } = await getDb().query<{ content_type: string; data: Buffer }>('SELECT content_type, data FROM payment_proofs WHERE id = $1', [id]);
  return rows[0] ? { contentType: rows[0].content_type, data: rows[0].data } : null;
}

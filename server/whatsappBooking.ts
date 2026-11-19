/**
 * Bookings made in a WhatsApp chat with Pooja, the assistant (server/whatsappBot.ts), from the first details to the
 * team's approval. Each is a row in `bookings`, so it's also a lead in the dashboard from the moment details are saved.
 *
 * The parts that must be right are worked out here, never by the language model:
 * - the price of each package, from the price lists in portfolioData.ts;
 * - who does the makeup: Deepika herself when the event's ZIP code is in the Atlanta service area, one of her senior
 *   artists anywhere else (with the senior artist's prices);
 * - the advance (ADVANCE_PERCENT of the total) and the balance;
 * - that the time is still free on the calendar when the advance is asked for;
 * - that a booking is confirmed only when the team approves it in the dashboard, after checking the payment.
 *
 * Booking stages (`booking_status`): none while collecting details → 'awaiting_payment' once the payment message is
 * sent → 'payment_review' when the customer sends a payment screenshot → 'confirmed' when the team approves it.
 */
import { SERVICE_NOT_SPECIFIED } from '../src/data/leads.js';
import { money, timeLabel, type Artist, type BookingDetails, type BookingStatus, type QuoteItem } from '../src/data/bookingFlow.js';
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
import { getBookingSettings, inAtlantaArea } from './settings.js';
import { ARTIST_FOR_CUSTOMER, bookingConfirmedMessage, paymentRequestMessage, type BookingSummary, type QuoteOccasion } from './whatsappQuotes.js';

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
  eventTime: string | null;
  address: string | null;
  zip: string | null;
  artist: Artist | null;
  items: QuoteItem[];
  total: number | null;
  advance: number | null;
  status: BookingStatus | null;
  specialRequirements: string | null;
  paymentRequestedAt: Date | null;
  createdAt: Date;
}

/** The booking's columns; `t` is the table alias with its dot, e.g. "b.". */
const draftColumns = (t = '') => `${t}id::text AS id, ${t}full_name, ${t}contact_phone, ${t}event_type,
  to_char(${t}event_date, 'YYYY-MM-DD') AS event_date, to_char(${t}event_time, 'HH24:MI') AS event_time, ${t}event_location,
  ${t}event_zip, ${t}artist, ${t}quote_items, ${t}total_price::float8 AS total_price, ${t}advance_amount::float8 AS advance_amount,
  ${t}booking_status, ${t}special_requirements, ${t}payment_requested_at, ${t}created_at`;

interface DraftRow {
  id: string;
  full_name: string;
  contact_phone: string | null;
  event_type: string | null;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  event_zip: string | null;
  artist: Artist | null;
  quote_items: QuoteItem[] | null;
  total_price: number | null;
  advance_amount: number | null;
  booking_status: BookingStatus | null;
  special_requirements: string | null;
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
  address: r.event_location,
  zip: r.event_zip,
  artist: r.artist,
  items: r.quote_items ?? [],
  total: r.total_price,
  advance: r.advance_amount,
  status: r.booking_status,
  specialRequirements: r.special_requirements,
  paymentRequestedAt: r.payment_requested_at,
  createdAt: r.created_at,
});

/**
 * The customer's current WhatsApp booking: their latest one from the last 120 days that isn't lost (a confirmed one
 * too, so Pooja can answer questions about it). Leads the team marked converted by hand, without a WhatsApp booking,
 * don't count. Null when there's none, or without a database.
 */
export async function currentBooking(waId: string): Promise<Draft | null> {
  if (!pool) return null;
  const { rows } = await pool.query<DraftRow>(
    `SELECT ${draftColumns()} FROM bookings
      WHERE channel = 'whatsapp' AND phone = $1 AND status <> 'lost' AND (booking_status IS NOT NULL OR status <> 'converted')
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

/** What still has to be known before the advance can be asked for. */
function missingForAdvance(d: Pick<Draft, 'fullName' | 'eventDate' | 'eventTime' | 'address' | 'zip' | 'items'>, nameKnown: boolean): string[] {
  return [
    !nameKnown && 'full name',
    !d.eventDate && 'event date',
    !d.eventTime && 'time to start the makeup',
    !d.address && 'complete event address',
    !d.zip && 'ZIP code',
    !d.items.length && 'package (and how many people)',
  ].filter((x): x is string => Boolean(x));
}

/** The booking, as the model sees it at the top of every reply (THIS CHAT in the prompt). */
export function describeBooking(d: Draft | null, quotedArtist: Artist | undefined, customerSaid: string): string {
  if (!d) return 'No booking details saved yet (save_booking_details saves them).';
  const stage: Record<string, string> = {
    none: 'collecting details (no advance asked for yet)',
    awaiting_payment: `the payment message was sent; waiting for the customer to pay the advance and send the screenshot`,
    payment_review: `the customer sent the payment screenshot; ${B.artist.split(' ')[0]}'s team is verifying it (not confirmed yet)`,
    confirmed: 'CONFIRMED by the team (the customer got the confirmation message)',
  };
  const lines = [
    `Booking #${d.id}: ${stage[d.status ?? 'none']}.`,
    `- Name: ${nameTyped(d.fullName, customerSaid) ? d.fullName : '(not given yet)'}${d.contactPhone ? ` · contact phone: ${d.contactPhone}` : ' · contact phone: this WhatsApp number'}`,
    `- Event: ${d.eventType || '(type not saved)'} · date: ${d.eventDate ? `${d.eventDate} (${weekdayOf(d.eventDate)})` : '(not saved)'} · time: ${d.eventTime ? timeLabel(d.eventTime) : '(not saved)'}`,
    `- Address: ${d.address || '(not saved)'} · ZIP: ${d.zip || '(not saved)'}`,
    `- Artist: ${d.artist ? `${ARTIST_FOR_CUSTOMER[d.artist]} (${d.artist === 'deepika' ? 'Atlanta area' : 'outside the Atlanta area'})` : 'not known until the ZIP code is saved'}`,
    d.items.length
      ? `- Packages: ${d.items.map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''} (${money(i.unitPrice * i.quantity)})`).join(', ')} · total ${money(d.total ?? 0)} · advance (${ADVANCE_PERCENT}%) ${money(d.advance ?? 0)}`
      : '- Packages: (not chosen yet)',
    d.specialRequirements ? `- Special requirements: ${d.specialRequirements}` : '',
    `- Quotation already sent with ${quotedArtist ? (quotedArtist === 'deepika' ? "Deepika's prices" : "the senior artist's prices") : 'nobody\'s prices yet'}.`,
  ];
  if (!d.status) {
    const missing = missingForAdvance(d, nameTyped(d.fullName, customerSaid));
    lines.push(missing.length ? `- Still needed before the advance: ${missing.join(', ')}.` : '- All details are saved.');
  }
  return lines.filter(Boolean).join('\n');
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** The ZIP code written in a US address: after the state ("GA 30309") or at the very end ("…, 30309, USA"). */
function zipInAddress(address: string): string | null {
  const m = address.match(/\b[A-Z]{2}\s+(\d{5})(?:-\d{4})?\b/) ?? address.match(/[,\s](\d{5})(?:-\d{4})?\s*(?:,?\s*(?:USA|US|United States))?\s*$/i);
  return m ? m[1] : null;
}

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

/**
 * save_booking_details: saves what the customer has told Pooja so far (only the details given; the others keep their
 * saved value), and works out the artist and the prices. The result tells the model what to say next.
 */
export async function saveBookingDetails(
  waId: string,
  chat: { profileName?: string; adSource?: string; quotedArtist?: Artist },
  args: Record<string, unknown>,
  customerSaid: string,
) {
  if (!pool) return { ok: false, error: `Booking details can't be saved right now. Tell the customer ${B.artist} will reply personally.` };
  let draft = await currentBooking(waId);
  // A different, new event: a new booking (and lead), whatever happened to the earlier one. Asked again for a booking
  // started in the last few hours (the one just made in this conversation), it carries on with that one instead.
  const justStarted = draft && !draft.status && draft.createdAt.getTime() > Date.now() - 20 * 3_600_000;
  if (args.start_new_booking === true && !justStarted) draft = null;
  if (draft?.status === 'confirmed') {
    return {
      ok: false,
      error: `Booking #${draft.id} is already confirmed. Changes to it go through ${B.artist}'s team: call handoff_to_deepika with what they'd like to change. If these details are for a different, new event, call save_booking_details again with start_new_booking true.`,
    };
  }
  if (draft?.status === 'payment_review') {
    return {
      ok: false,
      error: `The customer already sent the payment screenshot for booking #${draft.id}, and the team is verifying it. Don't change it here: call handoff_to_deepika with the change they want, and tell them the team will help.`,
    };
  }

  const problems: string[] = [];
  const fullName = text(args.full_name, 120);
  const contactPhone = text(args.contact_phone, 40);
  const eventType = text(args.event_type, 120);
  const eventDate = text(args.event_date, 10);
  const timeArg = text(args.event_time, 8);
  const address = text(args.event_address, 300);
  // A US ZIP at the end of the address ("…, GA 30309") counts even if the model left zip_code empty
  const zip = (text(args.zip_code, 12) || zipInAddress(address) || '').toUpperCase();
  const requirements = text(args.special_requirements, 1000);
  const rawItems = Array.isArray(args.items) ? args.items : [];

  if (eventDate && !isIsoDate(eventDate)) problems.push('event_date must be a real date as YYYY-MM-DD');
  else if (eventDate && eventDate < todayInAtlanta().iso) problems.push('the event date is in the past');
  const minutes = timeArg ? toMinutes(timeArg) : null;
  if (timeArg && minutes === null) problems.push('event_time must be HH:MM on the 24-hour clock, e.g. "08:00"');
  if (zip && !/^[0-9A-Z][0-9A-Z -]{2,10}$/.test(zip)) problems.push('zip_code looks wrong: ask the customer for it again');
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
  if (problems.length) return { ok: false, error: `Not saved: ${problems.join('; ')}.` };

  // Merge with what's saved: an empty value keeps the saved one
  const settings = await getBookingSettings();
  const next = {
    fullName: fullName || draft?.fullName || chat.profileName || NO_NAME,
    contactPhone: contactPhone || draft?.contactPhone || null,
    eventType: eventType || draft?.eventType || null,
    eventDate: eventDate || draft?.eventDate || null,
    eventTime: minutes !== null ? fromMinutes(minutes) : (draft?.eventTime ?? null),
    address: address || draft?.address || null,
    zip: zip || draft?.zip || null,
    specialRequirements: requirements || draft?.specialRequirements || null,
    items: items.length ? items : (draft?.items ?? []).filter((i) => isPackage(i.package)).map((i) => ({ package: i.package as PackageId, quantity: i.quantity })),
  };
  // A name the customer never typed (e.g. taken from the profile) isn't saved over one they did
  const untypedName = Boolean(fullName) && !nameTyped(fullName, customerSaid);
  if (untypedName) next.fullName = draft?.fullName || chat.profileName || NO_NAME;
  const nameKnown = nameTyped(next.fullName, customerSaid);
  const artist: Artist | null = next.zip ? (inAtlantaArea(next.zip, settings) ? 'deepika' : 'senior') : null;
  const quote = price(next.items, artist);
  const people = next.items.reduce((n, i) => n + i.quantity, 0);
  const serviceName = quote.priced.length ? quote.priced.map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(' + ').slice(0, 300) : next.eventType || SERVICE_NOT_SPECIFIED;

  // A change to what was in the payment message means it has to be sent again
  const changedAfterPaymentRequest =
    draft?.status === 'awaiting_payment' &&
    (next.eventDate !== draft.eventDate || next.eventTime !== draft.eventTime || next.zip !== draft.zip || quote.total !== draft.total || artist !== draft.artist);

  const values = [
    next.fullName,
    serviceName,
    next.eventDate,
    next.address,
    people ? `${people} ${people === 1 ? 'person' : 'people'}` : null,
    next.eventType,
    next.eventTime,
    next.zip,
    artist,
    JSON.stringify(quote.priced),
    quote.priced.length ? quote.total : null,
    quote.priced.length ? quote.advance : null,
    next.contactPhone,
    next.specialRequirements,
  ];
  const db = getDb();
  let id: string;
  if (draft) {
    await db.query(
      `UPDATE bookings SET full_name = $1, service = $2, event_date = $3, event_location = $4, party_size = $5, event_type = $6,
              event_time = $7, event_zip = $8, artist = $9, quote_items = $10, total_price = $11, advance_amount = $12,
              contact_phone = $13, special_requirements = $14, updated_at = now()
              ${changedAfterPaymentRequest ? ", booking_status = NULL, payment_requested_at = NULL" : ''}
        WHERE id = $15`,
      [...values, draft.id],
    );
    id = draft.id;
    console.log(`[whatsapp] booking #${id}: details saved${artist ? ` (artist: ${artist})` : ''}${changedAfterPaymentRequest ? '; payment request cancelled by a change' : ''}`);
  } else {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO bookings (full_name, service, event_date, event_location, party_size, event_type, event_time, event_zip, artist,
                             quote_items, total_price, advance_amount, contact_phone, special_requirements, phone, source, channel)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'whatsapp')
       RETURNING id::text`,
      [...values, `+${waId}`, chat.adSource ?? 'whatsapp'],
    );
    id = rows[0].id;
    console.log(`[whatsapp] new booking #${id} from …${waId.slice(-4)}`);
  }

  const missing = missingForAdvance({ ...next, items: quote.priced }, nameKnown);
  const occasions = [...new Set(next.items.map((i) => PACKAGES[i.package].occasion).filter(Boolean))];
  const result: Record<string, unknown> = {
    ok: true,
    booking_number: id,
    artist: artist ?? 'not known yet: it depends on the ZIP code',
    ...(artist === 'senior' && draft?.artist !== 'senior'
      ? {
          artist_note: `The event is outside the Atlanta service area, so one of ${B.artist.split(' ')[0]}'s senior artists will do the makeup. Tell the customer kindly and reassure them, then show them the senior artist's prices.`,
        }
      : artist === 'deepika' && draft?.artist !== 'deepika'
        ? { artist_note: `The event is in the Atlanta service area: ${B.artist.split(' ')[0]} herself will do the makeup. Tell the customer warmly.` }
        : {}),
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
          price_not_available: `There's no senior artist price for: ${quote.unavailable.join(', ')}. Don't guess a price: tell the customer ${B.artist.split(' ')[0]}'s team will confirm the quote for their location, and call handoff_to_deepika.`,
        }
      : {}),
    ...(artist && chat.quotedArtist !== artist && !quote.unavailable.length
      ? {
          quotation_needed: `The customer hasn't seen ${artist === 'deepika' ? "Deepika's" : "the senior artists'"} prices yet: call send_quotation (${occasions.length ? occasions.join(', ') : `their occasion${next.eventType ? `: ${next.eventType}` : ''}`}) now, in this reply (don't ask whether they'd like to see them), then ask which package they like. Ask for the advance only once they're happy with the price.`,
        }
      : {}),
    ...(changedAfterPaymentRequest ? { note: 'The payment message they got earlier no longer matches: once they agree, call request_advance_payment again.' } : {}),
    ...(untypedName ? { full_name_not_saved: 'full_name must be the name the customer typed in this chat: ask them for their full name.' } : {}),
    still_needed_before_advance: missing.length ? missing : 'nothing: once the customer has agreed to the package and price, call request_advance_payment',
  };
  return result;
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
  if (!d) return { ok: false, error: 'No booking details are saved yet: call save_booking_details with what the customer told you first.' };
  if (d.status === 'confirmed') return { ok: false, error: `Booking #${d.id} is already confirmed: no advance is needed.` };
  if (d.status === 'payment_review') return { ok: false, error: 'They already sent the payment screenshot; the team is verifying it. Tell them so.' };
  const missing = missingForAdvance(d, nameTyped(d.fullName, customerSaid));
  if (missing.length) return { ok: false, error: `Still needed first: ${missing.join(', ')}. Ask the customer naturally, save with save_booking_details, then try again.` };
  if (!d.artist || !d.eventDate || !d.eventTime || d.total === null || d.advance === null) return { ok: false, error: 'The booking has no price yet: save the package with save_booking_details.' };
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
  if (d.eventDate < todayInAtlanta().iso) return { ok: false, error: 'The event date is in the past: ask for the right date.' };
  const slot = await checkTime(d.eventDate, d.eventTime, { phone: `+${waId}` });
  if (!slot.open) {
    const options = await checkTimeForAssistant(d.eventDate, d.eventTime, { phone: `+${waId}` });
    return {
      ok: false,
      error: `${timeLabel(d.eventTime)} on ${d.eventDate} has just been taken on the calendar. Tell the customer kindly and offer only these: ${JSON.stringify(options)}. Save the new time with save_booking_details before asking for the advance again.`,
    };
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
export async function savePaymentProof(bookingId: string, data: Buffer, contentType: string): Promise<boolean> {
  const db = getDb();
  await db.query('INSERT INTO payment_proofs (booking_id, content_type, data) VALUES ($1, $2, $3)', [bookingId, contentType, data]);
  const { rowCount } = await db.query(
    `UPDATE bookings SET booking_status = 'payment_review', payment_submitted_at = now(), updated_at = now()
      WHERE id = $1 AND booking_status = 'awaiting_payment'`,
    [bookingId],
  );
  console.log(`[whatsapp] booking #${bookingId}: payment screenshot received (${Math.round(data.length / 1024)} KB)`);
  return Boolean(rowCount);
}

// ---------- The team (dashboard) ----------

interface AdminBookingRow extends DraftRow {
  phone: string;
  channel: string | null;
  payment_submitted_at: Date | null;
  confirmed_at: Date | null;
  confirmed_by_name: string | null;
  last_customer_message_at: Date | null;
}

async function adminRow(id: string): Promise<AdminBookingRow | null> {
  const { rows } = await getDb().query<AdminBookingRow>(
    `SELECT ${draftColumns('b.')}, b.phone, b.channel, b.payment_submitted_at, b.confirmed_at,
            u.name AS confirmed_by_name,
            (SELECT max(m.created_at) FROM whatsapp_messages m WHERE m.wa_id = substr(b.phone, 2) AND m.role = 'user') AS last_customer_message_at
       FROM bookings b LEFT JOIN admin_users u ON u.id = b.confirmed_by
      WHERE b.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Everything the dashboard shows about a lead's WhatsApp booking, including whether its time is still free. */
export async function bookingDetails(id: string): Promise<BookingDetails | null> {
  const r = await adminRow(id);
  if (!r) return null;
  const d = toDraft(r);
  const proofs = await getDb().query<{ id: string; content_type: string; created_at: Date }>(
    'SELECT id::text, content_type, created_at FROM payment_proofs WHERE booking_id = $1 ORDER BY id',
    [id],
  );
  let slot: BookingDetails['slot'] = { status: 'no_time', conflicts: [] };
  if (d.eventDate && d.eventTime) {
    const check = await checkTime(d.eventDate, d.eventTime, { bookingId: id });
    slot = { status: check.dayStatus === 'fully_booked' ? 'fully_booked' : check.open ? 'open' : 'taken', conflicts: check.conflicts };
  }
  return {
    status: d.status,
    eventType: d.eventType,
    eventTime: d.eventTime,
    eventZip: d.zip,
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

/**
 * The team approves a booking after checking the payment: it becomes confirmed (and the lead converted), its time
 * stays taken on the calendar, and the confirmation message for the customer comes back, with their WhatsApp number.
 */
export async function approveBooking(id: string, userId: string): Promise<{ waId: string | null; message: string }> {
  const r = await adminRow(id);
  if (!r) throw new BookingActionError('Lead not found.');
  const d = toDraft(r);
  if (d.status === 'confirmed') throw new BookingActionError('This booking is already confirmed.');
  if (d.status !== 'payment_review' && d.status !== 'awaiting_payment') throw new BookingActionError('Only a booking that is waiting for or showing an advance payment can be approved.');
  if (!d.eventDate || !d.eventTime || !d.artist || d.total === null || d.advance === null) throw new BookingActionError('This booking is missing its date, time, artist or price.');
  await getDb().query(
    `UPDATE bookings SET booking_status = 'confirmed', status = 'converted', confirmed_at = now(), confirmed_by = $2, updated_at = now() WHERE id = $1`,
    [id, userId],
  );
  return { waId: r.channel === 'whatsapp' ? r.phone.replace(/\D/g, '') : null, message: bookingConfirmedMessage(summaryOf(d)) };
}

/** The team couldn't match the screenshot to a payment: the booking waits for the advance again (with a fresh hold). */
export async function reopenPayment(id: string): Promise<{ waId: string | null; advance: number | null }> {
  const r = await adminRow(id);
  if (!r) throw new BookingActionError('Lead not found.');
  if (r.booking_status !== 'payment_review') throw new BookingActionError('Only a booking whose payment is being verified can be sent back.');
  await getDb().query(
    `UPDATE bookings SET booking_status = 'awaiting_payment', payment_requested_at = now(), payment_submitted_at = NULL, updated_at = now() WHERE id = $1`,
    [id],
  );
  return { waId: r.channel === 'whatsapp' ? r.phone.replace(/\D/g, '') : null, advance: r.advance_amount };
}

/** A payment screenshot, for the dashboard. */
export async function paymentProof(id: string): Promise<{ contentType: string; data: Buffer } | null> {
  const { rows } = await getDb().query<{ content_type: string; data: Buffer }>('SELECT content_type, data FROM payment_proofs WHERE id = $1', [id]);
  return rows[0] ? { contentType: rows[0].content_type, data: rows[0].data } : null;
}

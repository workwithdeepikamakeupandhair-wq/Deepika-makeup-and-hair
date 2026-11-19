/**
 * The WhatsApp assistant's fixed messages, sent word for word (server/whatsappBot.ts):
 * - Pooja's welcome, the first reply to a plain hello or "Hi, I need makeup services.";
 * - a quotation for each occasion, with the prices of the artist who will do the makeup (Deepika herself in the
 *   Atlanta area, a senior artist outside it), sent as its own message (the language model only picks the occasion,
 *   with the send_quotation tool, so prices are never retyped by the model), after the brochure images if any;
 * - the advance payment request, the thank-you for a payment screenshot, and the booking confirmation.
 * The prices come from src/data/portfolioData.ts, so a quotation changes with the price lists.
 */
import { money, timeLabel, type Artist, type QuoteItem } from '../src/data/bookingFlow.js';
import {
  ADVANCE_PERCENT,
  BRIDAL_PACKAGE,
  BUSINESS_INFO as B,
  formatPrice,
  formatServicePrice,
  FUNCTION_PRICES,
  NON_BRIDAL_NOT_INCLUDED,
  PARTY_PRICES,
  SENIOR_ARTIST_SERVICES,
  SERVICES,
  TRAVEL_POLICY,
  type OccasionPrice,
  type ServiceItem,
} from '../src/data/portfolioData.js';

/** The assistant's name. */
export const ASSISTANT_NAME = 'Pooja';
const ARTIST = B.artist.split(' ')[0]; // "Deepika"

/** Pooja's welcome, word for word. */
export const WELCOME_MESSAGE = `Hi there! 😊 I'm ${ASSISTANT_NAME}, ${ARTIST}'s personal assistant.

Welcome! How can I help you today? Are you looking for makeup services for a wedding or any special occasion?`;

/** Who does the makeup, as the customer reads it. */
export const ARTIST_FOR_CUSTOMER: Record<Artist, string> = {
  deepika: `${ARTIST} herself`,
  senior: `One of ${ARTIST}'s senior artists`,
};

const service = (id: string) => [...SERVICES, ...SENIOR_ARTIST_SERVICES].find((s) => s.id === id)!;
/** One price in a list. A list of per-person prices says so in its heading. */
const priceLine = (s: ServiceItem | OccasionPrice) => `• ${s.title}: ${formatPrice(s.price)}${'badge' in s && s.badge ? ` (${s.badge})` : ''}`;
const ticks = (items: string[]) => items.map((i) => `✔ ${i}`).join('\n');
/** From the price lists: travel charges, and the advance that confirms the date. */
const POLICY = `${TRAVEL_POLICY[0]}.\nYour date is confirmed after a ${ADVANCE_PERCENT}% advance payment (non-refundable).`;
/** Under Deepika's own prices: they're for the Atlanta area, where she does the makeup herself. */
const DEEPIKA_CLOSING = `These prices are with ${ARTIST} herself, for events in the Atlanta area. Outside Atlanta, one of ${ARTIST}'s senior artists takes care of you, and the price can differ.\n${POLICY}`;
const SENIOR_CLOSING = `These are our senior artists' prices. They're personally trained by ${ARTIST} and follow her techniques and standards.\n${POLICY}`;

const bridal = (artist?: 'senior') =>
  [...SERVICES, ...SENIOR_ARTIST_SERVICES].filter((s) => s.category === 'bridal' && s.artist === artist).map(priceLine).join('\n');

const bridalQuote = (artist: Artist) => `*Bridal Makeup Quotation* 💍
_${artist === 'deepika' ? `With ${ARTIST}` : 'With a senior artist'}:_

${bridal(artist === 'senior' ? 'senior' : undefined)}

*Every bridal package includes:*
${ticks(BRIDAL_PACKAGE.includes)}

Not included: ${BRIDAL_PACKAGE.notIncluded.join(', ')}

${artist === 'deepika' ? DEEPIKA_CLOSING : SENIOR_CLOSING}`;

const functionQuote = (occasion: string) => `*${occasion} Quotation* ✨
_With ${ARTIST}:_

${FUNCTION_PRICES.map((q) => [priceLine(q), ...(q.includes?.length ? [`\n*What's included:*\n${ticks(q.includes)}`] : [])].join('\n')).join('\n\n')}

${DEEPIKA_CLOSING}`;

const PARTY_QUOTE = `*Party Makeup Quotation* 🎉
_Per person, with ${ARTIST}:_

${PARTY_PRICES.map(priceLine).join('\n')}

${DEEPIKA_CLOSING}`;

const nonBridalQuote = (artist: Artist) => {
  const s = service(artist === 'deepika' ? 'non-bridal-family-glam' : 'senior-non-bridal-family-glam');
  return `*Non-Bridal Makeup Quotation* ✨
${s.forWhom}

• ${s.title}${artist === 'senior' ? ' (senior artist)' : ''}: ${formatServicePrice(s)}
${ticks(s.features)}
${artist === 'deepika' ? `\nNot included: ${NON_BRIDAL_NOT_INCLUDED.join(', ')}\n` : ''}
${artist === 'deepika' ? DEEPIKA_CLOSING : SENIOR_CLOSING}`;
};

const groomQuote = (artist: Artist) => {
  const s = service(artist === 'deepika' ? 'groom-makeover' : 'senior-groom-makeover');
  return `*Groom Makeover Quotation* ✨

• ${s.title}${artist === 'senior' ? ' (senior artist)' : ''}: ${formatServicePrice(s)}
${ticks(s.features)}

${artist === 'deepika' ? DEEPIKA_CLOSING : SENIOR_CLOSING}`;
};

/** What the model chooses from, and what each choice means (in the send_quotation tool's description). */
export const QUOTE_OCCASIONS = {
  bridal: "the bride's wedding, reception, Pellikuthuru or other wedding events (not the engagement)",
  engagement: 'an engagement',
  house_warming: 'a house warming',
  half_saree_function: 'a half saree function',
  party: 'a birthday party or any other party or celebration not listed here',
  non_bridal: "non-bridal makeup for the bride's family members or guests at a wedding",
  groom: 'the groom',
} as const;
export type QuoteOccasion = keyof typeof QUOTE_OCCASIONS;

/**
 * Each occasion's quotation, for each artist who has a price list for it. Engagements, house warmings, half saree
 * functions and parties only have Deepika's prices: a senior artist's quote for those comes from the team.
 */
export const QUOTATIONS: Record<QuoteOccasion, Partial<Record<Artist, string>>> = {
  bridal: { deepika: bridalQuote('deepika'), senior: bridalQuote('senior') },
  engagement: { deepika: functionQuote('Engagement') },
  house_warming: { deepika: functionQuote('House Warming') },
  half_saree_function: { deepika: functionQuote('Half Saree Function') },
  party: { deepika: PARTY_QUOTE },
  non_bridal: { deepika: nonBridalQuote('deepika'), senior: nonBridalQuote('senior') },
  groom: { deepika: groomQuote('deepika'), senior: groomQuote('senior') },
};

/**
 * Brochure images sent just before a quotation (paths under public/, served by the website), by occasion and artist.
 * Empty until Deepika's brochure images are added to public/images/brochures/: the quotation text goes alone.
 */
export const BROCHURES: Partial<Record<QuoteOccasion, Partial<Record<Artist, string[]>>>> = {};

/** A brochure's public address, for WhatsApp to fetch. */
export const brochureUrl = (path: string) => `${B.website}${path.startsWith('/') ? '' : '/'}${path}`;

// ---------- Booking messages ----------

/** "Tuesday, December 15, 2026" */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
}

const itemLine = (i: QuoteItem) => `• ${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''}: ${money(i.unitPrice * i.quantity)}`;

export interface BookingSummary {
  fullName: string;
  items: QuoteItem[];
  /** YYYY-MM-DD */
  date: string;
  /** "08:00" */
  time: string;
  artist: Artist;
  total: number;
  advance: number;
  balance: number;
}

/** Asks for the advance: what's booked, the amounts, and the payment details from the dashboard's Settings. */
export function paymentRequestMessage(b: BookingSummary, paymentDetails: string): string {
  return `Everything looks good! ❤️ We're excited to be part of your special day.

*Your booking*
${b.items.map(itemLine).join('\n')}
📅 ${longDate(b.date)} at ${timeLabel(b.time)}
💄 Artist: ${ARTIST_FOR_CUSTOMER[b.artist]}

Total: *${money(b.total)}*
Advance (${ADVANCE_PERCENT}%): *${money(b.advance)}*
Remaining balance: ${money(b.balance)}

To confirm your booking, we require a ${ADVANCE_PERCENT}% advance payment of the total package amount, which is *${money(b.advance)}*.

Please note that the advance payment is non-refundable.

You can make the payment using the details below:

${paymentDetails}

Once you've completed the payment, kindly share the payment screenshot here. Our team will verify it and confirm your booking.`;
}

/** Sent when the customer's payment screenshot arrives. Nothing is marked as paid until the team checks it. */
export const PAYMENT_RECEIVED_MESSAGE = `Thank you so much! ❤️ We've received your payment screenshot.

Our team will verify the payment and review your booking details. We'll update you shortly once everything is approved.`;

/** A further screenshot or receipt while the team is already checking the first one. */
export const EXTRA_PROOF_MESSAGE = `Got it, thank you! 😊 I've added this to your booking for our team to check.`;

/** Sent when the team approves the booking in the dashboard. */
export function bookingConfirmedMessage(b: Omit<BookingSummary, 'total' | 'balance'>): string {
  return `*You're officially booked!* 🎉
We're so happy to be part of your special day! ❤️

Thank you for trusting ${ARTIST} and her team.

Your booking has been successfully confirmed.

*Your booking details*
• Name: ${b.fullName}
• Service: ${b.items.map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', ')}
• Event date: ${longDate(b.date)}
• Time: ${timeLabel(b.time)}
• Artist: ${ARTIST_FOR_CUSTOMER[b.artist]}
• Advance payment: Received (${money(b.advance)})

We're looking forward to making your special day even more beautiful!

If you have any questions or requests before your event, we're always here to help. ❤️`;
}

/** Sent when the team couldn't match the screenshot to a payment and asks for it again. */
export function paymentNotVerifiedMessage(advance: number | null): string {
  return `Hi! 😊 Our team couldn't verify your advance payment${advance ? ` of ${money(advance)}` : ''} yet. Could you please check it and share the payment screenshot here again? If anything is unclear, just reply here and I'll help.`;
}

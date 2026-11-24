/**
 * The WhatsApp assistant's fixed messages, sent word for word (server/whatsappBot.ts):
 * - Pooja's welcome, the first reply to a hello, and the enquiry form as text (when the WhatsApp form can't be sent);
 * - the thank-you once the form is filled in, and what the customer hears when the team approves the enquiry (who
 *   does the makeup, then that artist's quotations) or isn't available;
 * - a quotation for each occasion, with the prices of the artist who will do the makeup (Deepika herself in the
 *   Atlanta area, a senior artist outside it), sent as its own message (prices are never retyped by the language
 *   model), after the brochure images if any;
 * - the advance payment request, the thank-you for a payment screenshot, and the booking confirmation.
 * The prices come from src/data/portfolioData.ts, so a quotation changes with the price lists.
 */
import { money, timeLabel, type Artist, type QuoteItem } from '../src/data/bookingFlow.js';
import {
  ADVANCE_PERCENT,
  BRIDAL_PACKAGE,
  BUSINESS_INFO as B,
  EXPERIENCE_STATS,
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

/** The assistant's name and role. */
export const ASSISTANT_NAME = 'Pooja';
const ARTIST = B.artist.split(' ')[0]; // "Deepika"
export const ASSISTANT_ROLE = `${ARTIST}'s manager`;

/** The first line of the welcome. */
export const WELCOME_GREETING = `Hi there! 😊 I'm ${ASSISTANT_NAME}, ${ASSISTANT_ROLE}.`;

/**
 * The enquiry form, word for word as the team wrote it (2026-11-24). Sent as text where the WhatsApp form (with fields
 * and a Submit button, server/enquiryForm.ts) can't be: before Meta approves it, or on Meta's Cloud API connection.
 */
export const ENQUIRY_FORM = `To help us understand your requirements and share an accurate quotation, kindly fill in the details below:

📋 EVENT & MAKEUP REQUIREMENTS

1. Event Date:
    ⸻
2. Event Location (City & Venue):
    ⸻
3. Event Start Time:
    ⸻
4. Makeup Ready Time / Reporting Time:
    ⸻
5. Bridal Makeup:
    Number of requirements: __
6. Groom Makeup:
    Number of requirements: __
7. Non-Bridal Makeup:
    Number of requirements: __
8. Additional Requirements (if any):
    ⸻
9. Number of Events / Functions:
    ⸻

Once you share the above details, our team will review your requirements and share the pricing and package details accordingly.

Thank you for considering Deepika Makeup and Hair. We look forward to being a part of your special occasion! ❤️`;

/**
 * Pooja's welcome, word for word: the whole first reply to a hello or "Hi, I need makeup services.". The enquiry form
 * follows her reply to whatever they say next.
 */
export const WELCOME_MESSAGE = `${WELCOME_GREETING}

Welcome! How can I help you today? Are you looking for makeup services for a wedding or any special occasion?`;

/** Sent once the enquiry form is complete; the team then reviews it. */
export const ENQUIRY_RECEIVED_MESSAGE = `Thank you so much for sharing your details! ❤️

Our team will check your application and update you within two hours.`;

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
const POLICY = `${TRAVEL_POLICY[0]}.\nA ${ADVANCE_PERCENT}% advance payment (non-refundable) blocks your slot and confirms your date.`;
/** Under Deepika's own prices (sent only for events in the Atlanta area, where she does the makeup herself). */
const DEEPIKA_CLOSING = `These prices are with ${ARTIST} herself, for events in the Atlanta area.\n${POLICY}`;
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

// ---------- The enquiry: the team's answer ----------

/** What the event is for (save_enquiry), and how it's saved as the booking's event type. */
export const EVENT_OCCASIONS = {
  wedding: 'Wedding',
  engagement: 'Engagement',
  house_warming: 'House warming',
  half_saree_function: 'Half saree function',
  party: 'Party',
  other: 'Other occasion',
} as const;
export type EventOccasion = keyof typeof EVENT_OCCASIONS;

/** The occasion of a saved event type (older ones are free text, e.g. "Birthday party"); a wedding when unsure. */
export function occasionOf(eventType: string | null): EventOccasion {
  const t = (eventType ?? '').toLowerCase();
  if (/engage/.test(t)) return 'engagement';
  if (/house ?warm/.test(t)) return 'house_warming';
  if (/half ?saree/.test(t)) return 'half_saree_function';
  if (/party|birthday/.test(t)) return 'party';
  if (/^other/.test(t)) return 'other';
  return 'wedding';
}

/**
 * The quotations an enquiry needs, from its occasion and the form's numbers: the main person's (the bridal packages
 * for a wedding, the occasion's own quotation for an engagement, house warming or half saree function), non-bridal
 * for family and guests, and the groom's. A party gets the party quotation, which is per person, for everyone.
 */
export function quotationsFor(eventType: string | null, people: { bridal: number; groom: number; nonBridal: number }): QuoteOccasion[] {
  const occasion = occasionOf(eventType);
  if (occasion === 'party') return ['party'];
  const list: QuoteOccasion[] = [];
  if (people.bridal > 0) list.push(occasion === 'wedding' || occasion === 'other' ? 'bridal' : occasion);
  if (people.nonBridal > 0) list.push('non_bridal');
  if (people.groom > 0) list.push('groom');
  return list;
}

/** "15+ years in the beauty industry, 6000+ bridal transformations and 8000+ non-bridal clients" */
const EXPERIENCE = EXPERIENCE_STATS.map((s) => `${s.value} ${s.label.toLowerCase()}`)
  .join(', ')
  .replace(/, ([^,]*)$/, ' and $1');

/** Who does the makeup, as the customer hears it once the enquiry is approved. */
const ARTIST_INTRO: Record<Artist, string> = {
  deepika: `Since your event is in Atlanta, *${ARTIST} herself* will be taking care of your makeup ❤️

A little about ${ARTIST}: she has ${EXPERIENCE}. She's passionate about creating personalised looks that make every client feel confident and special, for weddings, engagements, receptions and every celebration. Her goal is for you to feel comfortable and look your absolute best.`,
  senior: `Since your event is outside Atlanta, one of ${ARTIST}'s *senior makeup artists* will be taking care of your makeup. Our senior artists are personally trained by ${ARTIST} herself and follow her techniques, standards and professional approach, so you'll receive the same quality of service. You'll be in very good hands! ❤️`,
};

/** The occasion's name in a sentence: "your engagement". */
const occasionWords: Record<QuoteOccasion, string> = {
  bridal: 'the bridal makeup',
  engagement: 'your engagement',
  house_warming: 'your house warming',
  half_saree_function: 'your half saree function',
  party: 'your party',
  non_bridal: 'the non-bridal makeup',
  groom: 'the groom makeup',
};

/**
 * What the customer gets when the team approves their enquiry, in order: the good news with who does the makeup,
 * the quotations (with brochures) for that artist, and a question to go on. `quotes` are the quotations to send;
 * `teamQuotes` the occasions with no price list for this artist, which the team quotes personally.
 */
export function enquiryApprovedMessages(
  artist: Artist,
  date: string,
  quotes: QuoteOccasion[],
  teamQuotes: QuoteOccasion[],
): ({ text: string } | { image: string })[] {
  const later = teamQuotes.length
    ? `For ${teamQuotes.map((o) => occasionWords[o]).join(' and ')}, our team will share the pricing with you personally very soon.`
    : '';
  const intro = `Great news! 🎉 Our team has reviewed your requirements, and we'd love to be part of your special occasion on *${longDate(date)}*.\n\n${ARTIST_INTRO[artist]}`;
  if (!quotes.length) return [{ text: `${intro}\n\n${later} Meanwhile, I'm happy to help with any questions 😊` }];
  return [
    { text: `${intro}\n\nHere are our packages and pricing 👇` },
    ...quotes.flatMap((o) => [...(BROCHURES[o]?.[artist] ?? []).map((image) => ({ image: brochureUrl(image) })), { text: QUOTATIONS[o][artist]! }]),
    { text: `${later ? `${later}\n\n` : ''}Have a look and let me know which package you'd like 😊 I'm happy to explain anything.` },
  ];
}

/** What the customer gets when the team isn't available for their enquiry. */
export function enquiryNotAvailableMessage(date: string | null): string {
  return `Thank you so much for your patience! 🙏 Our team has reviewed your requirements, and unfortunately we're not available for your event${date ? ` on *${longDate(date)}*` : ''}.

If you have another date in mind, just share it here and our team will check it for you ❤️`;
}

// ---------- Booking messages ----------

/** "Tuesday, December 15, 2026" */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
}


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

/** One service's 25% advance (the same sum as advanceFor in whatsappBooking.ts). */
const advanceOf = (i: QuoteItem) => Math.round(i.unitPrice * i.quantity * ADVANCE_PERCENT) / 100;

/** "*HD Bridal Makeup*\nPrice: $550 · Advance (25%): $137.50"; several people: "× 2 ($300 each)". */
const serviceBlock = (i: QuoteItem) =>
  `*${i.title}*${i.quantity > 1 ? ` × ${i.quantity}` : ''}\nPrice: ${money(i.unitPrice * i.quantity)}${i.quantity > 1 ? ` (${money(i.unitPrice)} each)` : ''} · Advance (${ADVANCE_PERCENT}%): ${money(advanceOf(i))}`;

/**
 * Asks for the advance: each service with its price and its 25% advance, the totals, and the payment details from the
 * dashboard's Settings, then the screenshot.
 */
export function paymentRequestMessage(b: BookingSummary, paymentDetails: string): string {
  return `Everything looks good! ❤️ We're excited to be part of your special day.

📅 ${longDate(b.date)} at ${timeLabel(b.time)}
💄 Artist: ${ARTIST_FOR_CUSTOMER[b.artist]}

${b.items.map(serviceBlock).join('\n\n')}

Total: *${money(b.total)}*
Advance to pay now (${ADVANCE_PERCENT}%): *${money(b.advance)}*
Remaining balance: ${money(b.balance)}

To confirm your booking and block your slot, kindly pay the ${ADVANCE_PERCENT}% advance of *${money(b.advance)}* using the details below:

${paymentDetails}

Please note that the advance payment is non-refundable.

📸 Once you've paid, kindly share the *payment screenshot* here. Our team will verify it and confirm your booking.`;
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
${/^WhatsApp (customer|lead|contact)$/.test(b.fullName) ? '' : `• Name: ${b.fullName}\n`}• Service: ${b.items.map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', ')}
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

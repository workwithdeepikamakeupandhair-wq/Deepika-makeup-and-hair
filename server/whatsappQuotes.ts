/**
 * The WhatsApp assistant's fixed messages, sent word for word (server/whatsappBot.ts):
 * - the welcome: Deepika's own text, the first reply in every new chat;
 * - a quotation for each occasion, sent as its own message once the customer says what they need makeup for (the
 *   language model only picks the occasion, with the send_quotation tool, so prices are never retyped by the model).
 * The prices come from src/data/portfolioData.ts, so a quotation changes with the price lists.
 */
import {
  BOOKING_POLICY,
  BRIDAL_PACKAGE,
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

/** Deepika's welcome message, word for word. */
export const WELCOME_MESSAGE = `Hello! Thank you for reaching out to Deepika Makeup & Hair ❤️

To assist you better with your booking enquiry, kindly share the following details:

1. Date:
2. Location:
3. Event Type:
4. Requirements: (Bride / Groom / Non-Bridal Makeup / Hair Styling, etc.)

Our team will get back to you with the availability and package details.

Thank you for choosing Deepika Makeup & Hair! ✨`;

const service = (id: string) => [...SERVICES, ...SENIOR_ARTIST_SERVICES].find((s) => s.id === id)!;
/** One price in a list. A list of per-person prices says so in its heading. */
const priceLine = (s: ServiceItem | OccasionPrice) => `• ${s.title}: ${formatPrice(s.price)}${'badge' in s && s.badge ? ` (${s.badge})` : ''}`;
const ticks = (items: string[]) => items.map((i) => `✔ ${i}`).join('\n');
/** From the price lists: travel charges, and when the date is confirmed. */
const CLOSING = `${TRAVEL_POLICY[0]}.\n${BOOKING_POLICY[2]}.`;

const bridal = (artist?: 'senior') =>
  [...SERVICES, ...SENIOR_ARTIST_SERVICES].filter((s) => s.category === 'bridal' && s.artist === artist).map(priceLine).join('\n');

const BRIDAL_QUOTE = `*Bridal Makeup Quotation* 💍

*With Deepika:*
${bridal()}

*With a senior artist:*
${bridal('senior')}

*Every bridal package includes:*
${ticks(BRIDAL_PACKAGE.includes)}

Not included: ${BRIDAL_PACKAGE.notIncluded.join(', ')}

Package prices are for Atlanta. ${CLOSING}`;

const functionQuote = (occasion: string) => `*${occasion} Quotation* ✨

${FUNCTION_PRICES.map((q) => [priceLine(q), ...(q.includes?.length ? [ticks(q.includes)] : [])].join('\n')).join('\n\n')}

${CLOSING}`;

const PARTY_QUOTE = `*Party Makeup Quotation* 🎉
_Per person, with Deepika:_

${PARTY_PRICES.map(priceLine).join('\n')}

${CLOSING}`;

const familyGlam = service('non-bridal-family-glam');
const NON_BRIDAL_QUOTE = `*Non-Bridal Makeup Quotation* ✨
${familyGlam.forWhom}

• ${familyGlam.title}: ${formatServicePrice(familyGlam)}
${ticks(familyGlam.features)}

Not included: ${NON_BRIDAL_NOT_INCLUDED.join(', ')}

${CLOSING}`;

const groom = service('groom-makeover');
const GROOM_QUOTE = `*Groom Makeover Quotation* ✨

• ${groom.title}: ${formatServicePrice(groom)}
${ticks(groom.features)}

${CLOSING}`;

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

export const QUOTATIONS: Record<QuoteOccasion, string> = {
  bridal: BRIDAL_QUOTE,
  engagement: functionQuote('Engagement'),
  house_warming: functionQuote('House Warming'),
  half_saree_function: functionQuote('Half Saree Function'),
  party: PARTY_QUOTE,
  non_bridal: NON_BRIDAL_QUOTE,
  groom: GROOM_QUOTE,
};

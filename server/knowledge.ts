/**
 * Builds the RAG knowledge base from the website's own content.
 * Edit src/data/portfolioData.ts or the FAQ list below, then run `npm run db:ingest`.
 *
 * Only add facts you are happy for the assistant to repeat to clients word for word.
 */
import {
  ADVANCE_PERCENT,
  BOOKING_POLICY,
  bookingName,
  BRIDAL_PACKAGE,
  BUSINESS_INFO,
  EXPERIENCE_STATS,
  formatPrice,
  formatServicePrice,
  FUNCTION_OCCASIONS,
  FUNCTION_PRICES,
  NON_BRIDAL_NOT_INCLUDED,
  type OccasionPrice,
  PARTY_PRICES,
  SENIOR_ARTIST_SERVICES,
  SERVICES,
  ServiceItem,
  TRAVEL_POLICY,
  VIDEO_TESTIMONIALS,
} from '../src/data/portfolioData.js';

export interface KnowledgeChunk {
  id: string;
  source:
    | 'business'
    | 'faq'
    | 'service'
    | 'category'
    | 'look'
    | 'runway'
    | 'testimonial'
    | 'instagram';
  title: string;
  content: string;
  /** Text used for the embedding. Defaults to title + content. FAQs embed only the question. */
  embedText?: string;
}

export function embeddingText(chunk: KnowledgeChunk): string {
  return chunk.embedText ?? `${chunk.title}\n${chunk.content}`;
}

const B = BUSINESS_INFO;

const list = (items: string[]) => items.join('; ');
const priced = (s: ServiceItem) => `${s.title}: ${formatServicePrice(s)}`;
const byCategory = (c: ServiceItem['category'], services = SERVICES) => services.filter((s) => s.category === c);
const ALL_SERVICES = [...SERVICES, ...SENIOR_ARTIST_SERVICES];

/** The price lists' "not included" notes: one for the bridal packages (both lists), one for Deepika's non-bridal
 *  looks and separate charges. The groom package and the senior artist's non-bridal look have none. */
function notIncludedLine(s: ServiceItem): string {
  if (s.category === 'bridal') {
    return `Every bridal package includes ${list(BRIDAL_PACKAGE.includes)}. Not included: ${list(BRIDAL_PACKAGE.notIncluded)}.`;
  }
  if (s.id.endsWith('groom-makeover') || s.artist === 'senior') return '';
  return `Not included: ${list(NON_BRIDAL_NOT_INCLUDED)}.`;
}

/** One service as a sentence: name, price, what it is, what is included. */
function describeService(s: ServiceItem): string {
  return [
    `${bookingName(s)} costs ${formatServicePrice(s)}${s.badge ? ` (${s.badge})` : ''}.`,
    s.forWhom ? `${s.forWhom}.` : '',
    s.features.length ? `Features: ${list(s.features)}.` : '',
    s.idealFor ? `Ideal for: ${s.idealFor}.` : '',
    notIncludedLine(s),
  ]
    .filter(Boolean)
    .join(' ');
}

const SENIOR_PRICE_LIST =
  `With a senior artist: ${SENIOR_ARTIST_SERVICES.map(priced).join(', ')}. ` +
  'Each senior artist bridal package includes one hairstyling and one saree draping.';

/** "HD Makeup $500 (includes: Matte & polished finish; …; One saree draping)" */
const occasionPrices = (prices: OccasionPrice[]) =>
  prices.map((q) => `${q.title} ${formatPrice(q.price)}${q.includes?.length ? ` (includes: ${list(q.includes)})` : ''}`).join(', ');

/** What Deepika quotes for occasions other than weddings (not on the prices page). */
const FUNCTIONS_PRICE_LIST = `${FUNCTION_OCCASIONS.join(', ')} (with Deepika herself): ${occasionPrices(FUNCTION_PRICES)}.`;
const PARTIES_PRICE_LIST = `Birthday parties and other parties (per person, with Deepika herself): ${occasionPrices(PARTY_PRICES)}.`;

const PRICE_LIST =
  `With Deepika herself: bridal packages (prices for Atlanta): ${byCategory('bridal').map(priced).join(', ')}. ` +
  `${byCategory('family').map(priced).join(', ')}. ` +
  `Separate charges: ${byCategory('single').map(priced).join(', ')}. ` +
  `${SENIOR_PRICE_LIST} ${FUNCTIONS_PRICE_LIST} ${PARTIES_PRICE_LIST} Travel charges are additional (based on location). ` +
  `The full price list: ${B.website}/prices`;

/** Frequently asked questions: answers use only Deepika's price list and facts already on the site. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I book Deepika? How can I check availability for my wedding date?',
    a: `Use "Book a Consultation" on this website, or message Deepika on WhatsApp: ${B.phonePrimaryCountry} ${B.phonePrimary} (${B.whatsappUrl}) or ${B.phoneSecondaryCountry} ${B.phoneSecondary} (${B.whatsappSecondaryUrl}). You can also call either number. Deepika reviews inquiries within 24 hours. ${BOOKING_POLICY[2]}.`,
  },
  {
    q: 'How much does it cost? What are your prices, rates, charges or package fees? Can I get a price list?',
    a: PRICE_LIST,
  },
  {
    q: 'Can I book a senior artist instead of Deepika? Is there a cheaper option? What are the senior artist prices?',
    a:
      `Yes. ${SENIOR_PRICE_LIST} Like Deepika's packages, each senior artist bridal package includes ` +
      `${list(BRIDAL_PACKAGE.includes)}, plus the exclusive bridal experience. Senior artist prices: ${B.website}/prices?artist=senior`,
  },
  {
    q: 'Which bridal package should I choose? What is the difference between HD, Advanced and Airbrush bridal makeup?',
    a:
      byCategory('bridal')
        .map((s) => `${s.title} (${formatPrice(s.price)} with Deepika): ${list(s.features)}. Ideal for ${s.idealFor?.toLowerCase()}.`)
        .join(' ') +
      ` With a senior artist: ${byCategory('bridal', SENIOR_ARTIST_SERVICES).map(priced).join(', ')}.` +
      ` Deepika's personal recommendation: ${BRIDAL_PACKAGE.recommendation}`,
  },
  {
    q: "What is included in the bridal package? Do you do hair, saree draping, lashes and jewelry setting? What isn't included?",
    a:
      `Each bridal package (HD, Advanced or Airbrush) includes ${list(BRIDAL_PACKAGE.includes)}. ` +
      `The exclusive bridal experience also includes ${list(BRIDAL_PACKAGE.experience)}. ` +
      `Not included: ${list(BRIDAL_PACKAGE.notIncluded)}. Bridal packages are for the ${BRIDAL_PACKAGE.events}.`,
  },
  {
    q: "Do you do makeup for the bride's family, mother, sisters, bridesmaids or wedding guests? Do you do only hair or only saree draping?",
    a:
      `Yes. ${describeService(byCategory('family')[0])} ` +
      `Separate charges: ${byCategory('single').map(priced).join(', ')} (these don't include ` +
      `${NON_BRIDAL_NOT_INCLUDED.join(', ').toLowerCase()} either).`,
  },
  {
    q: 'Do you do groom makeup?',
    a: `Yes. ${describeService(SERVICES.find((s) => s.id === 'groom-makeover')!)} With a senior artist it is also ${formatPrice(SENIOR_ARTIST_SERVICES.find((s) => s.id === 'senior-groom-makeover')!.price)}.`,
  },
  {
    q: 'How much is makeup for an engagement, house warming or half saree function?',
    a: `${FUNCTIONS_PRICE_LIST} ${TRAVEL_POLICY[0]}.`,
  },
  {
    q: 'How much is makeup and hair for a birthday party or another party?',
    a: `${PARTIES_PRICE_LIST} ${TRAVEL_POLICY[0]}.`,
  },
  {
    q: 'Do you travel? Do you do destination weddings? Are there travel charges? Where is Deepika based?',
    a: `Deepika is based in ${B.location}. Her bridal package prices are for Atlanta. ${list(TRAVEL_POLICY)}.`,
  },
  {
    q: 'Is there an advance or deposit? How much is the advance? What is your cancellation, refund or postponement policy?',
    a: `A ${ADVANCE_PERCENT}% advance of the total package amount blocks the slot and confirms the booking, and it is non-refundable. ${list(BOOKING_POLICY)}.`,
  },
  {
    q: 'What is your phone number, WhatsApp or Instagram? How do I contact you?',
    a: `Both numbers work for WhatsApp and calls: ${B.phonePrimaryCountry} ${B.phonePrimary} (WhatsApp ${B.whatsappUrl}) and ${B.phoneSecondaryCountry} ${B.phoneSecondary} (WhatsApp ${B.whatsappSecondaryUrl}). Email: ${B.email}. Instagram: ${B.instagramHandle} (${B.instagram}).`,
  },
  {
    q: 'Do you offer makeup classes, courses or training? Is the certificate recognized internationally?',
    a: `Yes, Deepika teaches makeup classes (${B.certification}). Class details and fees aren't on the website: message Deepika on WhatsApp (${B.whatsappUrl}) to ask.`,
  },
];

export function buildKnowledge(): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  chunks.push({
    id: 'business-about',
    source: 'business',
    title: `About ${B.artist}`,
    content: `${B.name} — ${B.title}. ${B.bio} ${B.tagline}.`,
  });

  FAQ.forEach((f, i) =>
    chunks.push({ id: `faq-${i + 1}`, source: 'faq', title: f.q, content: f.a, embedText: f.q }),
  );

  for (const s of ALL_SERVICES) {
    chunks.push({ id: `service-${s.id}`, source: 'service', title: bookingName(s), content: describeService(s) });
  }

  chunks.push({
    id: 'service-bridal-experience',
    source: 'service',
    title: 'Exclusive bridal experience',
    content: `Every bridal package also includes ${list(BRIDAL_PACKAGE.experience)}.`,
  });

  for (const t of VIDEO_TESTIMONIALS) {
    chunks.push({
      id: `testimonial-${t.id}`,
      source: 'testimonial',
      title: `Client video review (${t.event})`,
      content:
        `A real bride talking about her ${t.event.toLowerCase()} said in a video review: "${t.quote}" ` +
        'The video reviews are in the Testimonials section of the website.',
    });
  }

  return chunks;
}

/** Class inquiries can be saved too, although classes have no published price. */
export const CLASS_INQUIRY = 'Makeup Class';

/** Prices Deepika quotes for engagements, house warmings, half saree functions and parties. */
const OCCASION_PRICES = [...FUNCTION_PRICES, ...PARTY_PRICES];
const bookedAs = (prices: OccasionPrice[]) => prices.map((q) => `"${q.bookingName}"`).join(', ');

/**
 * Everything a customer can book: the website booking form's names (the price lists), plus the occasions quoted on
 * WhatsApp.
 */
export const BOOKABLE_SERVICES = [...ALL_SERVICES.map(bookingName), ...OCCASION_PRICES.map((q) => q.bookingName), CLASS_INQUIRY];

/**
 * The core business facts in one compact block. The WhatsApp assistant gets it with every question, so answers
 * like "what services do you offer?" or "how much is airbrush makeup?" are always complete instead of depending
 * on which entries the search happened to return.
 */
export function businessFacts(): string {
  return [
    `Business: ${B.name}, run by ${B.artist} (${B.title}). Based in ${B.location}.`,
    `Experience: ${EXPERIENCE_STATS.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}.`,
    `About: ${B.bio}`,
    `Phone and WhatsApp: ${B.phonePrimaryCountry} ${B.phonePrimary} (main), ${B.phoneSecondaryCountry} ${B.phoneSecondary}. Email: ${B.email}. Instagram: ${B.instagramHandle} (${B.instagram}).`,
    `Price list: ${PRICE_LIST}`,
    `Booking: on WhatsApp, Pooja (${B.artist}'s manager) sends an enquiry form (event date, location, times, how many need bridal, groom and non-bridal makeup, additional requirements, number of events). ${B.artist}'s team reviews it and replies within two hours, with the pricing. In Atlanta ${B.artist} does the makeup herself; outside Atlanta, one of her senior artists (personally trained by her, following her techniques and standards) does, at the senior artist's prices. A ${ADVANCE_PERCENT}% non-refundable advance of the total confirms the booking, once ${B.artist}'s team has verified the payment.`,
    '',
    `Services (name, price, details). Services ending in "(Senior Artist)" are done by a senior artist; all others by ${B.artist} herself:`,
    ...ALL_SERVICES.map((s) => `- ${describeService(s)}`),
    `- ${FUNCTIONS_PRICE_LIST} Saved with a booking request as ${bookedAs(FUNCTION_PRICES)}.`,
    `- ${PARTIES_PRICE_LIST} Saved with a booking request as ${bookedAs(PARTY_PRICES)}.`,
    `- Exclusive bridal experience (with every bridal package): ${list(BRIDAL_PACKAGE.experience)}.`,
    `- ${CLASS_INQUIRY}: ${B.artist} teaches makeup classes (${B.certification}). Class details and fees are not published: the customer should ask ${B.artist}.`,
    `Deepika's personal recommendation: ${BRIDAL_PACKAGE.recommendation}`,
    `Travel & accommodation: ${list(TRAVEL_POLICY)}.`,
    `Booking policy: ${list(BOOKING_POLICY)}.`,
    '',
    'Frequently asked questions:',
    ...FAQ.map((f) => `- ${f.q}\n  ${f.a}`),
  ].join('\n');
}

/** Shown when nothing in the knowledge base matches the question well enough. */
export const FALLBACK_ANSWER =
  `I don't have that detail on hand. Please message Deepika on WhatsApp — ${B.phonePrimaryCountry} ${B.whatsappUrl} ` +
  `or ${B.phoneSecondaryCountry} ${B.whatsappSecondaryUrl} — or call ${B.phonePrimary} / ${B.phoneSecondary}. She replies within 24 hours.`;

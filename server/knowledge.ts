/**
 * Builds the RAG knowledge base from the website's own content.
 * Edit src/data/portfolioData.ts or the FAQ list below, then run `npm run db:ingest`.
 *
 * Only add facts you are happy for the assistant to repeat to clients word for word.
 */
import {
  ARCHIVE_LOOKS,
  BUSINESS_INFO,
  CINEMATIC_CATEGORIES,
  RUNWAY_LOOKS,
  SERVICES,
  VIDEO_TESTIMONIALS,
} from '../src/data/portfolioData';

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

/** Frequently asked questions — answers use only information already on the site. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I book Deepika? How can I check availability for my wedding date?',
    a: `Use "Book a Consultation" on this website, or message Deepika on WhatsApp: ${B.phonePrimaryCountry} ${B.phonePrimary} (${B.whatsappUrl}) or ${B.phoneSecondaryCountry} ${B.phoneSecondary} (${B.whatsappSecondaryUrl}). You can also call either number. Deepika reviews inquiries within 24 hours.`,
  },
  {
    q: 'Where is Deepika based? Which areas do you serve? Do you travel for destination weddings?',
    a: `Deepika is based in ${B.location}. ${B.serviceArea}.`,
  },
  {
    q: 'What is your phone number, WhatsApp or Instagram? How do I contact you?',
    a: `Both numbers work for WhatsApp and calls: ${B.phonePrimaryCountry} ${B.phonePrimary} (WhatsApp ${B.whatsappUrl}) and ${B.phoneSecondaryCountry} ${B.phoneSecondary} (WhatsApp ${B.whatsappSecondaryUrl}). Instagram: ${B.instagramHandle} (${B.instagram}).`,
  },
  {
    q: 'Is the makeup course certificate recognized internationally? Is the certification valid abroad or in other countries?',
    a: `Yes. Deepika's makeup and hair certification is valid in 180 countries. It is awarded with the Pro Makeup & Hair Course.`,
  },
  {
    q: 'How much does bridal makeup and hair cost? What are your prices, rates, charges or package fees? Can I get a price list or quote?',
    a: `Every booking is quoted individually based on the services, event date, location and party size. Use "Book a Consultation" or message Deepika on WhatsApp (${B.whatsappUrl}) for package details.`,
  },
  {
    q: 'Do you do saree draping, lehenga or dupatta setting, and jewelry setting?',
    a: 'Yes. Bridal Makeup & Hair includes saree draping, plus jewelry, maang tikka and dupatta setting. Reception Makeup & Hair includes lehenga dupatta setting. Engagement Makeup & Hair includes saree, gown or lehenga draping help, and Party Makeup includes saree or dupatta draping on request.',
  },
  {
    q: 'Do you offer makeup classes or training for makeup artists?',
    a: `Yes. ${SERVICES.filter((s) => s.category === 'education')
      .map((s) => `${s.title} (${s.duration}): ${s.description}`)
      .join(' ')}`,
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

  for (const s of SERVICES) {
    chunks.push({
      id: `service-${s.id}`,
      source: 'service',
      title: s.title,
      content:
        `${s.title} — ${s.tagline}. Duration: ${s.duration}. ${s.description} ` +
        `Includes: ${s.includes.join('; ')}. Recommended for: ${s.recommendedFor}`,
    });
  }

  for (const c of CINEMATIC_CATEGORIES) {
    chunks.push({
      id: `category-${c.id}`,
      source: 'category',
      title: c.name,
      content: `${c.name} (${c.tagline.toLowerCase()}): ${c.details}`,
    });
  }

  for (const l of ARCHIVE_LOOKS) {
    chunks.push({
      id: `look-${l.id}`,
      source: 'look',
      title: l.title,
      content:
        `${l.title} — ${l.genre} look for ${l.occasion} (about ${l.durationMin} minutes). ${l.synopsis} ` +
        `Skin: ${l.skinFinish}. Eyes: ${l.eyesTechnique}. Lips: ${l.lipShade}. Hair: ${l.hairStyle}.`,
    });
  }

  for (const r of RUNWAY_LOOKS) {
    chunks.push({
      id: `runway-${r.id}`,
      source: 'runway',
      title: r.title,
      content:
        `${r.title} — ${r.subtitle}. ${r.description} ` +
        r.elements.map((e) => `${e.type}: ${e.name} (${e.details})`).join('. ') +
        '.',
    });
  }

  for (const t of VIDEO_TESTIMONIALS) {
    chunks.push({
      id: `testimonial-${t.id}`,
      source: 'testimonial',
      title: `Client video review (${t.event})`,
      content:
        `A real client who booked ${t.event} said in a video review: "${t.quote}" ` +
        'The video reviews are in the Testimonials section of the website.',
    });
  }

  return chunks;
}

/** Extra options the booking form offers besides the individual services. */
export const PACKAGE_OPTIONS = ['Full Wedding Package (Ceremony + Sangeet + Reception)', 'Sangeet & Mehendi Makeup'];

/** Everything a customer can book, using the same names as the website's booking form. */
export const BOOKABLE_SERVICES = [...SERVICES.map((s) => s.title), ...PACKAGE_OPTIONS];

/**
 * The core business facts in one compact block (about 1,500 tokens). The WhatsApp assistant gets it with every
 * question, so answers like "what services do you offer?" are always complete instead of depending on which
 * entries the search happened to return.
 */
export function businessFacts(): string {
  return [
    `Business: ${B.name}, run by ${B.artist} (${B.title}). Based in ${B.location}. ${B.serviceArea}.`,
    `About: ${B.bio}`,
    `Phone and WhatsApp: ${B.phonePrimaryCountry} ${B.phonePrimary} (main), ${B.phoneSecondaryCountry} ${B.phoneSecondary}. Instagram: ${B.instagramHandle} (${B.instagram}).`,
    `Certification: ${B.certification}. It is awarded with the Pro Makeup & Hair Course.`,
    `Pricing: every booking is quoted individually based on the services, event date, location and number of people. There is no published price list.`,
    `Booking: customers send a booking request; ${B.artist} reviews requests within 24 hours and confirms availability and the quote personally.`,
    '',
    'Services (name, duration, description, what is included, ideal for):',
    ...SERVICES.map(
      (s) => `- ${s.title} (${s.duration}): ${s.description} Includes: ${s.includes.join('; ')}. Ideal for: ${s.recommendedFor}`,
    ),
    `Packages that can also be requested: ${PACKAGE_OPTIONS.join('; ')}.`,
    '',
    'Frequently asked questions:',
    ...FAQ.map((f) => `- ${f.q}\n  ${f.a}`),
  ].join('\n');
}

/** Shown when nothing in the knowledge base matches the question well enough. */
export const FALLBACK_ANSWER =
  `I don't have that detail on hand. Please message Deepika on WhatsApp — ${B.phonePrimaryCountry} ${B.whatsappUrl} ` +
  `or ${B.phoneSecondaryCountry} ${B.whatsappSecondaryUrl} — or call ${B.phonePrimary} / ${B.phoneSecondary}. She replies within 24 hours.`;

/**
 * The services a visitor can pick in the "Schedule Your Consultation" window (the form's dropdown and the email
 * step), and the questions the pre-written email asks for each one (see serviceInquiryEmail in inquiryEmail.ts).
 * Built from both price lists: Deepika's and the senior artist's.
 */
import { bookingName, formatServicePrice, PRICE_TIERS, ServiceItem } from './portfolioData';

export interface BookingService {
  /** Saved with the booking and used in the email subject: bookingName() of the service. */
  value: string;
  /** Shown in the pickers, with the price */
  label: string;
  /** Opening sentence of the email, after the greeting */
  intro: string;
  /** Fill-in lines for this service. Name, phone and "anything else" are added around them for every service. */
  questions: string[];
}

const READY_BY = 'Ready-by time';
const ADDRESS = 'Getting-ready location (full address)';
const EVENT_AND_DATE = 'Event and date';

/** Asked for a look booked from the 3D gallery, which isn't one of the services. */
export const GENERAL_QUESTIONS = [EVENT_AND_DATE, READY_BY, ADDRESS, 'Outfit and colors'];

const BRIDAL_QUESTIONS = [
  'Event (wedding, engagement, Pellikuthuru or another wedding event)',
  'Event date',
  READY_BY,
  ADDRESS,
  'Outfit (saree or lehenga) and colors',
  'Hairstyle you have in mind',
  'Other wedding events you need makeup for',
];

/** Questions (and a custom opening line, if any) by service id; senior artist ids share Deepika's entries. */
const EMAIL: Record<string, { intro?: string; questions: string[] }> = {
  'non-bridal-family-glam': {
    questions: [
      EVENT_AND_DATE,
      "Your role in the celebration (e.g. bride's sister, mother, cousin, bridesmaid, guest)",
      READY_BY,
      ADDRESS,
      'Outfit (saree, lehenga or gown) and colors',
      'Look and hairstyle you have in mind',
    ],
  },
  'groom-makeover': { questions: [EVENT_AND_DATE, READY_BY, ADDRESS, 'Outfit and colors'] },
  'only-makeup': {
    intro: 'I would like to book makeup only.',
    questions: [EVENT_AND_DATE, READY_BY, ADDRESS, 'Outfit and colors', 'Look you have in mind'],
  },
  'only-hair': {
    intro: 'I would like to book hair only.',
    questions: [EVENT_AND_DATE, READY_BY, ADDRESS, 'Hairstyle you have in mind'],
  },
  'only-saree-draping': {
    intro: 'I would like to book saree draping only.',
    questions: [EVENT_AND_DATE, READY_BY, ADDRESS],
  },
};

function emailFor(s: ServiceItem): Pick<BookingService, 'intro' | 'questions'> {
  const name = bookingName(s);
  if (s.category === 'bridal') return { intro: `I would love to book ${name} for my wedding!`, questions: BRIDAL_QUESTIONS };
  const entry = EMAIL[s.id.replace(/^senior-/, '')];
  return { intro: entry?.intro ?? `I would like to book ${name}.`, questions: entry?.questions ?? GENERAL_QUESTIONS };
}

/** The pickers' options, one group per price list ("With Deepika", "With a Senior Artist"). */
export const BOOKING_GROUPS: { label: string; options: BookingService[] }[] = PRICE_TIERS.map((tier) => ({
  label: tier.label,
  options: tier.services.map((s) => ({
    value: bookingName(s),
    label: `${s.title} · ${formatServicePrice(s)}`,
    ...emailFor(s),
  })),
}));

export const BOOKING_SERVICES: BookingService[] = BOOKING_GROUPS.flatMap((g) => g.options);

/** A look booked from the 3D gallery is sent as the service "Look: <title>". */
const LOOK_PREFIX = 'Look: ';
export const lookAsService = (title: string) => `${LOOK_PREFIX}${title}`;
/** The look's title when `service` is a booked look, otherwise null. */
export const lookFromService = (service: string) =>
  service.startsWith(LOOK_PREFIX) ? service.slice(LOOK_PREFIX.length) : null;

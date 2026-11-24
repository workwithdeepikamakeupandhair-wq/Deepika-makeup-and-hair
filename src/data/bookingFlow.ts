/**
 * The WhatsApp booking journey, shared by DMH API and the dashboard.
 *
 * Pooja (the WhatsApp assistant, Deepika's manager) welcomes the customer with the enquiry form. Once it's filled in,
 * the team reviews the enquiry (in the dashboard, or with a tap on WhatsApp). On approval the customer is told who
 * does the makeup, from the event's city (Deepika herself in the Atlanta area, one of her senior artists outside it),
 * and gets that artist's prices. Pooja then asks for the 25% advance. The customer sends a payment screenshot, and
 * the team checks it and approves the booking, which sends the customer their confirmation.
 */

export const BOOKING_STATUSES = [
  { id: 'enquiry_review', label: 'Enquiry to approve' },
  { id: 'not_available', label: 'Not available' },
  { id: 'quoted', label: 'Approved · pricing sent' },
  { id: 'awaiting_payment', label: 'Waiting for advance' },
  { id: 'payment_review', label: 'Payment to verify' },
  { id: 'confirmed', label: 'Confirmed' },
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number]['id'];
export const BOOKING_STATUS_IDS: readonly string[] = BOOKING_STATUSES.map((s) => s.id);
export const bookingStatusLabel = (id: string | null) => BOOKING_STATUSES.find((s) => s.id === id)?.label ?? 'Filling in the enquiry';
/** The stages from the advance request on: the booking has a price, and Deepika's time is held or taken. */
export const PAYMENT_STAGES: readonly BookingStatus[] = ['awaiting_payment', 'payment_review', 'confirmed'];

export type Artist = 'deepika' | 'senior';
export const ARTIST_LABELS: Record<Artist, string> = { deepika: 'Deepika', senior: 'Senior artist' };

/** One line of a booking's quote, priced from the price lists. */
export interface QuoteItem {
  /** Package id, e.g. "airbrush_bridal" */
  package: string;
  /** e.g. "Airbrush Bridal Makeup (Senior Artist)" */
  title: string;
  quantity: number;
  unitPrice: number;
  perPerson: boolean;
}

export interface PaymentProof {
  id: string;
  contentType: string;
  createdAt: string;
}

/** Whether the booking's time is still free on the calendar, ignoring the booking itself. */
export interface SlotCheck {
  status: 'open' | 'taken' | 'fully_booked' | 'no_time';
  /** What else takes that time, e.g. "8:00 AM–10:00 AM · Priya (lead #12)" */
  conflicts: string[];
}

/** The enquiry form's answers (the welcome message lists the questions). */
export interface Enquiry {
  /** "Event Start Time", "18:00" */
  eventStartTime: string | null;
  /** The city or town of the venue, which decides the artist */
  eventCity: string | null;
  bridalCount: number | null;
  groomCount: number | null;
  nonBridalCount: number | null;
  /** "Number of Events / Functions" */
  eventsCount: number | null;
}

/** Everything the dashboard shows about one lead's WhatsApp booking (GET /api/admin/leads/:id/booking). */
export interface BookingDetails {
  status: BookingStatus | null;
  eventType: string | null;
  /** The form's "Makeup Ready Time / Reporting Time", "08:00": the time the booking takes on the calendar */
  eventTime: string | null;
  enquiry: Enquiry;
  enquirySubmittedAt: string | null;
  enquiryReviewedAt: string | null;
  enquiryReviewedByName: string | null;
  /** Who the event's location points to under the current Settings (decided for good when the enquiry is approved) */
  artistForLocation: Artist | null;
  artist: Artist | null;
  /** A phone number other than their WhatsApp one, if they gave it */
  contactPhone: string | null;
  specialRequirements: string | null;
  items: QuoteItem[];
  total: number | null;
  advance: number | null;
  balance: number | null;
  advancePercent: number;
  paymentRequestedAt: string | null;
  paymentSubmittedAt: string | null;
  confirmedAt: string | null;
  confirmedByName: string | null;
  proofs: PaymentProof[];
  slot: SlotCheck;
  /** The customer's latest WhatsApp message. WhatsApp only delivers our messages within 24 hours of it. */
  lastCustomerMessageAt: string | null;
}

/** Settings the team changes in the dashboard (/admin/settings). */
export interface BookingSettings {
  /** Sent to the customer word for word with the advance request, e.g. "Zelle: +1 980-497-7720 (Deepika S)". */
  paymentDetails: string;
  /** How long one booking takes on the calendar, in hours. */
  appointmentHours: number;
  /**
   * Cities, towns and neighbourhoods of the Atlanta service area, where Deepika does the makeup herself. An event whose
   * location names one of them gets Deepika; anywhere else gets one of her senior artists.
   */
  atlantaAreas: string[];
  /**
   * WhatsApp numbers (international, e.g. "+917022908519") that get each new enquiry and each payment screenshot, with
   * the details, and can approve them there with a tap.
   */
  approverWhatsapp: string[];
}

/** Until the team saves its own settings: Atlanta, its neighbourhoods, and the cities and towns of metro Atlanta. */
export const DEFAULT_ATLANTA_AREAS = [
  'Atlanta', 'Buckhead', 'Midtown', 'Sandy Springs', 'Dunwoody', 'Brookhaven', 'Chamblee', 'Doraville', 'Decatur', 'Tucker',
  'Stone Mountain', 'Lithonia', 'Clarkston', 'Norcross', 'Peachtree Corners', 'Duluth', 'Suwanee', 'Lawrenceville', 'Lilburn',
  'Snellville', 'Buford', 'Sugar Hill', 'Johns Creek', 'Alpharetta', 'Milton', 'Roswell', 'Cumming', 'Marietta', 'Smyrna',
  'Vinings', 'Kennesaw', 'Acworth', 'Woodstock', 'Mableton', 'Austell', 'Powder Springs', 'Douglasville', 'East Point',
  'College Park', 'Hapeville', 'Union City', 'Fairburn', 'Forest Park', 'Jonesboro', 'Morrow', 'Riverdale', 'Stockbridge',
  'McDonough', 'Fayetteville', 'Peachtree City', 'Conyers',
];

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  paymentDetails: '',
  appointmentHours: 2,
  atlantaAreas: DEFAULT_ATLANTA_AREAS,
  approverWhatsapp: [],
};

/** Letters only, single spaces, lower case: "  St. Mary's,  GA" → "st mary s ga". */
const placeWords = (s: string) => ` ${s.toLowerCase().normalize('NFKD').replace(/[^a-z]+/g, ' ').trim()} `;

/**
 * Whether a place (a city, venue or address, as the customer wrote it) names somewhere in the Atlanta service area:
 * one of the area's names appears in it as whole words ("Hilton, Alpharetta GA" → Alpharetta).
 */
export function inAtlantaArea(place: string, areas: readonly string[]): boolean {
  const text = placeWords(place);
  return areas.some((area) => {
    const name = placeWords(area);
    return name.trim().length > 0 && text.includes(name);
  });
}

/** A US state other than Georgia, written as its postal code: "Roswell, NM", "Duluth MN 55802". Upper case only. */
const OTHER_STATE = /(?:^|[\s,])(A[LKZR]|C[AOT]|D[EC]|FL|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])(?=$|[\s,.]|\d)/;

/**
 * Who does the makeup for an event here: Deepika herself in the Atlanta service area, one of her senior artists
 * anywhere else. `state` is the US state (or country) the customer gave, if any: anything but Georgia is outside,
 * so "Roswell, NM" isn't Roswell near Atlanta. Null until there's a place to go by.
 */
export function artistForPlace(place: { city: string | null; state?: string | null; location: string | null }, areas: readonly string[]): Artist | null {
  const where = [place.city, place.location].filter(Boolean).join(', ');
  if (!where.trim()) return null;
  const state = place.state?.trim() ?? '';
  if (state && !/^(ga|georgia)$/i.test(state.replace(/[^a-z]/gi, ''))) return 'senior';
  if (OTHER_STATE.test(where)) return 'senior';
  return inAtlantaArea(where, areas) ? 'deepika' : 'senior';
}

/** A time the team marked as taken on one day. */
export interface TimeBlock {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** "08:00" */
  start: string;
  end: string;
  note: string | null;
}

/** A WhatsApp booking with a time, shown on the calendar day it's for. */
export interface CalendarAppointment {
  leadId: string;
  fullName: string;
  service: string;
  /** YYYY-MM-DD */
  date: string;
  start: string;
  end: string;
  status: BookingStatus;
  artist: Artist | null;
}

/** "08:00" → "8:00 AM" */
export function timeLabel(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "$162.50", "$650" */
export const money = (usd: number) => `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`;

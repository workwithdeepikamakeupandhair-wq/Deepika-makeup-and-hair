/**
 * Pre-written inquiry emails. Tapping an "Email" button opens the visitor's own mail app with the address,
 * subject and a fill-in-the-blanks message already in place, so all she has to do is add her details and send.
 */
import { BUSINESS_INFO } from './portfolioData';
import { BOOKING_SERVICES, GENERAL_QUESTIONS, lookFromService } from './bookingServices';

export interface EmailDraft {
  subject: string;
  body: string;
}

/** What we ask every bride for. The labels become the blank lines of the email template. */
export const INQUIRY_FIELDS = [
  'Full name',
  'Phone / WhatsApp number',
  'Wedding date',
  'Other events & dates (Engagement, Sangeet, Mehendi, Reception)',
  'Location (full address of the venue or getting-ready place)',
  'Bridal package (HD $550, Advanced $600 or Airbrush $650)',
  'Number of people getting ready (bride + family / bridesmaids)',
  'Anything else (outfit colors, look inspiration, ready-by time)',
];

/** The blank bridal inquiry: a greeting, one "Label: " line per field, a sign-off. */
export const BRIDAL_INQUIRY: EmailDraft = {
  subject: 'Bridal Inquiry | Deepika Makeup & Hair',
  body: [
    `Hi ${BUSINESS_INFO.artist.split(' ')[0]},`,
    '',
    'I would love to book you for my wedding! Here are my details. Please let me know your availability.',
    '',
    ...INQUIRY_FIELDS.flatMap((label) => [`${label}: `, '']),
    'Thank you!',
  ].join('\n'),
};

/**
 * The email for one service picked in the booking window: a greeting, what she'd like to book, blank lines for
 * her name, phone and that service's questions (see BOOKING_SERVICES), a sign-off.
 */
export function serviceInquiryEmail(service: string): EmailDraft {
  const known = BOOKING_SERVICES.find((s) => s.value === service);
  const look = lookFromService(service);
  const intro =
    known?.intro ??
    (look ? `I love the "${look}" look on your website and would like to book it.` : `I would like to book ${service}.`);
  const fields = ['Full name', 'Phone / WhatsApp number', ...(known?.questions ?? GENERAL_QUESTIONS), 'Anything else / questions'];
  return {
    subject: `${look ? `"${look}" Look` : service} Inquiry | ${BUSINESS_INFO.name}`,
    body: [
      `Hi ${BUSINESS_INFO.artist.split(' ')[0]},`,
      '',
      `${intro} Here are my details. Please let me know your availability.`,
      '',
      ...fields.flatMap((label) => [`${label}: `, '']),
      'Thank you!',
    ].join('\n'),
  };
}

/** Links that open a new email to Deepika: the device's mail app (`mailto`) or a webmail compose screen. */
export function emailLinks({ subject, body }: EmailDraft) {
  const enc = encodeURIComponent;
  const to = enc(BUSINESS_INFO.email);
  return {
    // Mail links should use CRLF line breaks (RFC 6068); some mail apps join lines otherwise.
    mailto: `mailto:${BUSINESS_INFO.email}?subject=${enc(subject)}&body=${enc(body.replace(/\r?\n/g, '\r\n'))}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${enc(subject)}&body=${enc(body)}`,
    outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${enc(subject)}&body=${enc(body)}`,
    yahoo: `https://compose.mail.yahoo.com/?to=${to}&subject=${enc(subject)}&body=${enc(body)}`,
  };
}

/** The whole email as plain text, for pasting into any mail app. */
export function draftAsText({ subject, body }: EmailDraft): string {
  return `To: ${BUSINESS_INFO.email}\nSubject: ${subject}\n\n${body}`;
}

/**
 * Phones and tablets always have a mail app, so a `mailto:` link opens it straight away. Most computers have no
 * mail app set up and the click silently does nothing, so there we offer webmail choices instead.
 */
export function isPhoneOrTablet(): boolean {
  const ua = navigator.userAgent;
  // iPads report a Mac user agent; touch support gives them away
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

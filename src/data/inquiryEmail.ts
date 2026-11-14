/**
 * Pre-written inquiry emails. Tapping an "Email" button opens the visitor's own mail app with the address,
 * subject and a fill-in-the-blanks message already in place, so all she has to do is add her details and send.
 */
import { BUSINESS_INFO } from './portfolioData';

export const INQUIRY_SUBJECT = 'Bridal Inquiry | Deepika Makeup & Hair';

/** What we ask every bride for. The labels become the blank lines of the email template. */
export const INQUIRY_FIELDS = [
  'Full name',
  'Phone / WhatsApp number',
  'Wedding date',
  'Other events & dates (Engagement, Sangeet, Mehendi, Reception)',
  'Location (full address of the venue or getting-ready place)',
  'Services wanted (makeup, hair, saree draping)',
  'Number of people getting ready (bride + family / bridesmaids)',
  'Anything else (outfit colors, look inspiration, ready-by time)',
];

/** The blank template: a greeting, one "Label: " line per field, a sign-off. */
export function inquiryTemplate(): string {
  return [
    `Hi ${BUSINESS_INFO.artist.split(' ')[0]},`,
    '',
    'I would love to book you for my wedding! Here are my details. Please let me know your availability and pricing.',
    '',
    ...INQUIRY_FIELDS.flatMap((label) => [`${label}: `, '']),
    'Thank you!',
  ].join('\n');
}

/** Links that open a new mail to Deepika: `mailto` for the phone's mail app, `gmail` for Gmail in a browser. */
export function emailLinks(subject: string, body: string) {
  const enc = encodeURIComponent;
  // Mail links should use CRLF line breaks (RFC 6068); some mail apps join lines otherwise.
  const mailBody = body.replace(/\r?\n/g, '\r\n');
  return {
    mailto: `mailto:${BUSINESS_INFO.email}?subject=${enc(subject)}&body=${enc(mailBody)}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(BUSINESS_INFO.email)}&su=${enc(subject)}&body=${enc(body)}`,
  };
}

/** The blank bridal inquiry, ready to link to. */
export const BRIDAL_INQUIRY_EMAIL = emailLinks(INQUIRY_SUBJECT, inquiryTemplate());

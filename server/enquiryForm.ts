/**
 * The enquiry form as a WhatsApp form (WhatsApp Flows; Twilio content type `twilio/flows`): Pooja's message has a
 * "Fill in the form" button, the customer fills in the fields and taps Submit, without leaving WhatsApp. The questions
 * are those of the written form (ENQUIRY_FORM in whatsappQuotes.ts), which goes out instead until Meta has approved
 * this one, and on connections without templates (Meta's Cloud API here).
 *
 * The template is created with server/scripts/create-approval-template.ts. The answers come back to the Twilio
 * webhook as JSON (`InteractiveData`); enquiryFormAnswers() turns them into a customer message listing the 9
 * answers, which Pooja saves with save_enquiry like typed answers.
 */

/** In both forms (and in the conversation), so the bot can tell the form was sent. */
export const ENQUIRY_FORM_TITLE = 'EVENT & MAKEUP REQUIREMENTS';

/** The text above the "Fill in the form" button. */
export const FORM_MESSAGE_BODY = `📋 *${ENQUIRY_FORM_TITLE}*

To help us understand your requirements and share an accurate quotation, kindly fill in your event details: tap *Fill in the form* below and press Submit when you're done.

Once you share the details, our team will review your requirements and share the pricing and package details accordingly. ❤️`;

export const FORM_BUTTON = 'Fill in the form';

/** How the WhatsApp form is kept in the conversation (Pooja and the dashboard see this). */
export const FORM_SENT_NOTE = `${FORM_MESSAGE_BODY}\n\n[WhatsApp form with a "${FORM_BUTTON}" button]`;

/** A submitted WhatsApp form starts with this in the conversation. */
export const FORM_SUBMITTED_MARK = '[The customer filled in the enquiry form]';

/** Whether the enquiry form (written or WhatsApp) was sent in these messages. */
export const formSentIn = (messages: { role: string; content: string }[]) => messages.some((m) => m.role === 'assistant' && m.content.includes(ENQUIRY_FORM_TITLE));

interface FormField {
  /** The component's name: the key of its answer in a submission */
  name: string;
  /** Shown above the field (WhatsApp allows 20 characters for text fields) */
  label: string;
  /** Shown under it */
  helper: string;
  kind: 'date' | 'text' | 'number' | 'long';
  page: 'event' | 'makeup';
  /** The question in the written form, for the message Pooja reads */
  question: string;
  /** Recognises this answer's key in a submission, whatever Twilio names it */
  key: RegExp;
}

/**
 * In the order they appear in the WhatsApp form: the only optional one, the requirements, comes last, so the answers
 * given are always the first ones in order.
 */
const FIELDS: FormField[] = [
  { name: 'event_date', label: 'Event date', helper: '', kind: 'date', page: 'event', question: '1. Event Date', key: /date/ },
  { name: 'event_location', label: 'City & venue', helper: 'e.g. Hilton Garden Inn, Alpharetta, GA', kind: 'text', page: 'event', question: '2. Event Location (City & Venue)', key: /venue|location|city/ },
  { name: 'event_start_time', label: 'Event start time', helper: 'e.g. 6:00 PM', kind: 'text', page: 'event', question: '3. Event Start Time', key: /start/ },
  { name: 'ready_time', label: 'Ready / reporting', helper: 'Makeup ready or reporting time, e.g. 4:00 PM', kind: 'text', page: 'event', question: '4. Makeup Ready Time / Reporting Time', key: /ready|report/ },
  { name: 'bridal_count', label: 'Bridal makeup', helper: 'How many brides? 0 if none', kind: 'number', page: 'makeup', question: '5. Bridal Makeup', key: /^(?!.*non ?bridal).*bridal/ },
  { name: 'groom_count', label: 'Groom makeup', helper: 'How many grooms? 0 if none', kind: 'number', page: 'makeup', question: '6. Groom Makeup', key: /groom/ },
  { name: 'non_bridal_count', label: 'Non-bridal makeup', helper: 'How many people? 0 if none', kind: 'number', page: 'makeup', question: '7. Non-Bridal Makeup', key: /non ?bridal/ },
  { name: 'events_count', label: 'Events / functions', helper: 'How many events or functions?', kind: 'number', page: 'makeup', question: '9. Number of Events / Functions', key: /function|events? ?count|number of events/ },
  { name: 'additional_requirements', label: 'Requirements', helper: 'Additional requirements, if any', kind: 'long', page: 'makeup', question: '8. Additional Requirements', key: /require|additional/ },
];

/** The written form's order (1–9), for the message Pooja reads. */
const ASKED = [...FIELDS].sort((a, b) => parseInt(a.question) - parseInt(b.question));

/**
 * The Twilio Content template (`twilio/flows`) for the WhatsApp form: every question on one page that scrolls (the
 * user's choice, 2026-11-25), in two sections, with Submit at the bottom. Every answer is required except the
 * additional requirements.
 */
export function enquiryFormTemplate() {
  const component = (f: FormField) =>
    f.kind === 'date'
      ? { type: 'DATE_PICKER', name: f.name, label: f.label, required: true }
      : f.kind === 'long'
        ? { type: 'LONG_TEXT', name: f.name, label: f.label, text: f.helper, required: false }
        : { type: 'SHORT_TEXT', name: f.name, label: f.label, text: f.helper, required: true, ...(f.kind === 'number' ? { input_type: 'NUMBER' } : {}) };
  const section = (id: FormField['page']) => FIELDS.filter((f) => f.page === id).map(component);
  return {
    friendly_name: 'dmh_enquiry_form_one_page',
    language: 'en',
    types: {
      'twilio/flows': {
        body: FORM_MESSAGE_BODY,
        button_text: FORM_BUTTON,
        subtitle: 'Deepika Makeup and Hair',
        type: 'OTHER',
        pages: [
          {
            id: 'enquiry',
            title: 'Event & makeup details',
            next_page_id: null,
            layout: [
              { type: 'TEXT_SUBHEADING', text: 'Your event' },
              ...section('event'),
              { type: 'TEXT_SUBHEADING', text: 'Makeup requirements' },
              ...section('makeup'),
              { type: 'FOOTER', label: 'Submit' },
            ],
          },
        ],
      },
    },
  };
}

/** Letters and digits only, lower case: "Non-bridal_count" → "non bridal count". */
const plainKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A date picker's answer as YYYY-MM-DD. WhatsApp sends either the date itself or a timestamp of midnight on that day
 * in the customer's time zone; rounding to the nearest UTC midnight gives back the day they picked.
 */
function pickedDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{12,13}$/.test(value)) return new Date(Math.round(Number(value) / 86_400_000) * 86_400_000).toISOString().slice(0, 10);
  return value;
}

/**
 * Keys that describe the form rather than hold an answer: the flow's token, a page's id and title, a field's own name,
 * label, type and helper text (a field's name and label identify its answer, see answersIn).
 */
const NOT_AN_ANSWER = /^(flow token|flow id|screen|version|wa flow response params|id|title|subtitle|type|name|label|text|helper text|required|input type|next page id)$/;
/** Where a field object keeps the customer's answer: {"name": "event_date", "value": "2026-11-28"} */
const VALUE_KEYS = ['value', 'values', 'answer', 'response', 'selected', 'selection', 'input'];

/**
 * Every answer in a submission, in order, as [where it was, what they answered]. Whatever the nesting (pages, lists of
 * fields, objects per page), it's opened up: a plain value is an answer named by its path ("pages.0.event_date"), and
 * an object with a name or label and a value is one answer named by them.
 */
function answersIn(data: unknown, path: string[] = []): [string, string][] {
  if (data === null || data === undefined) return [];
  const last = path.at(-1);
  if (typeof data !== 'object') return last && NOT_AN_ANSWER.test(plainKey(last)) ? [] : [[path.join('.') || 'answer', String(data)]];
  if (Array.isArray(data)) {
    // Several choices of one question
    if (data.every((v) => v === null || typeof v !== 'object')) return data.length ? [[path.join('.') || 'answer', data.join(', ')]] : [];
    return data.flatMap((v, i) => answersIn(v, [...path, String(i)]));
  }
  const fields = data as Record<string, unknown>;
  const valueKey = VALUE_KEYS.find((k) => k in fields && (fields[k] === null || typeof fields[k] !== 'object' || Array.isArray(fields[k])));
  const names = [fields.name, fields.label, fields.id, fields.key].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (valueKey && names.length) {
    const v = fields[valueKey];
    return [[[...path, ...new Set(names)].join('.'), Array.isArray(v) ? v.join(', ') : String(v ?? '')]];
  }
  return Object.entries(fields).flatMap(([k, v]) => answersIn(v, [...path, k]));
}

/** The submission's layout with every value hidden, for the logs: {"pages":[{"event_date":"<10 chars>"}]} */
export function submissionShape(raw: string): string {
  const mask = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(mask) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x)])) : typeof v === 'string' ? `<${v.length} chars>` : typeof v;
  try {
    return JSON.stringify(mask(JSON.parse(raw))).slice(0, 1500);
  } catch {
    return `not JSON (${raw.length} characters)`;
  }
}

/**
 * The customer message for a submitted WhatsApp form: the 9 questions of the written form with their answers, so
 * Pooja saves them like typed answers. `raw` is the submission's JSON (Twilio's `InteractiveData`); null if it isn't
 * JSON. Answers are found by their names; if the names say nothing (e.g. "screen_0_TextInput_1"), by their order. If
 * neither works, the answers are listed as they came, for Pooja to read.
 */
export function enquiryFormAnswers(raw: string): { text: string; keys: string[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const answers = answersIn(data).filter(([, v]) => v.trim() !== '');
  if (!answers.length) return null;
  const found = new Map<FormField, string>();
  const leftover: [string, string][] = [];
  for (const [key, value] of answers) {
    const field = FIELDS.find((f) => !found.has(f) && f.key.test(plainKey(key)));
    if (field) found.set(field, value);
    else leftover.push([key, value]);
  }
  // Names that say nothing: the answers come in the form's order (the optional last one may be missing)
  if (found.size < answers.length / 2 && answers.length >= FIELDS.length - 1 && answers.length <= FIELDS.length) {
    found.clear();
    leftover.length = 0;
    answers.forEach(([, value], i) => found.set(FIELDS[i], value));
  }
  const listed = leftover.map(([k, v]) => `${k}: ${v}`);
  // Hardly anything recognised: the answers as they came, rather than nine empty questions
  if (found.size < 3) {
    return { text: [`${FORM_SUBMITTED_MARK} (its answers, by field)`, ...answers.map(([k, v]) => `${k}: ${pickedDate(v)}`)].join('\n'), keys: answers.map(([k]) => k) };
  }
  const line = (f: FormField) => {
    const value = found.get(f)?.trim();
    if (!value) return `${f.question}: (left empty)`;
    return `${f.question}: ${f.kind === 'date' ? pickedDate(value) : value}`;
  };
  return { text: [FORM_SUBMITTED_MARK, ...ASKED.map(line), ...listed].join('\n'), keys: answers.map(([k]) => k) };
}

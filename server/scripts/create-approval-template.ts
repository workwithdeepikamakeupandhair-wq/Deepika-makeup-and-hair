/**
 * Creates the WhatsApp templates, submits them to Meta for approval through Twilio, and saves their IDs in the
 * `settings` table:
 * - paymentApproval: a payment screenshot with the booking details for the approval numbers (Approve / Not received);
 * - enquiryApproval: a completed enquiry form for the approval numbers (Approve / Not available);
 * - enquiryForm: the enquiry form customers fill in inside WhatsApp (server/enquiryForm.ts).
 * Run once; a template that already exists is not created again:
 *   node node_modules/tsx/dist/cli.mjs server/scripts/create-approval-template.ts                   (create missing ones, show the status)
 *   node node_modules/tsx/dist/cli.mjs server/scripts/create-approval-template.ts --new form        (a new version of the form: it waits as
 *                                                                                                   "enquiryFormNext" and takes over once approved)
 *   node node_modules/tsx/dist/cli.mjs server/scripts/create-approval-template.ts --sid HX… payment (submit one created earlier)
 * Meta usually approves within minutes, at most about a day. Until then, approvals happen in the dashboard and
 * customers get the written form.
 */
import '../env.js';
import { BUSINESS_INFO as B } from '../../src/data/portfolioData.js';
import type { ApprovalTemplateVariables, EnquiryTemplateVariables, WhatsAppTemplates } from '../approvals.js';
import { getDb, pool } from '../db.js';
import { enquiryFormTemplate } from '../enquiryForm.js';
import { getSetting } from '../settings.js';

const accountSid = (process.env.TWILIO_ACCOUNT_SID || process.env.ACCOUNT_SID || '').trim();
const authToken = (process.env.TWILIO_AUTH_TOKEN || process.env.AUTH_TOKEN || '').trim();
if (!accountSid || !authToken) throw new Error('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (or ACCOUNT_SID and AUTH_TOKEN) in .env');
const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
const CONTENT = 'https://content.twilio.com/v1/Content';

async function twilio(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  return data;
}

/** Sample values Meta reviews; the payment one's {{8}} is a real picture on the website (screenshots use the same domain). */
const PAYMENT_SAMPLES: ApprovalTemplateVariables = {
  '1': '105',
  '2': 'Priya Sharma',
  '3': 'Airbrush Bridal Makeup',
  '4': 'Friday, March 12, 2027 at 9:00 AM',
  '5': 'Deepika herself',
  '6': '$650',
  '7': '$162.50',
  '8': 'images/portfolio/svc-bridal.jpg',
};

const ENQUIRY_SAMPLES: EnquiryTemplateVariables = {
  '1': '106',
  '2': 'Anjali Rao',
  '3': 'Wedding: 1 bridal, 3 non-bridal',
  '4': 'Saturday, April 10, 2027',
  '5': 'Hilton Garden Inn, Alpharetta, GA (Atlanta area: Deepika)',
  '6': 'event starts 6:00 PM · makeup ready / reporting 4:00 PM',
  '7': '2',
  '8': 'Hairstyle with fresh flowers',
  '9': '4:00 PM is free',
};

type TemplateKind = Exclude<keyof WhatsAppTemplates, 'enquiryFormNext'>;

const TEMPLATES: Record<TemplateKind, Record<string, unknown>> = {
  paymentApproval: {
    friendly_name: 'dmh_payment_approval',
    language: 'en',
    variables: PAYMENT_SAMPLES,
    types: {
      'twilio/card': {
        title:
          '💳 New advance payment to verify\n\nBooking #{{1}} for {{2}}\nPackage: {{3}}\nDate: {{4}}\nArtist: {{5}}\nTotal: {{6}} · Advance: {{7}}\n\n' +
          'Please check the payment screenshot, then tap Approve to confirm the booking, or Not received to ask the customer to send it again.',
        subtitle: `${B.name} · booking assistant`,
        media: [`${B.website}/{{8}}`],
        actions: [
          { type: 'QUICK_REPLY', title: 'Approve', id: 'approve_{{1}}' },
          { type: 'QUICK_REPLY', title: 'Not received', id: 'reject_{{1}}' },
        ],
      },
    },
  },
  enquiryApproval: {
    friendly_name: 'dmh_enquiry_approval',
    language: 'en',
    variables: ENQUIRY_SAMPLES,
    types: {
      'twilio/card': {
        title:
          '📝 New enquiry to review\n\nEnquiry #{{1}} from {{2}}\nMakeup: {{3}}\nDate: {{4}}\nLocation: {{5}}\nTimes: {{6}}\nEvents: {{7}}\nRequirements: {{8}}\nCalendar: {{9}}\n\n' +
          'Please check the details, then tap Approve to send the customer their artist and prices, or Not available to let them know.',
        subtitle: `${B.name} · booking assistant`,
        actions: [
          { type: 'QUICK_REPLY', title: 'Approve', id: 'enq_approve_{{1}}' },
          { type: 'QUICK_REPLY', title: 'Not available', id: 'enq_reject_{{1}}' },
        ],
      },
    },
  },
  enquiryForm: enquiryFormTemplate(),
};

const KIND_ARG: Record<string, TemplateKind> = { payment: 'paymentApproval', enquiry: 'enquiryApproval', form: 'enquiryForm' };
const argAfter = (flag: string) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);

try {
  const saved = await getSetting<WhatsAppTemplates>('whatsapp_templates');
  // --new <kind>: a new template anyway; --sid HX… <kind>: submit a template that was created but not yet submitted
  const renew = KIND_ARG[argAfter('--new') ?? ''];
  const givenSid = argAfter('--sid');
  const existing = givenSid && /^HX[0-9a-f]{32}$/.test(givenSid) ? { sid: givenSid, kind: KIND_ARG[process.argv[process.argv.indexOf('--sid') + 2] ?? ''] } : null;
  if (givenSid && !existing?.kind) throw new Error('Use --sid HX… payment|enquiry|form');

  for (const kind of Object.keys(TEMPLATES) as TemplateKind[]) {
    let sid = saved[kind];
    const submitExisting = existing?.kind === kind;
    if (!sid || submitExisting || renew === kind) {
      const created = submitExisting ? await twilio('GET', `${CONTENT}/${existing!.sid}`) : await twilio('POST', CONTENT, TEMPLATES[kind]);
      sid = created.sid as string;
      console.log(`${kind}: template ${submitExisting ? 'found' : 'created'}: ${sid}`);
      const approvalUrl = (created.links?.approval_create as string | undefined) ?? `${CONTENT}/${sid}/ApprovalRequests/whatsapp`;
      const approval = await twilio('POST', approvalUrl, { name: `${TEMPLATES[kind].friendly_name}_${Date.now().toString(36)}`, category: 'UTILITY' });
      console.log(`${kind}: submitted to WhatsApp for approval: ${approval.status}`);
      // A new version of the customers' form waits as "enquiryFormNext": the approved one goes on being sent meanwhile
      const key = kind === 'enquiryForm' && saved.enquiryForm && !submitExisting ? 'enquiryFormNext' : kind;
      await getDb().query(
        `INSERT INTO settings (key, value) VALUES ('whatsapp_templates', $1)
         ON CONFLICT (key) DO UPDATE SET value = settings.value || excluded.value, updated_at = now()`,
        [JSON.stringify({ [key]: sid })],
      );
      console.log(`${kind}: saved in settings ("whatsapp_templates") as ${key}${key === 'enquiryFormNext' ? `; ${saved.enquiryForm} is sent until it's approved` : ''}.`);
      if (key === 'enquiryFormNext') sid = saved.enquiryForm;
    }
    const status = await twilio('GET', `${CONTENT}/${sid}/ApprovalRequests`);
    console.log(`${kind}: template ${sid}: WhatsApp status "${status.whatsapp?.status ?? 'unknown'}"${status.whatsapp?.rejection_reason ? ` (${status.whatsapp.rejection_reason})` : ''}`);
  }
  // A new version of the form that Meta has approved replaces the old one for good
  const { enquiryFormNext } = await getSetting<WhatsAppTemplates>('whatsapp_templates');
  if (enquiryFormNext) {
    const status = await twilio('GET', `${CONTENT}/${enquiryFormNext}/ApprovalRequests`);
    const approved = status.whatsapp?.status === 'approved';
    console.log(`enquiryFormNext: template ${enquiryFormNext}: WhatsApp status "${status.whatsapp?.status ?? 'unknown'}"${approved ? ' → now the enquiry form' : ''}`);
    if (approved) {
      await getDb().query(
        `UPDATE settings SET value = (value - 'enquiryFormNext') || jsonb_build_object('enquiryForm', $1::text), updated_at = now() WHERE key = 'whatsapp_templates'`,
        [enquiryFormNext],
      );
    }
  }
} finally {
  await pool?.end();
}

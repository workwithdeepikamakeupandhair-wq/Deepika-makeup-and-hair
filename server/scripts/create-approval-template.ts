/**
 * Creates the WhatsApp template that sends a payment screenshot to the approval numbers (server/approvals.ts), submits
 * it to Meta for approval through Twilio, and saves its ID in the `settings` table. Run once:
 *   node node_modules/tsx/dist/cli.mjs server/scripts/create-approval-template.ts          (create, or show the status)
 *   node node_modules/tsx/dist/cli.mjs server/scripts/create-approval-template.ts --new    (create a new one anyway)
 * Meta usually approves within minutes, at most about a day. Until then, approvals happen in the dashboard.
 */
import '../env.js';
import { BUSINESS_INFO as B } from '../../src/data/portfolioData.js';
import type { ApprovalTemplateVariables, WhatsAppTemplates } from '../approvals.js';
import { getDb, pool } from '../db.js';
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

/** Sample values Meta reviews; {{8}} is a real picture on the website (payment screenshots use the same domain). */
const SAMPLES: ApprovalTemplateVariables = {
  '1': '105',
  '2': 'Priya Sharma',
  '3': 'Airbrush Bridal Makeup',
  '4': 'Friday, March 12, 2027 at 9:00 AM',
  '5': 'Deepika herself',
  '6': '$650',
  '7': '$162.50',
  '8': 'images/portfolio/svc-bridal.jpg',
};

const TEMPLATE = {
  friendly_name: 'dmh_payment_approval',
  language: 'en',
  variables: SAMPLES,
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
};

try {
  const saved = await getSetting<WhatsAppTemplates>('whatsapp_templates');
  let sid = saved.paymentApproval;
  // --sid HX…: submit a template that was created but not yet submitted (e.g. after a failed run)
  const given = process.argv[process.argv.indexOf('--sid') + 1];
  const existing = process.argv.includes('--sid') && /^HX[0-9a-f]{32}$/.test(given ?? '') ? given : null;
  if (!sid || existing || process.argv.includes('--new')) {
    const created = existing ? await twilio('GET', `${CONTENT}/${existing}`) : await twilio('POST', CONTENT, TEMPLATE);
    sid = created.sid as string;
    console.log(`Template ${existing ? 'found' : 'created'}: ${sid}`);
    const approvalUrl = (created.links?.approval_create as string | undefined) ?? `${CONTENT}/${sid}/ApprovalRequests/whatsapp`;
    const approval = await twilio('POST', approvalUrl, { name: `dmh_payment_approval_${Date.now().toString(36)}`, category: 'UTILITY' });
    console.log(`Submitted to WhatsApp for approval: ${approval.status}`);
    await getDb().query(
      `INSERT INTO settings (key, value) VALUES ('whatsapp_templates', $1)
       ON CONFLICT (key) DO UPDATE SET value = settings.value || excluded.value, updated_at = now()`,
      [JSON.stringify({ paymentApproval: sid })],
    );
    console.log('Saved in settings ("whatsapp_templates").');
  }
  const status = await twilio('GET', `${CONTENT}/${sid}/ApprovalRequests`);
  console.log(`Template ${sid}: WhatsApp status "${status.whatsapp?.status ?? 'unknown'}"${status.whatsapp?.rejection_reason ? ` (${status.whatsapp.rejection_reason})` : ''}`);
} finally {
  await pool?.end();
}

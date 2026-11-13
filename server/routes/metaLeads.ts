/**
 * Meta Lead Ads webhook (/api/meta/webhook): when someone fills in an instant form on a Facebook or Instagram ad,
 * Meta sends the lead ID here; DMH API then fetches the answers (name, phone, email, custom questions) plus the
 * campaign and ad names, and saves the lead to the `bookings` table with channel 'lead_form'.
 *
 * Setup (see README → "Leads from Meta ads"): subscribe the app to the Page's `leadgen` field and set
 * META_PAGE_ACCESS_TOKEN (a Page token with leads_retrieval). Without the token, the lead is still saved with its
 * lead ID so nothing is lost, and the details can be looked up in Meta's Leads Center.
 */
import express, { Router } from 'express';
import { SERVICE_NOT_SPECIFIED } from '../../src/data/leads';
import { getDb, pool } from '../db';
import { BOOKABLE_SERVICES } from '../knowledge';
import { answerVerification, validSignature } from '../meta';

const LOG = '[meta-leads]';

const config = {
  pageToken: process.env.META_PAGE_ACCESS_TOKEN?.trim(),
  // The same Meta app as the WhatsApp bot, so its secret and verify token are reused unless set separately
  appSecret: process.env.META_APP_SECRET?.trim() || process.env.WHATSAPP_APP_SECRET?.trim(),
  verifyToken: process.env.META_VERIFY_TOKEN?.trim() || process.env.WHATSAPP_VERIFY_TOKEN?.trim(),
  graphVersion: process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v25.0',
  // Only changed by the automated test, which points it at a local mock of the Graph API
  graphUrl: process.env.META_GRAPH_URL?.trim() || process.env.WHATSAPP_GRAPH_URL?.trim() || 'https://graph.facebook.com',
};

export const metaLeadsStatus = !config.appSecret
  ? 'not_configured'
  : config.pageToken
    ? 'enabled'
    : 'no_page_token';

interface LeadgenChange {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  created_time?: number;
}

interface LeadDetails {
  field_data?: { name: string; values?: string[] }[];
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
}

async function fetchLead(leadgenId: string): Promise<LeadDetails> {
  const fields = 'created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform,is_organic';
  const res = await fetch(`${config.graphUrl}/${config.graphVersion}/${encodeURIComponent(leadgenId)}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${config.pageToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const pretty = (name: string) => name.replace(/[_?]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Turns an instant form's answers into lead columns; anything unrecognised goes into the notes. */
function mapAnswers(fieldData: LeadDetails['field_data'] = []) {
  const answers = fieldData.map((f) => ({ name: f.name.toLowerCase(), label: pretty(f.name), value: (f.values ?? []).join(', ').trim() }));
  const take = (test: (n: string) => boolean) => {
    const i = answers.findIndex((a) => a.value && test(a.name));
    return i === -1 ? undefined : answers.splice(i, 1)[0].value;
  };
  const fullName =
    take((n) => n === 'full_name' || n === 'name') ??
    [take((n) => n === 'first_name'), take((n) => n === 'last_name')].filter(Boolean).join(' ');
  const phone = take((n) => n.includes('phone'));
  const email = take((n) => n === 'email' || n.includes('email'));
  const serviceAnswer = take((n) => n.includes('service') || n.includes('makeup') || n.includes('package'));
  const dateAnswer = take((n) => n.includes('date') || n.includes('when'));
  const location = take((n) => n === 'city' || n.includes('location') || n.includes('venue') || n.includes('city'));
  const people = take((n) => n.includes('people') || n.includes('guests') || n.includes('party') || n.includes('how_many'));

  const service =
    (serviceAnswer && BOOKABLE_SERVICES.find((s) => s.toLowerCase() === serviceAnswer.toLowerCase())) ??
    (serviceAnswer && BOOKABLE_SERVICES.find((s) => serviceAnswer.toLowerCase().includes(s.toLowerCase().split(' ')[0]))) ??
    serviceAnswer ??
    SERVICE_NOT_SPECIFIED;
  let eventDate: string | null = null;
  if (dateAnswer) {
    const iso = dateAnswer.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    const d = new Date(dateAnswer);
    // Local date parts: toISOString() would shift "March 14, 2027" to the 13th east of UTC
    const pad = (n: number) => String(n).padStart(2, '0');
    eventDate = iso ?? (Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  const notes = [
    serviceAnswer && service !== serviceAnswer ? `Service answer: ${serviceAnswer}` : null,
    dateAnswer && !eventDate ? `Event date: ${dateAnswer}` : null,
    ...answers.filter((a) => a.value).map((a) => `${a.label}: ${a.value}`),
  ].filter(Boolean);
  return { fullName: fullName || 'Ad lead', phone: phone ?? '', email: email ?? null, service, eventDate, location: location ?? null, people: people ?? null, notes };
}

async function saveLead(change: LeadgenChange) {
  const leadgenId = change.leadgen_id;
  if (!leadgenId || !pool) return;
  const externalId = `meta:${leadgenId}`;
  const db = getDb();
  const exists = await db.query('SELECT 1 FROM bookings WHERE external_id = $1', [externalId]);
  if (exists.rowCount) return; // Meta retried a webhook we already handled

  let details: LeadDetails | null = null;
  let problem = '';
  if (config.pageToken) {
    try {
      details = await fetchLead(leadgenId);
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} could not fetch lead ${leadgenId}:`, problem);
    }
  } else {
    problem = 'META_PAGE_ACCESS_TOKEN is not set';
  }

  const a = mapAnswers(details?.field_data);
  const source = details?.platform === 'ig' ? 'instagram_ad' : 'facebook_ad';
  const notes = details
    ? [...a.notes, details.is_organic ? 'Came from an organic post, not a paid ad.' : null].filter(Boolean).join('\n')
    : `Meta lead ID ${leadgenId} (form ${change.form_id ?? '?'}, ad ${change.ad_id ?? '?'}). Details could not be loaded (${problem}); see Meta Business Suite → Leads Center.`;

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookings (full_name, phone, email, service, event_date, event_location, party_size, notes,
                           source, channel, campaign, ad_name, external_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'lead_form', $10, $11, $12)
     ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      details ? a.fullName : 'Meta ad lead (details pending)',
      a.phone,
      a.email,
      a.service,
      a.eventDate,
      a.location,
      a.people,
      notes || null,
      source,
      details?.campaign_name ?? null,
      details?.ad_name ?? (change.ad_id ? `Ad ${change.ad_id}` : null),
      externalId,
    ],
  );
  if (rows[0]) console.log(`${LOG} new ${source === 'instagram_ad' ? 'Instagram' : 'Facebook'} lead #${rows[0].id}${details?.campaign_name ? ` from "${details.campaign_name}"` : ''}`);
}

interface PageWebhook {
  object?: string;
  entry?: { changes?: { field?: string; value?: LeadgenChange }[] }[];
}

export const metaLeadsRouter = Router();

metaLeadsRouter.get('/webhook', (req, res) => {
  if (answerVerification(req, res, config.verifyToken)) console.log(`${LOG} webhook verified by Meta`);
});

metaLeadsRouter.post('/webhook', express.raw({ type: () => true, limit: '1mb' }), (req, res) => {
  if (!config.appSecret) return res.sendStatus(503);
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!validSignature(raw, req.header('x-hub-signature-256'), config.appSecret)) {
    console.warn(`${LOG} rejected a webhook with a missing or wrong signature`);
    return res.sendStatus(401);
  }
  let body: PageWebhook;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  res.sendStatus(200);
  if (body.object !== 'page') return;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === 'leadgen' && change.value) {
        saveLead(change.value).catch((err) => console.error(`${LOG} could not save lead:`, err instanceof Error ? err.message : err));
      }
    }
  }
});

import { Router } from 'express';
import { getDb } from '../db';
import { asyncHandler, cleanString, HttpError, rateLimit } from '../http';
import { cleanAttribution, sourceFromAttribution } from '../leads';

export const bookingsRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

bookingsRouter.post(
  '/',
  rateLimit({ windowMs: 10 * 60_000, max: 5 }),
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};

    const fullName = cleanString(body.fullName, 'Name', 120);
    const phone = cleanString(body.phone, 'Phone', 40);
    const email = cleanString(body.email, 'Email', 200);
    const service = cleanString(body.service, 'Service', 200);
    const eventDate = cleanString(body.eventDate, 'Event date', 10);
    const eventLocation = cleanString(body.eventLocation, 'Event location', 200);
    const partySize = cleanString(body.partySize, 'Party size', 100);
    const notes = cleanString(body.notes, 'Notes', 2000);

    if (!fullName) throw new HttpError(400, 'Name is required.');
    if (!phone) throw new HttpError(400, 'Phone number is required.');
    if (!service) throw new HttpError(400, 'Please choose a service.');
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Email address looks invalid.');
    if (eventDate && (!DATE_RE.test(eventDate) || Number.isNaN(Date.parse(eventDate)))) {
      throw new HttpError(400, 'Event date must be a valid date.');
    }

    // Visitors who arrived from an ad link carry its tracking parameters (saved by src/attribution.ts)
    const attribution = cleanAttribution(body.attribution);
    const source = sourceFromAttribution(attribution);

    const { rows } = await getDb().query<{ id: string; created_at: Date }>(
      `INSERT INTO bookings
         (full_name, phone, email, service, event_date, event_location, party_size, notes, source, channel, campaign, ad_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'website_form', $10, $11)
       RETURNING id, created_at`,
      [fullName, phone, email, service, eventDate, eventLocation, partySize, notes, source,
        attribution.utm_campaign ?? null, attribution.utm_content ?? null],
    );

    console.log(`[bookings] new request #${rows[0].id} for "${service}" (source: ${source})`);
    res.status(201).json({ id: rows[0].id, createdAt: rows[0].created_at });
  }),
);

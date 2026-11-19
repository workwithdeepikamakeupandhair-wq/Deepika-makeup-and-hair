-- Run with: npm run db:setup   (safe to run more than once)

CREATE EXTENSION IF NOT EXISTS vector;

-- Booking / consultation requests from the website form and the WhatsApp assistant.
CREATE TABLE IF NOT EXISTS bookings (
  id             bigserial PRIMARY KEY,
  full_name      text        NOT NULL,
  phone          text        NOT NULL,
  email          text,
  service        text        NOT NULL,
  event_date     date,
  event_location text,
  party_size     text,
  notes          text,
  status         text        NOT NULL DEFAULT 'new',
  source         text        NOT NULL DEFAULT 'website',  -- 'website' or 'whatsapp'
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Databases created before the WhatsApp assistant existed get the column here.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'website';

-- Team accounts for the leads dashboard (/admin). Create one with: npm run admin:create
CREATE TABLE IF NOT EXISTS admin_users (
  id            bigserial PRIMARY KEY,
  email         text        NOT NULL UNIQUE,   -- stored in lower case
  name          text        NOT NULL,
  password_hash text        NOT NULL,          -- scrypt
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Every booking request is also a lead. `status` holds the lead stage (new, contacted, consultation_booked,
-- trial_booked, converted, lost). These columns track where it came from and who is handling it.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS channel     text;         -- website_form, whatsapp, lead_form
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS campaign    text;         -- ad campaign name or ad headline
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ad_name     text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_id text;         -- e.g. Meta lead ID, to avoid duplicates
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_to bigint REFERENCES admin_users (id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS bookings_external_id_idx ON bookings (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);
CREATE INDEX IF NOT EXISTS bookings_phone_idx ON bookings (phone);

CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_event_date_idx ON bookings (event_date) WHERE event_date IS NOT NULL;

-- Deepika's availability calendar, marked in the dashboard (/admin/calendar) and read by the WhatsApp assistant.
-- One row per marked day; a day without a row is open.
CREATE TABLE IF NOT EXISTS availability (
  day        date        PRIMARY KEY,
  status     text        NOT NULL CHECK (status IN ('available', 'limited', 'booked')),  -- Free / Few slots left / Fully booked
  note       text,                                    -- private team note, never shown to customers
  updated_by bigint      REFERENCES admin_users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bookings made with the WhatsApp assistant (Pooja): she collects the details, the customer pays the 25% advance and
-- sends a screenshot, and the team approves the booking in the dashboard. A lead without booking_status is still
-- collecting details (or is a plain enquiry).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_type           text;           -- e.g. "Wedding", "Engagement"
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_time           time;           -- when the makeup starts
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_zip            text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS artist               text CHECK (artist IN ('deepika', 'senior'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quote_items          jsonb;          -- [{package, title, quantity, unitPrice, perPerson}]
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_price          numeric(10, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_amount       numeric(10, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_status       text CHECK (booking_status IN ('awaiting_payment', 'payment_review', 'confirmed'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_requested_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_at         timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_by         bigint REFERENCES admin_users (id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contact_phone        text;           -- if not the WhatsApp number
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS special_requirements text;

CREATE INDEX IF NOT EXISTS bookings_booking_status_idx ON bookings (booking_status) WHERE booking_status IS NOT NULL;

-- Payment screenshots (or PDF receipts) customers send on WhatsApp, for the team to check before approving.
CREATE TABLE IF NOT EXISTS payment_proofs (
  id           bigserial   PRIMARY KEY,
  booking_id   bigint      NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  content_type text        NOT NULL,
  data         bytea       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_proofs_booking_idx ON payment_proofs (booking_id);

-- Times the team marks as taken on a day (bookings made elsewhere, personal time). Approved WhatsApp bookings take
-- their time on their own, from bookings.event_time.
CREATE TABLE IF NOT EXISTS calendar_blocks (
  id         bigserial   PRIMARY KEY,
  day        date        NOT NULL,
  start_time time        NOT NULL,
  end_time   time        NOT NULL CHECK (end_time > start_time),
  note       text,                                    -- private team note
  created_by bigint      REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_blocks_day_idx ON calendar_blocks (day);

-- Settings the team changes in the dashboard (/admin/settings), e.g. the payment details the assistant sends.
CREATE TABLE IF NOT EXISTS settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_by bigint      REFERENCES admin_users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The WhatsApp assistant's conversations, so it remembers each chat however many server instances answer it (on
-- Vercel every message can reach a fresh instance with empty memory). One row per message, oldest first by turn_at.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id         bigserial   PRIMARY KEY,
  wa_id      text        NOT NULL,      -- the customer's WhatsApp number, digits only
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),  -- customer / assistant (or Deepika)
  content    text        NOT NULL,
  message_id text,                      -- the WhatsApp/Twilio message ID, so a redelivered message is answered once
  -- Its place in the conversation. NULL: a customer message still waiting for a reply; it gets the time of the
  -- reply that answers it, so messages that arrive while a reply is being written come after that reply.
  turn_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_message_id_idx ON whatsapp_messages (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_messages_chat_idx ON whatsapp_messages (wa_id, turn_at);

-- One row per WhatsApp customer: what the assistant needs to know about the chat besides its messages.
CREATE TABLE IF NOT EXISTS whatsapp_chats (
  wa_id           text        PRIMARY KEY,
  profile_name    text,                 -- their WhatsApp profile name
  ad_source       text,                 -- 'instagram_ad' / 'facebook_ad' when the chat started from an ad
  paused_until    timestamptz,          -- coexistence: Deepika is handling the chat, the assistant stays quiet
  last_media_ack  timestamptz,          -- photos and voice notes are acknowledged at most every 30 minutes
  replying_until  timestamptz,          -- a server instance is writing a reply (expires on its own if it crashed)
  replying_token  text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- How to message the customer later (e.g. the booking confirmation sent when the team approves a booking): the
-- connection their chat came in on, and for Twilio the business number they wrote to.
ALTER TABLE whatsapp_chats ADD COLUMN IF NOT EXISTS transport       text;   -- 'meta' or 'twilio'
ALTER TABLE whatsapp_chats ADD COLUMN IF NOT EXISTS business_number text;   -- e.g. '+19389464851'
-- Whose prices the last quotation showed ('deepika' or 'senior'), so the advance is asked for only after the
-- customer has seen the prices for the artist who will actually do their makeup.
ALTER TABLE whatsapp_chats ADD COLUMN IF NOT EXISTS quoted_artist   text;

-- Knowledge base for the RAG assistant (filled by: npm run db:ingest).
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id         text        PRIMARY KEY,
  source     text        NOT NULL,          -- e.g. 'service', 'look', 'faq'
  title      text        NOT NULL,
  content    text        NOT NULL,
  embedding  vector(384) NOT NULL,          -- all-MiniLM-L6-v2 output size
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

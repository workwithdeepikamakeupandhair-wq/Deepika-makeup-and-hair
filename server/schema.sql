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

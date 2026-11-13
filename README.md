# Deepika Makeup & Hair — Website

React + Vite frontend with an Express backend on **Neon Postgres + pgvector**, plus an AI chat assistant.
Secrets (server-side only, in `.env`): the Neon connection string and, optionally, an OpenAI API key.

## What the backend does

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | DMH API status: service name, database, chat mode and WhatsApp bot status |
| `POST /api/bookings` | Saves "Submit Booking Request" form entries to the `bookings` table |
| `POST /api/chat` `{ "messages": [{ "role": "user", "content": "..." }] }` | RAG chat used by the website's chat widget. Streams the reply as plain text |
| `GET/POST /api/whatsapp/webhook` | WhatsApp Cloud API webhook: the same assistant answering on WhatsApp (see [WhatsApp bot](#whatsapp-bot)) |
| `GET/POST /api/meta/webhook` | Meta Lead Ads webhook: instant-form leads from Instagram/Facebook ads |
| `/api/admin/*` | Leads dashboard API: login, leads list, stage/owner/notes updates (see [Leads dashboard](#leads-dashboard-admin)) |

### How the chat works (RAG)

1. The visitor's question is embedded **locally** (`all-MiniLM-L6-v2`, free, no API).
2. pgvector in Neon finds the closest knowledge entries (website content + Instagram captions).
3. With `OPENAI_API_KEY` set, OpenAI (`OPENAI_MODEL`, default `gpt-5.4-mini`) writes a short answer
   **only from those entries**. It's told never to invent prices, dates or availability.
   Without a key, or if OpenAI is unreachable, the chat returns the best matching entry instead.

Only the question, recent chat turns and the matched entries are sent to OpenAI. The API key never reaches the browser.
Each reply is capped at 1,500 output tokens, and each visitor can send up to 20 messages per minute.

## Setup

Prerequisite: Node.js 20.11 or newer.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` to your Neon connection string and
   `OPENAI_API_KEY` to your OpenAI key (from https://platform.openai.com/api-keys).
3. Create the tables and enable pgvector: `npm run db:setup`
4. (Optional) Add Instagram content: unzip the Instagram data export (JSON) into
   `data/instagram/` — step-by-step instructions are in [data/instagram/README.md](data/instagram/README.md).
5. Build the knowledge base: `npm run db:ingest`
   (the first run downloads the ~25 MB embedding model). Re-run this whenever you change
   `src/data/portfolioData.ts`, the FAQ in `server/knowledge.ts`, or download a newer Instagram export.

## Knowledge base (RAG) sources

| Source | Where | What is used |
|---|---|---|
| Website | `src/data/portfolioData.ts`, `server/knowledge.ts` | Services, looks, reviews, FAQs |
| Instagram | `data/instagram/` (official data export) | Post and reel captions, profile bio. Hashtags help matching but are hidden from answers. Email, phone and other private export data are never read. |

All entries are embedded locally and stored in the `knowledge_chunks` table in Neon (pgvector).

## Development

The backend is **DMH API** (`server/`, its own package `dmh-api`). Run these in two terminals:

```
# Terminal 1 — DMH API on http://localhost:4000
cd server
pnpm dev

# Terminal 2 — website on http://localhost:3000 (proxies /api to DMH API)
pnpm dev
```

`pnpm dev:server` from the project root also starts DMH API. `npm run …` works the same as `pnpm …`.

> The project folder name contains `&`. On Windows, `cmd.exe` treats `&` as a command separator,
> which breaks the `node_modules/.bin/*.cmd` launchers. That's why every script calls
> `node node_modules/…` directly; keep it that way when adding scripts.

## Production

```
npm run build        # builds the website into dist/
npm start            # one server: website + DMH API on PORT (default 4000)
```

Deploy to any Node host (Render, Railway, Fly.io, a VPS). Set `DATABASE_URL` (and optionally `PORT`) as environment variables.

### Vercel

The website and the API are **two Vercel projects** made from the same GitHub repo:

| Project | Root Directory | Application Preset | Environment variables |
|---|---|---|---|
| Website | `./` | Vite | none |
| DMH API | `server` | Other | `DATABASE_URL`, `OPENAI_API_KEY`, optionally `SESSION_SECRET` and the WhatsApp/Meta values ("Import .env") |

- **API project:** runs `server/api/index.ts` (the same app as `server/app.ts`) as one Vercel Function, configured by
  `server/vercel.json`. It installs the dependencies listed in `server/package.json`, and imports a few shared files
  from `src/data/`. Keep "Include files outside the root directory" switched on in its settings (the default).
- **Website project:** serves `dist/`. The root `vercel.json` forwards every `/api/*` request to the API project's
  address, so the browser only ever talks to the website's domain. Login cookies stay first-party, and no CORS is
  needed. Vercel passes the visitor's IP along, so the per-visitor rate limits still work (`/api/health` shows it as
  `yourIp`).
- **Moving the API (e.g. to Render):** change the address in that one rewrite.
- **Changing environment variables:** redeploy the API project afterwards.

Things that differ from a normal server:

- **Slower first chat answer:** each new function instance downloads the search model (~90 MB) to `/tmp`. The first
  chat answer after a quiet spell can take a few seconds longer.
- **Shorter WhatsApp memory:** the bot's chat memory lasts only while an instance stays warm, so after a quiet spell a
  conversation starts fresh. Booking requests are always saved to the database. A normal server (Render) keeps the
  memory.
- **Smaller install:** `.npmrc` stops onnxruntime from downloading ~500 MB of GPU libraries on Linux; the model runs on
  the CPU.
- **Rules for server code:** relative imports in `server/` end in `.js`, because Vercel runs these files as plain ES
  modules. Webhook work that continues after the response goes through `inBackground()` (`server/background.ts`).
- **Don't install inside `server/`:** locally, don't run `npm install` there. The server uses the project root's
  `node_modules`, and a second copy would take ~600 MB.

## WhatsApp bot

Deepika's virtual assistant also answers customers on WhatsApp (`server/routes/whatsapp.ts`, prompt in `server/llm.ts`).

**Its own number (default).** The assistant has its own WhatsApp number, separate from Deepika's, and nobody reads those
chats. So for anything personal it gives Deepika's own WhatsApp links and phone, and when a customer asks for her, it
saves them as a lead in the dashboard so she can contact them. The other way to run it is **coexistence**
(`WHATSAPP_COEXISTENCE=true`), where the bot answers on Deepika's own number and she reads and replies in the same chats.
See [Going live with coexistence](#going-live-with-coexistence).

**Answers.** Every question is sent with the full business facts: all services with durations and what's included,
location and service area, contact numbers, certification, pricing policy and the FAQ (`businessFacts()` in
`server/knowledge.ts`). It also gets the closest knowledge-base entries (looks, Instagram captions, reviews). It never
invents prices, availability, policies, addresses or products. For anything it doesn't know (trial sessions, deposits,
studio address, brands…), it offers to pass the question to Deepika and gives her direct WhatsApp. With coexistence it
says she'll reply in the chat. It replies in the customer's language and declines off-topic requests.

**Booking requests.** The assistant collects the name, service, date, location and number of people, sends a summary, and
saves the request **only after the customer confirms**. Requests go into the same `bookings` table as the website form,
with `source = 'whatsapp'` and the customer's WhatsApp number as `phone`. The customer gets a request number. It's never
called a confirmed booking, because Deepika confirms availability and the quote herself. If the customer corrects a
detail within a day, the same request is updated.

**Each incoming message:**

- **Text, and taps on buttons:** answered after a 1.5-second pause, so several quick messages ("hi", "price for
  bridal?") get one reply. The customer sees blue ticks and "typing…" while it works. The first reply of a conversation
  carries three buttons: *Book appointment*, *Our services* and *Talk to Deepika*.
- **Talk to Deepika:** the button, or asking for her in words, hands the customer over.
  - *Own number:* they're saved as a lead in the dashboard (channel WhatsApp). The lead's "What they told us" holds the
    reason and their recent messages, and asking again adds to the same lead. They also get Deepika's own WhatsApp and
    phone, and the bot keeps answering if they ask more.
  - *Coexistence:* the bot says Deepika will reply here and stays quiet in that chat for
    `WHATSAPP_HUMAN_TAKEOVER_HOURS` (default 12).
- **Photos, videos, files and voice notes:** a short reply, at most every 30 minutes per chat. The bot can't see them,
  so it asks for them to be sent to Deepika's own WhatsApp; with coexistence it says she'll look at them. Voice notes
  also get a request to type the question. Stickers and reactions are ignored.
- **Old messages:** anything more than 10 minutes old (e.g. redelivered after downtime) is left for Deepika.
- **Coexistence (Deepika's real number):** when she replies to a customer from the WhatsApp Business app, the bot stays
  quiet in that chat for `WHATSAPP_HUMAN_TAKEOVER_HOURS`.
- **Safety:** every webhook's signature is checked with the App secret and duplicates are ignored. Each customer gets at
  most 15 bot replies per 10 minutes. Logs show only the last 4 digits of phone numbers.

Chat history (last 20 messages) and pauses are kept in memory, so a restart only forgets recent context. With
`gpt-5.4-mini`, WhatsApp replies run with `reasoning_effort: none`, because OpenAI's Chat Completions API doesn't allow
function tools together with reasoning on that model. `OPENAI_TOOLS_REASONING_EFFORT` overrides this for other models.

### Testing with Meta's test number

1. **Recipient:** in the App Dashboard, go to WhatsApp → API Setup → "Send a message from your test number". Add your own
   phone under Recipient and verify it. The test number only talks to up to 5 verified recipients.
2. **Settings:** copy the access token and the Phone number ID into `.env`, along with the App secret (App settings →
   Basic) and a verify token you make up. All four are listed in `.env.example`. Restart DMH API. The startup log should
   say `whatsapp: bot on`.
3. **Public address:** Meta needs a public HTTPS address for the webhook. While testing, run a tunnel to port 4000,
   e.g. `ngrok http 4000` or `cloudflared tunnel --url http://localhost:4000`.
4. **Webhook:** in WhatsApp → Configuration → Webhook, set:
   - Callback URL: `https://<your-tunnel>/api/whatsapp/webhook`
   - Verify token: the same phrase as `WHATSAPP_VERIFY_TOKEN`

   Click "Verify and save", then subscribe to the **messages** field.
5. **Try it:** send a WhatsApp message from your phone to the test number. The bot answers.

The "Generate token" token expires after about an hour. For anything longer, use a System User token (Meta Business
Settings → System users) with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.

### Going live on the bot's own number

1. **Get a number** that isn't on WhatsApp yet (or delete its WhatsApp account first) and can receive an SMS or call.
2. **Add it:** App Dashboard → WhatsApp → API Setup → "Add phone number" (or WhatsApp Manager → Phone numbers). Pick a
   display name, which Meta reviews, and verify the code.
3. **Register it** for the Cloud API with a 6-digit PIN that you choose (two-step verification):
   `POST /{phone-number-id}/register` with `{"messaging_product":"whatsapp","pin":"123456"}`.
4. **Permanent token:** create a System User token, and give that system user access to the WhatsApp account.
5. **Settings:** put the new number's Phone number ID and the token in the API's environment variables
   (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`), then redeploy or restart.
6. **Webhook:** point the webhook (WhatsApp → Configuration) at the API's public address,
   `https://<api-address>/api/whatsapp/webhook`, subscribed to **messages**. If the number belongs to a different
   WhatsApp Business Account than the test number, also subscribe the app to that account
   (`POST /{waba-id}/subscribed_apps`).
7. **Payment:** Meta may ask for a payment method on the account. Replies to a customer within 24 hours of their message
   are free.

Click-to-WhatsApp ads that point at the bot's number become leads in the dashboard automatically, with the ad's headline.

### Going live with coexistence

Coexistence keeps Deepika's number working in the WhatsApp Business app on her phone while the bot answers through the
Cloud API. Requirements:

- The number must be on the **WhatsApp Business app** (version 2.24.17 or newer), not personal WhatsApp.
- Onboarding goes through Meta's **Embedded Signup** with the "connect your existing WhatsApp Business app" option. Meta
  only offers this to **Tech Providers / Solution Partners**. Either become a Tech Provider (App Dashboard → "Become a
  Partner"; needs business verification) or onboard through a provider that supports coexistence.
- After onboarding, subscribe the webhook to **smb_message_echoes** as well as **messages**, so the bot knows when Deepika
  replies herself. Then put the real number's Phone number ID and a permanent token in `.env`, and set
  `WHATSAPP_COEXISTENCE=true` so the bot says Deepika will reply in the chat instead of sending her links.
- Deepika should open the WhatsApp Business app at least every ~2 weeks; long inactivity disconnects coexistence.
- Messages she sends from the app stay free. Bot replies inside the 24-hour customer service window are free-form
  service messages.

## Leads dashboard (/admin)

"Login" at the end of the menu opens `/admin`, the team's leads dashboard. Every enquiry lands there, newest first:

| Source | How it arrives | Channel |
|---|---|---|
| Instagram / Facebook **instant-form ads** | Meta Lead Ads webhook → `/api/meta/webhook` (answers, campaign and ad name fetched from Meta) | Instant form |
| **Click-to-WhatsApp ads** | The first WhatsApp message carries the ad (headline, ad ID). The chat becomes a lead right away | WhatsApp chat |
| **Website booking form** | `/api/bookings`. If the visitor arrived from an ad link, the ad platform and `utm_campaign` are recorded | Website form |
| **WhatsApp assistant** bookings | Saved by the bot after the customer confirms. Updates the ad lead if the chat came from an ad | WhatsApp chat |

The dashboard lets you:

- **Filter:** by stage (New, Contacted, Consultation Booked, Trial Booked, Converted, Lost, each with a count) and by source, or search by name, phone, email, campaign or place.
- **Edit in the list:** change the stage and the assigned team member.
- **Open a lead** to see all its details: **Call / WhatsApp / Email** buttons, the customer's answers, and private team notes.
- **Stay current:** the list refreshes itself every minute.

**Accounts.** Create a login (or reset a password) with:

```
npm run admin:create
```

It asks for the email, a name and a password (at least 10 characters, not shown while typing). Run it once per team
member; everyone shows up in the "Assigned to" list. Logins are signed with `SESSION_SECRET`, or, if it's not set, a key
derived from `DATABASE_URL`, so they survive restarts.

**Security.**
- **Passwords:** stored as scrypt hashes.
- **Login cookie:** signed, HttpOnly, SameSite=Lax, and Secure over HTTPS. It lasts 7 days.
- **Rate limit:** 10 login attempts per 15 minutes per IP.
- **Lead data:** every `/api/admin` call except login needs the cookie.
- **Search engines:** the page tells them not to index it.

### Leads from Meta ads

**Instant-form ads (lead forms).**
1. **Webhook:** in the App Dashboard → Webhooks → **Page**, set the callback URL to
   `https://<your-domain>/api/meta/webhook` with the same verify token as WhatsApp, and subscribe to **leadgen**.
2. **Connect the Page:** subscribe the app to the Page: `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` with a
   Page token.
3. **Token:** put a Page access token with `leads_retrieval` (best from a System User) in `META_PAGE_ACCESS_TOKEN`.
4. **Test:** use Meta's **Lead Ads Testing Tool** (developers.facebook.com/tools/lead-ads-testing). The test lead should
   appear in the dashboard within seconds.

Form questions are matched by name. Name, phone, email, a question containing "service", one containing "date", and
"city/location/venue" fill the matching columns. Any other answers go into "What they told us".

**Click-to-WhatsApp ads** need nothing extra: the WhatsApp webhook already receives the ad details.

**Ads that link to the website**: add URL parameters in Ads Manager so the campaign is recorded:

```
utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
```

`{{site_source_name}}` becomes `ig` or `fb`, so the lead shows as an Instagram Ad or a Facebook Ad.

## Viewing bookings

Open the Neon console → SQL Editor:

```sql
SELECT id, created_at, source, full_name, phone, service, event_date, event_location, party_size, notes
  FROM bookings
 ORDER BY created_at DESC;
```

`source` is `website` (booking form) or `whatsapp` (WhatsApp assistant). Databases set up before the WhatsApp assistant
get this column from `npm run db:setup`, which is safe to re-run.

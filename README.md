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
- **WhatsApp memory in the database:** each message can reach a different, freshly started instance, so the bot keeps
  every conversation in the `whatsapp_messages` and `whatsapp_chats` tables rather than in memory (see
  [WhatsApp bot](#whatsapp-bot)). `/api/health` shows `"whatsappMemory": "database"`.
- **Smaller install:** `.npmrc` stops onnxruntime from downloading ~500 MB of GPU libraries on Linux; the model runs on
  the CPU.
- **Rules for server code:** relative imports in `server/` end in `.js`, because Vercel runs these files as plain ES
  modules. Webhook work that continues after the response goes through `inBackground()` (`server/background.ts`).
- **Don't install inside `server/`:** locally, don't run `npm install` there. The server uses the project root's
  `node_modules`, and a second copy would take ~600 MB.

## WhatsApp bot

Deepika's virtual assistant also answers customers on WhatsApp. The conversation logic is in `server/whatsappBot.ts`
and the prompt in `server/llm.ts`. A number can be connected in two ways, and both can be on at once:

| Connection | Webhook | Settings | File |
|---|---|---|---|
| **Twilio** (the WhatsApp sandbox for testing, or a number bought from Twilio) | `/api/twilio/whatsapp` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | `server/routes/twilioWhatsapp.ts` |
| **Meta's Cloud API** (a number registered directly with Meta) | `/api/whatsapp/webhook` | the four `WHATSAPP_*` values | `server/routes/whatsapp.ts` |

**Pooja.** The assistant is *Pooja, Deepika's manager*: warm, natural and never pushy (the personality and the booking
journey are in `buildWhatsAppSystemPrompt`). The website's WhatsApp buttons open the chat with "Hi, I need makeup
services." ready to send. Every new conversation starts with her welcome and the enquiry form, word for word
(`WELCOME_MESSAGE` and `ENQUIRY_FORM` in `server/whatsappQuotes.ts`): event date, location (city & venue), event start
time, makeup ready / reporting time, how many need bridal, groom and non-bridal makeup, additional requirements, and
the number of events. To a plain hello or "I need makeup services" that's the whole reply; anything else the customer
said gets a short reply after it.

**The booking journey** (`server/whatsappBooking.ts`). The model handles the conversation; the form's completeness,
the artist, prices, the advance and the calendar are worked out in code.

1. **The form:** the customer answers in their own words, in one message or several. Pooja saves each answer
   (`save_enquiry`) on the customer's lead and asks for whatever is missing. A date or time counts only if the
   customer typed it. No prices before step 3.
2. **To the team:** once the form is complete, the customer gets "Our team will check your application and update
   you within two hours" word for word, and the enquiry shows under *Enquiries to approve* (and goes to the approval
   numbers on WhatsApp, below).
3. **The team's answer:** **Approve · send prices** in the lead's panel (or Approve on WhatsApp). The event's location
   decides the artist: a place in the Atlanta service area (Settings) gets Deepika herself, anywhere else (or a US
   state other than Georgia) one of her senior artists. The customer gets the news, a few words about Deepika or the
   reassurance about the senior artists, then that artist's quotations (bridal, non-bridal, groom, or the occasion's
   own), brochure pictures first if any are listed in `BROCHURES`. Occasions with no senior price list (engagement,
   house warming, half saree, party) are left for the team to quote, with a note on the lead. **Not available** tells
   the customer instead; a new date they send goes back to the team. Changing the date, place, times or number of
   people later also goes back to the team.
4. **Package and name:** the customer picks a package; Pooja saves it with the number of looks, then their full name
   and phone.
5. **Advance:** the payment message goes out word for word. It has the booking summary, the total, the 25%
   non-refundable advance and the balance, plus the payment details from Settings, and asks for the payment
   screenshot. For Deepika's own bookings the calendar is checked again first. Without payment details in Settings,
   Pooja passes the customer to Deepika instead.
6. **Screenshot:** a photo or PDF sent while the booking waits for the advance is saved as the payment proof. The
   customer is thanked word for word and the booking shows under *Payments to verify*. Nothing is marked paid
   automatically.
7. **Approval:** the team checks the payment in the lead's panel and clicks **Approve booking**. The booking becomes
   confirmed (lead stage *Confirmed*), its time stays taken on the calendar, and the customer gets the confirmation
   on WhatsApp. **Payment not received — ask again** sends them back to step 6 with a polite message. WhatsApp only
   delivers these within 24 hours of the customer's last message; the panel warns when that window has passed.

**Approving on WhatsApp** (`server/approvals.ts`). The approval numbers in Settings (e.g. Deepika's own WhatsApp) get,
from the assistant's number, each completed enquiry form (with where it is, the artist that means and Deepika's
calendar at that time) with **Approve** / **Not available** buttons, and each customer's first payment screenshot with
**Approve** / **Not received** buttons. A tap does the same as the dashboard's button. Typing `approve 105` / `reject
105` works too, for whatever that booking waits for. Messages from an approval number are never treated as a customer
chat. WhatsApp only allows this through Meta-approved templates: `server/scripts/create-approval-template.ts` creates
any that are missing in Twilio (Content API, `twilio/card`), submits them for approval and saves their IDs in the
`settings` table; run it again to see their approval status. The screenshot reaches WhatsApp through a signed link
that expires after 14 days (`/api/whatsapp/proof/…`). PDF receipts are approved in the dashboard only.

A time is held while the customer is asked to pay (24 hours), while their screenshot is checked, and once confirmed,
so two customers can't pay for the same time. Only Deepika's own bookings take her time; a senior artist's don't.

**Its own number (default).** The assistant has its own WhatsApp number, separate from Deepika's, and nobody reads those
chats. So for anything personal it gives Deepika's own WhatsApp links and phone, and when a customer asks for her, it
saves them as a lead in the dashboard so she can contact them. The other way to run it is **coexistence**
(`WHATSAPP_COEXISTENCE=true`), where the bot answers on Deepika's own number and she reads and replies in the same chats.
See [Going live with coexistence](#going-live-with-coexistence).

**Answers.** Every question is sent with the full business facts: all services with what's included, location and
service area, contact numbers, certification, pricing policy and the FAQ (`businessFacts()` in `server/knowledge.ts`).
It also gets the closest knowledge-base entries (looks, Instagram captions, reviews) and the customer's booking so far.
It never invents prices, policies, addresses or products, and leaves availability to the team's review. For anything
it doesn't know (trial sessions, discounts, studio address, brands…), it offers to pass the question to Deepika and
gives her direct WhatsApp. With coexistence it says she'll reply in the chat. It replies in the customer's language and
declines off-topic requests.

**Bookings in the database.** A WhatsApp booking is a row in the same `bookings` table as the website form
(`channel = 'whatsapp'`, the customer's WhatsApp number as `phone`), with the enquiry form's answers, artist, priced
items (`quote_items`), total, advance and `booking_status` (`enquiry_review` → `quoted` or `not_available` →
`awaiting_payment` → `payment_review` → `confirmed`). The form's makeup ready / reporting time is `event_time`, the
time the booking takes on the calendar. Screenshots are in `payment_proofs`.

**Each incoming message:**

- **Text, and taps on buttons:** answered after a human-like wait of 30 seconds (a short message like "hi") up to 55
  seconds (200+ characters), plus the few seconds Pooja takes to write, so about 30–60 seconds in all. The wait starts
  again from the customer's latest message, so several quick messages ("hi", "price for bridal?") get one reply. The
  customer sees blue ticks and "typing…" (shown again just before the reply). `WHATSAPP_REPLY_DELAY_SECONDS` changes it
  (default `30-55`; one number for a fixed wait, `0` for no wait). The thanks for a payment screenshot waits the same
  way. Through Meta, the first reply
  of a conversation carries three buttons: *Book appointment*, *Our services* and *Talk to Deepika*. Twilio needs
  approved content templates for buttons, so there the replies are plain text and customers just type.
- **Talk to Deepika:** the button, or asking for her in words, hands the customer over.
  - *Own number:* they're saved as a lead in the dashboard (channel WhatsApp), with a one-line note of the reason, and
    asking again adds to the same lead. Every WhatsApp lead's panel shows the whole chat with Pooja (latest 500
    messages). They also get Deepika's own WhatsApp and phone, and the bot keeps answering if they ask more.
  - *Coexistence:* the bot says Deepika will reply here and stays quiet in that chat for
    `WHATSAPP_HUMAN_TAKEOVER_HOURS` (default 12).
- **Payment screenshots:** see step 8 above. A photo or PDF from a customer whose booking waits for the advance is
  downloaded (Twilio: with the account credentials; Meta: through the Graph API) and kept for the team.
- **Other photos, videos, files and voice notes:** a short reply, at most every 30 minutes per chat. The bot can't see them,
  so it asks for them to be sent to Deepika's own WhatsApp; with coexistence it says she'll look at them. Voice notes
  also get a request to type the question. Stickers and reactions are ignored.
- **Old messages:** anything more than 10 minutes old (e.g. redelivered after downtime) is left for Deepika (Meta only;
  Twilio doesn't send the time).
- **Coexistence (Deepika's real number):** when she replies to a customer from the WhatsApp Business app, the bot stays
  quiet in that chat for `WHATSAPP_HUMAN_TAKEOVER_HOURS`.
- **Safety:** every webhook's signature is checked (Meta: the App secret; Twilio: the Auth Token, plus the account SID)
  and duplicates are ignored. Each customer gets at most 15 bot replies per 10 minutes. Logs show only the last 4
  digits of phone numbers.
- **Garbled names:** the model now and then writes a name in the wrong alphabet ("प्रियa"). Such a reply is written
  again before it's sent. A reply in Hindi script to a customer who writes Hindi or Hinglish is fine.

**Conversations are saved in the database** (`server/whatsappChats.ts`; tables `whatsapp_messages` and `whatsapp_chats`
from `npm run db:setup`). Every reply is written from the stored chat (the last 40 messages), so the bot remembers it
across restarts and across Vercel instances: it doesn't welcome the customer twice or ask again for details they gave.
**After 20 hours without messages, the next message starts a new conversation** (`NEW_CONVERSATION_AFTER_MS`): the
customer is welcomed again and Pooja sees only the new messages. An unfinished booking from before is still known: she
asks whether to continue it or book something new, and something new becomes a new booking (and lead). Older messages
stay saved and appear in the lead's chat in the dashboard.
The database also makes sure only one reply is written per chat at a time, and that a message redelivered to another
instance is answered once. Without `DATABASE_URL`, conversations are kept in memory and a restart forgets them. With
`gpt-5.4-mini`, WhatsApp and website chat replies run with `reasoning_effort: none`, because OpenAI's Chat Completions API
doesn't allow function tools (the calendar check) together with reasoning on that model. `OPENAI_TOOLS_REASONING_EFFORT` overrides this for other models.

### Testing with Twilio's WhatsApp sandbox

1. **Join the sandbox:** Twilio Console → Messaging → Try it out → *Send a WhatsApp message* (on a trial account the
   page is called **Try out WhatsApp**). From your phone, send the join message shown there (e.g. `join <two-words>`) to
   the number shown (classically **+1 415 523 8886**). Each tester joins once, and joins again after 3 days without
   messages.
2. **Settings:** put the Account SID and Auth Token (Console → Account info) in `.env` as `TWILIO_ACCOUNT_SID` and
   `TWILIO_AUTH_TOKEN`. Restart DMH API: the startup log should say `whatsapp: bot on via Twilio`.
3. **Public address:** run the tunnel to port 4000 (`ngrok http --url=<your-domain> 4000`). Opening
   `https://<your-domain>/api/twilio/whatsapp` in a browser should say the webhook is ready.
4. **Webhook:** in the sandbox's settings, set **When a message comes in** to
   `https://<your-domain>/api/twilio/whatsapp`, method **POST**, and save. On a trial account's **Try out WhatsApp**
   page: select **Inbound**, choose **Custom** under **Auto-Reply settings**, and add the same webhook. Leave the status
   callback empty: the bot asks for delivery reports itself. Until this is set, Twilio answers every message itself
   with "Standard auto-reply…".
5. **Try it:** send "Hi, I need makeup services." from the phone that joined. Pooja welcomes you with the enquiry form.

**Trial accounts can't send the bot's replies.** Twilio's trial only lets messages use `To`, `From`, `StatusCallback` and
a `ContentSid` pointing at one of Twilio's own templates ("You won't be able to write your own message"). TwiML replies
aren't supported either ([Twilio docs](https://www.twilio.com/docs/usage/trials/try-out-whatsapp)). So on a trial account
the bot receives messages, but Twilio refuses its answers, and the DMH API log shows `could not reply … Twilio 400 …`.
Upgrading the Twilio account (adding a payment method, which buying a number needs anyway) removes this limit. Until
then, the bot can be tested on Meta's test number (below).

Failed deliveries show in the DMH API log with what the error code means (e.g. 63015: that phone hasn't joined the
sandbox; 63016: outside WhatsApp's 24-hour window). Trial accounts have a low daily message limit.

**On Vercel:** add `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` to the API project. The simplest webhook is the API's own
address (`https://<api-domain>/api/twilio/whatsapp`). To use the website domain instead, also set `TWILIO_WEBHOOK_URL` to
exactly that URL, because Twilio signs the address it called and the API sees its own. Run `npm run db:setup` against
the API's database once, so the bot can save conversations there.

### Going live with a number bought from Twilio

1. **Buy a number** in Twilio (Phone Numbers → Buy a number) that isn't on WhatsApp yet.
2. **Register it as a WhatsApp sender:** Messaging → Senders → WhatsApp senders. This connects or creates the WhatsApp
   Business Account through Meta (display name, Facebook Business verification).
3. **Webhook:** on the sender, set **When a message comes in** to the same `/api/twilio/whatsapp` address.

No code or setting changes: the bot always replies from the number the customer wrote to. To answer only on the new
number (and not the sandbox), set `TWILIO_WHATSAPP_NUMBER` to it. Replies within 24 hours of a customer's message are
session messages.

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
| **WhatsApp chats** with Pooja | A lead (stage New) from the customer's first message, even if they only say hi or ask a price. The booking details she saves later fill in that lead, so it shows the service, date and payment as they come. One lead per customer: a new one only if they have none from the last 120 days that isn't lost (`saveChatLead` in `server/whatsappBot.ts`) | WhatsApp chat |

The dashboard lets you:

- **Filter:** by stage (New, Contacted, Confirmed, Lost, each with a count; approving a WhatsApp booking's payment moves it to Confirmed) and by source, or search by name, phone, email, campaign or place.
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

### Availability calendar (/admin/calendar)

The **Calendar** tab, next to **Leads**, is where Deepika or her team mark each day. The WhatsApp assistant and the
website chat read it every time a customer asks about a date (even one already discussed in the chat, since marks
change), and say whether it's free or booked only from these marks.

| Mark | What WhatsApp customers hear |
|---|---|
| **Free** / not marked | The date is open (and the time, unless it's taken) |
| **Few slots left** | Only a few slots are left that day |
| **Fully booked** | The date is booked, plus the nearest open dates |

**Times of day.** Select a day and tap its **booked hours** (4 AM–9 PM buttons; tap again to free one). Hours next to
each other join into one block (8, 9 and 10 AM → 8–11 AM), and a time with a note or not on the hour (7:30–10:00) can be
added below. WhatsApp bookings show on their own (green once approved, amber while waiting for the advance). A time is
free unless the day is Fully booked, a booked hour covers it, or one of Deepika's WhatsApp bookings overlaps it (each
takes the booking length from Settings, from its makeup ready / reporting time). An enquiry's panel, and its message to
the approval numbers, show whether that time is free; the website chat checks dates for visitors; and Pooja checks the
time again before asking for the advance. **Fully booked** is for a whole day that's gone. Blocks are stored in
`calendar_blocks`.

- **Mark days:** click a day, then choose a mark. *Select several days* (or Ctrl/⌘-click, or Shift-click for a range)
  marks many at once. *Clear mark* makes a day open again. Past days can't be changed. After a mark is saved, the next
  click starts a new selection, so the day just marked is never changed again along with the next one.
- **Team note:** a marked day can carry a private note (e.g. "Priya's wedding, ready by 7 am"). Customers never see it.
- **Leads on each day:** each day shows how many leads have their event then, and clicking it lists them with their
  stage, so you can see what's already requested before marking a day full.

Days are stored in the `availability` table (one row per marked day). "Today" follows Atlanta time, as the bot does.
Run `npm run db:setup` once to create the table on a new database.

### Settings (/admin/settings)

Booking settings the team can change without a redeploy (stored in the `settings` table):

- **Payment details:** sent word for word in the advance request (e.g. `Zelle: +1 980-497-7720 (Deepika S)`). Until
  it's filled in, Pooja can't ask for the advance and passes those customers to Deepika.
- **Booking length:** how long one booking takes on the calendar (default 2 hours).
- **Approve on WhatsApp:** the numbers that get each enquiry and payment screenshot to approve with a tap.
- **Atlanta service area:** cities, towns and neighbourhoods (default: Atlanta, its neighbourhoods and the cities of
  metro Atlanta). An enquiry whose location names one of them gets Deepika herself and her prices; anywhere else, or
  a US state other than Georgia, a senior artist and theirs. Customers are never asked for a ZIP code.

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

/**
 * Where the WhatsApp assistant keeps its conversations (server/whatsappBot.ts).
 *
 * With a database (DATABASE_URL), every message is saved in `whatsapp_messages` and each customer's chat details in
 * `whatsapp_chats` (see schema.sql). That is what lets the assistant remember a chat on Vercel, where each message
 * can reach a different, freshly started server instance with empty memory. The database also makes sure two
 * instances never answer the same chat at once, and that a message delivered twice is answered once.
 *
 * Without a database the same is kept in memory, which lasts only while this server process runs.
 */
import crypto from 'node:crypto';
import type { Artist } from '../src/data/bookingFlow.js';
import type { ChatMessage } from './assistant.js';
import { pool } from './db.js';

export interface ChatInfo {
  profileName?: string;
  /** 'instagram_ad' or 'facebook_ad' when the chat started from a click-to-WhatsApp ad. */
  adSource?: string;
  /** The assistant stays quiet in this chat until then (ms since 1970), because Deepika is handling it. */
  pausedUntil: number;
  /** Whose prices the last quotation in this chat showed. */
  quotedArtist?: Artist;
  /** The connection the chat came in on ('meta' or 'twilio'), and for Twilio the business number they wrote to. */
  transport?: string;
  businessNumber?: string;
}

/** How a chat came in, so the team can message the customer later (e.g. the booking confirmation). */
export interface ChatConnection {
  transport: string;
  businessNumber?: string;
}

export interface WaitingMessage {
  id: number;
  content: string;
  /** When it arrived (ms since 1970). */
  at: number;
}

export interface Conversation {
  chat: ChatInfo;
  /** The latest messages that are settled (answered, or kept only as context), oldest first, with when each was saved. */
  history: (ChatMessage & { at: number })[];
  /** Customer messages still waiting for a reply, oldest first. */
  waiting: WaitingMessage[];
  /** Replies sent in this chat in the last 10 minutes. */
  recentReplies: number;
}

export interface ChatStore {
  /** Creates the chat on its first message, or notes the customer's latest profile name, ad and connection. */
  touch(waId: string, update: { profileName?: string; adSource?: string; connection?: ChatConnection }): Promise<ChatInfo>;
  /** The chat's details, or null if this customer never wrote. */
  info(waId: string): Promise<ChatInfo | null>;
  /** Notes whose prices the latest quotation showed (null: none in this conversation yet). */
  setQuotedArtist(waId: string, artist: Artist | null): Promise<void>;
  /**
   * Saves a customer message: `waiting` ones need a reply, the others are only context (e.g. while Deepika is
   * handling the chat). Returns the message's number, or null if this message ID was saved before (a redelivery).
   */
  addCustomerMessage(waId: string, content: string, opts: { messageId?: string; waiting: boolean }): Promise<number | null>;
  /** Saves a reply (the assistant's, or Deepika's from her phone) and settles the customer messages it answered. */
  addReply(waId: string, content: string, answered: number[], messageId?: string): Promise<void>;
  /** Keeps waiting customer messages as context without replying to them (all of them if `ids` is left out). */
  settle(waId: string, ids?: number[]): Promise<void>;
  /** The chat, its latest `limit` settled messages and the messages waiting for a reply. */
  conversation(waId: string, limit: number): Promise<Conversation>;
  pausedUntil(waId: string): Promise<number>;
  /** The assistant stays quiet until `until`; waiting messages are kept as context. */
  pause(waId: string, until: number): Promise<void>;
  /** True (and noted) if the last photo/voice note acknowledgement in this chat was at least `everyMs` ago. */
  claimMediaAck(waId: string, everyMs: number): Promise<boolean>;
  /** Only one reply is written per chat at a time: returns a token to release it with, or null if busy. */
  claimReplying(waId: string, forMs: number): Promise<string | null>;
  releaseReplying(waId: string, token: string): Promise<void>;
}

// ---------- In the database ----------

const ms = (value: Date | null | undefined) => (value ? value.getTime() : 0);

interface ChatRow {
  profile_name: string | null;
  ad_source: string | null;
  paused_until: Date | null;
  quoted_artist: Artist | null;
  transport: string | null;
  business_number: string | null;
}

const CHAT_COLUMNS = 'profile_name, ad_source, paused_until, quoted_artist, transport, business_number';

const chatInfo = (row: ChatRow | undefined): ChatInfo => ({
  profileName: row?.profile_name ?? undefined,
  adSource: row?.ad_source ?? undefined,
  pausedUntil: ms(row?.paused_until),
  quotedArtist: row?.quoted_artist ?? undefined,
  transport: row?.transport ?? undefined,
  businessNumber: row?.business_number ?? undefined,
});

function databaseStore(db: NonNullable<typeof pool>): ChatStore {
  return {
    async touch(waId, { profileName, adSource, connection }) {
      const { rows } = await db.query<ChatRow>(
        `INSERT INTO whatsapp_chats (wa_id, profile_name, ad_source, transport, business_number) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (wa_id) DO UPDATE
            SET profile_name = coalesce(excluded.profile_name, whatsapp_chats.profile_name),
                ad_source = coalesce(excluded.ad_source, whatsapp_chats.ad_source),
                transport = coalesce(excluded.transport, whatsapp_chats.transport),
                business_number = coalesce(excluded.business_number, whatsapp_chats.business_number),
                last_message_at = now()
         RETURNING ${CHAT_COLUMNS}`,
        [waId, profileName || null, adSource || null, connection?.transport ?? null, connection?.businessNumber ?? null],
      );
      return chatInfo(rows[0]);
    },

    async info(waId) {
      const { rows } = await db.query<ChatRow>(`SELECT ${CHAT_COLUMNS} FROM whatsapp_chats WHERE wa_id = $1`, [waId]);
      return rows[0] ? chatInfo(rows[0]) : null;
    },

    async setQuotedArtist(waId, artist) {
      await db.query('UPDATE whatsapp_chats SET quoted_artist = $2 WHERE wa_id = $1', [waId, artist]);
    },

    async addCustomerMessage(waId, content, { messageId, waiting }) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO whatsapp_messages (wa_id, role, content, message_id, turn_at)
         VALUES ($1, 'user', $2, $3, CASE WHEN $4::boolean THEN NULL ELSE clock_timestamp() END)
         ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [waId, content, messageId || null, waiting],
      );
      return rows[0] ? Number(rows[0].id) : null;
    },

    async addReply(waId, content, answered, messageId) {
      // The answered messages take the reply's time, and the reply comes just after them
      await db.query(
        `WITH t AS (SELECT clock_timestamp() AS at),
         answered AS (
           UPDATE whatsapp_messages SET turn_at = (SELECT at FROM t)
            WHERE wa_id = $1 AND id = ANY($3::bigint[]) AND turn_at IS NULL
         )
         INSERT INTO whatsapp_messages (wa_id, role, content, message_id, turn_at)
         SELECT $1, 'assistant', $2, $4, at + interval '1 microsecond' FROM t
         ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING`,
        [waId, content, answered, messageId || null],
      );
    },

    async settle(waId, ids) {
      await db.query(
        `UPDATE whatsapp_messages SET turn_at = clock_timestamp()
          WHERE wa_id = $1 AND turn_at IS NULL AND ($2::bigint[] IS NULL OR id = ANY($2::bigint[]))`,
        [waId, ids ?? null],
      );
    },

    async conversation(waId, limit) {
      const [messages, chat] = await Promise.all([
        db.query<{ id: string; role: 'user' | 'assistant'; content: string; waiting: boolean; created_at: Date }>(
          `SELECT id, role, content, turn_at IS NULL AS waiting, created_at FROM (
             (SELECT id, role, content, turn_at, created_at FROM whatsapp_messages
               WHERE wa_id = $1 AND turn_at IS NOT NULL ORDER BY turn_at DESC, id DESC LIMIT $2)
             UNION ALL
             (SELECT id, role, content, turn_at, created_at FROM whatsapp_messages
               WHERE wa_id = $1 AND turn_at IS NULL ORDER BY id DESC LIMIT 20)
           ) m
           ORDER BY turn_at ASC NULLS LAST, id ASC`,
          [waId, limit],
        ),
        db.query<ChatRow & { recent_replies: number }>(
          `SELECT ${CHAT_COLUMNS},
                  (SELECT count(*)::int FROM whatsapp_messages m
                    WHERE m.wa_id = c.wa_id AND m.role = 'assistant' AND m.created_at > now() - interval '10 minutes') AS recent_replies
             FROM whatsapp_chats c WHERE wa_id = $1`,
          [waId],
        ),
      ]);
      return {
        chat: chatInfo(chat.rows[0]),
        history: messages.rows.filter((m) => !m.waiting).map(({ role, content, created_at }) => ({ role, content, at: created_at.getTime() })),
        waiting: messages.rows.filter((m) => m.waiting).map(({ id, content, created_at }) => ({ id: Number(id), content, at: created_at.getTime() })),
        recentReplies: chat.rows[0]?.recent_replies ?? 0,
      };
    },

    async pausedUntil(waId) {
      const { rows } = await db.query<ChatRow>(`SELECT paused_until FROM whatsapp_chats WHERE wa_id = $1`, [waId]);
      return ms(rows[0]?.paused_until);
    },

    async pause(waId, until) {
      await db.query(
        `INSERT INTO whatsapp_chats (wa_id, paused_until) VALUES ($1, $2)
         ON CONFLICT (wa_id) DO UPDATE SET paused_until = excluded.paused_until`,
        [waId, new Date(until)],
      );
      await this.settle(waId);
    },

    async claimMediaAck(waId, everyMs) {
      const { rowCount } = await db.query(
        `UPDATE whatsapp_chats SET last_media_ack = now()
          WHERE wa_id = $1 AND (last_media_ack IS NULL OR last_media_ack <= now() - $2 * interval '1 millisecond')`,
        [waId, everyMs],
      );
      return Boolean(rowCount);
    },

    async claimReplying(waId, forMs) {
      const token = crypto.randomUUID();
      const { rowCount } = await db.query(
        `INSERT INTO whatsapp_chats (wa_id, replying_until, replying_token)
         VALUES ($1, now() + $2 * interval '1 millisecond', $3)
         ON CONFLICT (wa_id) DO UPDATE
            SET replying_until = excluded.replying_until, replying_token = excluded.replying_token
          WHERE whatsapp_chats.replying_until IS NULL OR whatsapp_chats.replying_until < now()`,
        [waId, forMs, token],
      );
      return rowCount ? token : null;
    },

    async releaseReplying(waId, token) {
      await db.query(
        `UPDATE whatsapp_chats SET replying_until = NULL, replying_token = NULL WHERE wa_id = $1 AND replying_token = $2`,
        [waId, token],
      );
    },
  };
}

// ---------- In memory (no database) ----------

interface MemoryMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  messageId?: string;
  /** Place in the conversation; null while waiting for a reply. */
  turn: number | null;
  at: number;
}

interface MemoryChat {
  info: ChatInfo;
  messages: MemoryMessage[];
  lastMediaAck: number;
  replying?: { token: string; until: number };
  lastMessageAt: number;
}

/** Settled messages kept per chat in memory. */
const MEMORY_MESSAGES = 60;
const FORGET_AFTER_MS = 24 * 3_600_000;

function memoryStore(): ChatStore {
  const chats = new Map<string, MemoryChat>();
  let nextId = 1;
  let nextTurn = 1;

  const chatFor = (waId: string) => {
    let c = chats.get(waId);
    if (!c) {
      c = { info: { pausedUntil: 0 }, messages: [], lastMediaAck: 0, lastMessageAt: Date.now() };
      chats.set(waId, c);
    }
    return c;
  };
  const add = (c: MemoryChat, m: Omit<MemoryMessage, 'id' | 'at'>) => {
    const message = { ...m, id: nextId++, at: Date.now() };
    c.messages.push(message);
    const settled = c.messages.filter((x) => x.turn !== null);
    if (settled.length > MEMORY_MESSAGES) {
      const drop = new Set(settled.slice(0, settled.length - MEMORY_MESSAGES));
      c.messages = c.messages.filter((x) => !drop.has(x));
    }
    return message;
  };
  const isDuplicate = (c: MemoryChat, messageId?: string) => Boolean(messageId && c.messages.some((m) => m.messageId === messageId));

  setInterval(() => {
    const now = Date.now();
    for (const [waId, c] of chats) {
      const waiting = c.messages.some((m) => m.turn === null);
      if (now - c.lastMessageAt > FORGET_AFTER_MS && c.info.pausedUntil < now && !c.replying && !waiting) chats.delete(waId);
    }
  }, 30 * 60_000).unref();

  return {
    async touch(waId, { profileName, adSource, connection }) {
      const c = chatFor(waId);
      c.lastMessageAt = Date.now();
      if (profileName) c.info.profileName = profileName;
      if (adSource) c.info.adSource = adSource;
      if (connection) Object.assign(c.info, { transport: connection.transport, businessNumber: connection.businessNumber ?? c.info.businessNumber });
      return { ...c.info };
    },
    async info(waId) {
      const c = chats.get(waId);
      return c ? { ...c.info } : null;
    },
    async setQuotedArtist(waId, artist) {
      chatFor(waId).info.quotedArtist = artist ?? undefined;
    },
    async addCustomerMessage(waId, content, { messageId, waiting }) {
      const c = chatFor(waId);
      if (isDuplicate(c, messageId)) return null;
      return add(c, { role: 'user', content, messageId, turn: waiting ? null : nextTurn++ }).id;
    },
    async addReply(waId, content, answered, messageId) {
      const c = chatFor(waId);
      if (isDuplicate(c, messageId)) return;
      const turn = nextTurn++;
      for (const m of c.messages) if (m.turn === null && answered.includes(m.id)) m.turn = turn;
      add(c, { role: 'assistant', content, messageId, turn: nextTurn++ });
    },
    async settle(waId, ids) {
      const turn = nextTurn++;
      for (const m of chatFor(waId).messages) if (m.turn === null && (!ids || ids.includes(m.id))) m.turn = turn;
    },
    async conversation(waId, limit) {
      const c = chatFor(waId);
      const settled = c.messages.filter((m) => m.turn !== null).sort((a, b) => a.turn! - b.turn! || a.id - b.id);
      const now = Date.now();
      return {
        chat: { ...c.info },
        history: settled.slice(-limit).map(({ role, content, at }) => ({ role, content, at })),
        waiting: c.messages.filter((m) => m.turn === null).slice(-20).map(({ id, content, at }) => ({ id, content, at })),
        recentReplies: c.messages.filter((m) => m.role === 'assistant' && now - m.at < 10 * 60_000).length,
      };
    },
    async pausedUntil(waId) {
      return chatFor(waId).info.pausedUntil;
    },
    async pause(waId, until) {
      chatFor(waId).info.pausedUntil = until;
      await this.settle(waId);
    },
    async claimMediaAck(waId, everyMs) {
      const c = chatFor(waId);
      if (Date.now() - c.lastMediaAck < everyMs) return false;
      c.lastMediaAck = Date.now();
      return true;
    },
    async claimReplying(waId, forMs) {
      const c = chatFor(waId);
      if (c.replying && c.replying.until > Date.now()) return null;
      c.replying = { token: crypto.randomUUID(), until: Date.now() + forMs };
      return c.replying.token;
    },
    async releaseReplying(waId, token) {
      const c = chatFor(waId);
      if (c.replying?.token === token) c.replying = undefined;
    },
  };
}

export const chatStore: ChatStore = pool ? databaseStore(pool) : memoryStore();
export const chatStorage = pool ? 'database' : 'memory';

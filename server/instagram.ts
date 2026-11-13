/**
 * Turns an official Instagram data export (JSON format) into RAG knowledge chunks.
 *
 * How to get the export (account owner, ~5 minutes + Instagram's processing time):
 *   Instagram app → Settings → Accounts Center → Your information and permissions
 *   → Download your information → choose the Instagram account → "Some of your information":
 *   tick "Content" (posts, reels) and "Personal information" → Format: JSON → Media quality: Low.
 * Unzip it into data/instagram/ and run `npm run db:ingest`.
 *
 * Only captions and the public profile (name, bio, website) are used. Private fields in the
 * export (email, phone number, date of birth, messages, etc.) are never read.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeChunk } from './knowledge.js';

export const INSTAGRAM_EXPORT_DIR = path.resolve(import.meta.dirname, '..', 'data', 'instagram');

/** Captions shorter than this (after removing hashtags) carry too little to answer questions. */
const MIN_CAPTION_CHARS = 25;
/** Long captions are split into pieces of about this size so each embedding stays focused. */
const MAX_CHUNK_CHARS = 700;

interface ExportMedia {
  creation_timestamp?: number;
  title?: string;
}
interface ExportPost {
  media?: ExportMedia[];
  title?: string;
  creation_timestamp?: number;
}

export interface InstagramImport {
  chunks: KnowledgeChunk[];
  stats: { posts: number; reels: number; skipped: number; profile: boolean };
}

/**
 * Meta exports write UTF-8 text as Latin-1 code points, so "’" arrives as "â€™" and
 * emoji as garbage. Re-decode when the string looks like that.
 */
export function fixEncoding(text: string): string {
  if (!/[\u0080-ÿ]/.test(text) || /[^\u0000-ÿ]/.test(text)) return text;
  const decoded = Buffer.from(text, 'latin1').toString('utf8');
  return decoded.includes('�') ? text : decoded;
}

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

function cleanCaption(raw: string): { text: string; hashtags: string[] } {
  const fixed = fixEncoding(raw);
  const hashtags = (fixed.match(HASHTAG_RE) ?? []).map((h) => h.slice(1));
  const text = fixed
    .replace(HASHTAG_RE, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !/^[.\-_•·]+$/.test(line)) // drop Instagram "spacer" lines
    .join('\n')
    .trim();
  return { text, hashtags };
}

/** Splits on line breaks, packing lines into pieces of at most MAX_CHUNK_CHARS. */
function splitText(text: string): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current && current.length + line.length + 1 > MAX_CHUNK_CHARS) {
      pieces.push(current);
      current = '';
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) pieces.push(current);
  return pieces;
}

function formatMonth(unixSeconds?: number): string {
  if (!unixSeconds) return 'date unknown';
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function findFiles(dir: string, match: (name: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'media') found.push(...findFiles(full, match)); // skip photo/video folders
    } else if (match(entry.name)) {
      found.push(full);
    }
  }
  return found.sort();
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readProfile(dir: string): KnowledgeChunk | null {
  const file = findFiles(dir, (n) => n === 'personal_information.json')[0];
  if (!file) return null;
  const data = readJson(file) as {
    profile_user?: { string_map_data?: Record<string, { value?: string }> }[];
  };
  const fields = data.profile_user?.[0]?.string_map_data ?? {};
  const pick = (...keys: string[]) => {
    for (const [k, v] of Object.entries(fields)) {
      if (keys.includes(k.toLowerCase()) && v?.value) return fixEncoding(v.value).trim();
    }
    return '';
  };
  // Public profile fields only — never email, phone, or date of birth.
  const name = pick('name');
  const bio = pick('bio', 'biography');
  const website = pick('website');
  if (!bio) return null;
  return {
    id: 'ig-profile',
    source: 'instagram',
    title: `Instagram profile${name ? ` — ${name}` : ''}`,
    content: [name && `${name} on Instagram`, bio, website && `Website: ${website}`]
      .filter(Boolean)
      .join('. '),
  };
}

export function loadInstagramKnowledge(dir = INSTAGRAM_EXPORT_DIR): InstagramImport | null {
  if (!fs.existsSync(dir)) return null;

  const jsonFiles = findFiles(dir, (n) => /^posts_\d+\.json$/.test(n) || n === 'reels.json');
  if (jsonFiles.length === 0) {
    if (findFiles(dir, (n) => /^posts_\d+\.html$/.test(n)).length > 0) {
      throw new Error(
        `The Instagram export in ${dir} is in HTML format. Download it again with Format: JSON.`,
      );
    }
    return null; // folder exists but no export has been added yet
  }

  const chunks: KnowledgeChunk[] = [];
  const stats = { posts: 0, reels: 0, skipped: 0, profile: false };
  const seenCaptions = new Set<string>();
  const usedIds = new Set<string>();

  const profile = readProfile(dir);
  if (profile) {
    chunks.push(profile);
    usedIds.add(profile.id);
    stats.profile = true;
  }

  const addPost = (post: ExportPost, kind: 'post' | 'reel') => {
    const raw = post.title || post.media?.find((m) => m.title)?.title || '';
    const timestamp = post.creation_timestamp ?? post.media?.[0]?.creation_timestamp;
    const { text, hashtags } = cleanCaption(raw);
    const key = text.toLowerCase();
    if (text.length < MIN_CAPTION_CHARS || seenCaptions.has(key)) {
      stats.skipped++;
      return;
    }
    seenCaptions.add(key);
    stats[kind === 'post' ? 'posts' : 'reels']++;

    const label = kind === 'post' ? 'Instagram post' : 'Instagram reel';
    const month = formatMonth(timestamp);
    const tagWords = hashtags.join(' ');
    splitText(text).forEach((piece, i) => {
      let id = `ig-${kind}-${timestamp ?? 'na'}-${i + 1}`;
      for (let n = 2; usedIds.has(id); n++) id = `ig-${kind}-${timestamp ?? 'na'}-${i + 1}-${n}`;
      usedIds.add(id);
      chunks.push({
        id,
        source: 'instagram',
        title: `${label} · ${month}`,
        content: `${label} (${month}): ${piece}`,
        // Hashtags (e.g. #telugubride) help matching, but are kept out of the shown answer.
        embedText: tagWords ? `${piece}\n${tagWords}` : piece,
      });
    });
  };

  for (const file of jsonFiles) {
    const data = readJson(file);
    if (path.basename(file) === 'reels.json') {
      const reels = (data as { ig_reels_media?: ExportPost[] }).ig_reels_media ?? [];
      reels.forEach((r) => addPost(r, 'reel'));
    } else if (Array.isArray(data)) {
      (data as ExportPost[]).forEach((p) => addPost(p, 'post'));
    }
  }

  return { chunks, stats };
}

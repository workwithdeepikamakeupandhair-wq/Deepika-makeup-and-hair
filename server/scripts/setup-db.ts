import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, pool } from '../db.js';

const sql = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'schema.sql'), 'utf8');

try {
  await getDb().query(sql);
  console.log('Database ready: pgvector enabled, tables "bookings" and "knowledge_chunks" created.');
} catch (err) {
  console.error('Database setup failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
